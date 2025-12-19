/**
 * DAOFactory Tests
 * Tests for the DAO factory contract that deploys complete DAO systems
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther, zeroAddress } from "viem";

import {
  deployFactoryFixture,
  createDAOFixture,
  DEFAULT_DAO_PARAMS,
  ZERO_ADDRESS,
  TIMELOCK_MIN_DELAY,
  calculateCreatorAmount,
  calculateTreasuryAmount,
} from "./helpers/index.js";

describe("DAOFactory", function () {
  // ============ Deployment Tests ============

  describe("Deployment", function () {
    it("Should deploy factory with correct implementation addresses", async function () {
      const { factory } = await deployFactoryFixture();

      const tokenImpl = await factory.read.tokenImplementation();
      const governorImpl = await factory.read.governorImplementation();

      // Implementation addresses should be non-zero
      assert.notEqual(tokenImpl, ZERO_ADDRESS, "Token implementation should be set");
      assert.notEqual(governorImpl, ZERO_ADDRESS, "Governor implementation should be set");
    });

    it("Should have correct constant values", async function () {
      const { factory } = await deployFactoryFixture();

      const timelockDelay = await factory.read.TIMELOCK_MIN_DELAY();
      const creatorPercent = await factory.read.CREATOR_ALLOCATION_PERCENT();

      assert.equal(timelockDelay, TIMELOCK_MIN_DELAY, "Timelock delay should be 1 day");
      assert.equal(creatorPercent, 1n, "Creator allocation should be 1%");
    });

    it("Should start with zero deployed DAOs", async function () {
      const { factory } = await deployFactoryFixture();

      const daoCount = await factory.read.getDAOCount();
      assert.equal(daoCount, 0n, "Should have no DAOs initially");
    });
  });

  // ============ Input Validation Tests ============

  describe("Input Validation", function () {
    it("Should revert with zero total supply", async function () {
      const { factory, viem, creator } = await deployFactoryFixture();

      const invalidParams = {
        ...DEFAULT_DAO_PARAMS,
        totalSupply: 0n,
      };

      await viem.assertions.revertWithCustomError(
        factory.write.createDAO([invalidParams], { account: creator.account }),
        factory,
        "InvalidTotalSupply"
      );
    });

    it("Should revert with empty DAO name", async function () {
      const { factory, viem, creator } = await deployFactoryFixture();

      const invalidParams = {
        ...DEFAULT_DAO_PARAMS,
        daoName: "",
      };

      await viem.assertions.revertWithCustomError(
        factory.write.createDAO([invalidParams], { account: creator.account }),
        factory,
        "EmptyDAOName"
      );
    });

    it("Should revert with empty token name", async function () {
      const { factory, viem, creator } = await deployFactoryFixture();

      const invalidParams = {
        ...DEFAULT_DAO_PARAMS,
        tokenName: "",
      };

      await viem.assertions.revertWithCustomError(
        factory.write.createDAO([invalidParams], { account: creator.account }),
        factory,
        "EmptyTokenName"
      );
    });

    it("Should revert with empty token symbol", async function () {
      const { factory, viem, creator } = await deployFactoryFixture();

      const invalidParams = {
        ...DEFAULT_DAO_PARAMS,
        tokenSymbol: "",
      };

      await viem.assertions.revertWithCustomError(
        factory.write.createDAO([invalidParams], { account: creator.account }),
        factory,
        "EmptyTokenSymbol"
      );
    });

    it("Should revert with zero voting period", async function () {
      const { factory, viem, creator } = await deployFactoryFixture();

      const invalidParams = {
        ...DEFAULT_DAO_PARAMS,
        votingPeriod: 0n,
      };

      await viem.assertions.revertWithCustomError(
        factory.write.createDAO([invalidParams], { account: creator.account }),
        factory,
        "InvalidVotingPeriod"
      );
    });
  });

  // ============ DAO Creation Tests ============

  describe("DAO Creation", function () {
    it("Should emit DAOCreated event with correct parameters", async function () {
      const { factory, viem, publicClient, creator } = await deployFactoryFixture();

      const hash = await factory.write.createDAO([DEFAULT_DAO_PARAMS], {
        account: creator.account,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Find and parse DAOCreated event
      const events = await publicClient.getContractEvents({
        address: factory.address,
        abi: factory.abi,
        eventName: "DAOCreated",
        fromBlock: receipt.blockNumber,
        toBlock: receipt.blockNumber,
      });

      assert.equal(events.length, 1, "Should emit exactly one DAOCreated event");

      const event = events[0];
      assert.equal(event.args.creator?.toLowerCase(), creator.account.address.toLowerCase());
      assert.equal(event.args.daoName, DEFAULT_DAO_PARAMS.daoName);
      assert.equal(event.args.tokenName, DEFAULT_DAO_PARAMS.tokenName);
      assert.equal(event.args.tokenSymbol, DEFAULT_DAO_PARAMS.tokenSymbol);
      assert.equal(event.args.totalSupply, DEFAULT_DAO_PARAMS.totalSupply);
    });

    it("Should deploy token with correct configuration", async function () {
      const { token, params } = await createDAOFixture();

      const name = await token.read.name();
      const symbol = await token.read.symbol();
      const totalSupply = await token.read.totalSupply();
      const decimals = await token.read.decimals();

      assert.equal(name, params.tokenName, "Token name should match");
      assert.equal(symbol, params.tokenSymbol, "Token symbol should match");
      assert.equal(totalSupply, params.totalSupply, "Total supply should match");
      assert.equal(decimals, 18, "Decimals should be 18");
    });

    it("Should deploy governor with correct configuration", async function () {
      const { governor, token, timelock, params, creatorAmount } = await createDAOFixture();

      const governorName = await governor.read.name();
      const votingDelay = await governor.read.votingDelay();
      const votingPeriod = await governor.read.votingPeriod();
      const proposalThreshold = await governor.read.proposalThreshold();

      assert.equal(governorName, params.daoName, "Governor name should match DAO name");
      assert.equal(votingDelay, params.votingDelay, "Voting delay should match");
      assert.equal(votingPeriod, params.votingPeriod, "Voting period should match");
      assert.equal(proposalThreshold, creatorAmount, "Proposal threshold should be 1% of supply");
    });

    it("Should deploy timelock with correct configuration", async function () {
      const { timelock } = await createDAOFixture();

      const minDelay = await timelock.read.getMinDelay();
      assert.equal(minDelay, TIMELOCK_MIN_DELAY, "Timelock min delay should be 1 day");
    });
  });

  // ============ Token Distribution Tests ============

  describe("Token Distribution", function () {
    it("Should distribute 1% to creator", async function () {
      const { token, creator, creatorAmount, params } = await createDAOFixture();

      const creatorBalance = await token.read.balanceOf([creator.account.address]);
      const expectedAmount = calculateCreatorAmount(params.totalSupply);

      assert.equal(creatorBalance, expectedAmount, "Creator should receive 1% of supply");
      assert.equal(creatorBalance, creatorAmount, "Creator amount should match calculated");
    });

    it("Should distribute 99% to treasury (timelock)", async function () {
      const { token, timelock, treasuryAmount, params } = await createDAOFixture();

      const treasuryBalance = await token.read.balanceOf([timelock.address]);
      const expectedAmount = calculateTreasuryAmount(params.totalSupply);

      assert.equal(treasuryBalance, expectedAmount, "Treasury should receive 99% of supply");
      assert.equal(treasuryBalance, treasuryAmount, "Treasury amount should match calculated");
    });

    it("Should not leave any tokens in the factory", async function () {
      const { token, factory } = await createDAOFixture();

      const factoryBalance = await token.read.balanceOf([factory.address]);
      assert.equal(factoryBalance, 0n, "Factory should have no tokens left");
    });

    it("Should have correct total distribution (creator + treasury = total)", async function () {
      const { token, creator, timelock, params } = await createDAOFixture();

      const creatorBalance = await token.read.balanceOf([creator.account.address]);
      const treasuryBalance = await token.read.balanceOf([timelock.address]);
      const total = creatorBalance + treasuryBalance;

      assert.equal(total, params.totalSupply, "Total distributed should equal total supply");
    });
  });

  // ============ Role Configuration Tests ============

  describe("Role Configuration", function () {
    it("Should grant PROPOSER_ROLE to governor", async function () {
      const { timelock, governor } = await createDAOFixture();

      const proposerRole = await timelock.read.PROPOSER_ROLE();
      const hasRole = await timelock.read.hasRole([proposerRole, governor.address]);

      assert.equal(hasRole, true, "Governor should have PROPOSER_ROLE");
    });

    it("Should grant CANCELLER_ROLE to governor", async function () {
      const { timelock, governor } = await createDAOFixture();

      const cancellerRole = await timelock.read.CANCELLER_ROLE();
      const hasRole = await timelock.read.hasRole([cancellerRole, governor.address]);

      assert.equal(hasRole, true, "Governor should have CANCELLER_ROLE");
    });

    it("Should revoke ADMIN_ROLE from factory", async function () {
      const { timelock, factory } = await createDAOFixture();

      const adminRole = await timelock.read.DEFAULT_ADMIN_ROLE();
      const hasRole = await timelock.read.hasRole([adminRole, factory.address]);

      assert.equal(hasRole, false, "Factory should not have ADMIN_ROLE");
    });

    it("Should allow anyone to execute (executor is address(0))", async function () {
      const { timelock } = await createDAOFixture();

      const executorRole = await timelock.read.EXECUTOR_ROLE();
      const hasRole = await timelock.read.hasRole([executorRole, ZERO_ADDRESS]);

      assert.equal(hasRole, true, "Address(0) should have EXECUTOR_ROLE (anyone can execute)");
    });
  });

  // ============ DAO Tracking Tests ============

  describe("DAO Tracking", function () {
    it("Should increment DAO count after creation", async function () {
      const { factory, creator } = await deployFactoryFixture();

      const countBefore = await factory.read.getDAOCount();
      await factory.write.createDAO([DEFAULT_DAO_PARAMS], { account: creator.account });
      const countAfter = await factory.read.getDAOCount();

      assert.equal(countAfter, countBefore + 1n, "DAO count should increment");
    });

    it("Should return correct DAO info by index", async function () {
      const { factory, addresses, params, creator } = await createDAOFixture();

      const daoInfo = await factory.read.getDAO([0n]);

      assert.equal(daoInfo.token, addresses.token, "Token address should match");
      assert.equal(daoInfo.timelock, addresses.timelock, "Timelock address should match");
      assert.equal(daoInfo.governor, addresses.governor, "Governor address should match");
      assert.equal(daoInfo.creator.toLowerCase(), creator.account.address.toLowerCase(), "Creator should match");
      assert.equal(daoInfo.daoName, params.daoName, "DAO name should match");
    });

    it("Should track DAOs by creator", async function () {
      const { factory, creator, addresses } = await createDAOFixture();

      const creatorDAOs = await factory.read.getDAOsByCreator([creator.account.address]);

      assert.equal(creatorDAOs.length, 1, "Creator should have 1 DAO");
      assert.equal(creatorDAOs[0].token, addresses.token, "DAO token should match");
    });

    it("Should revert when accessing invalid index", async function () {
      const { factory, viem } = await createDAOFixture();

      await viem.assertions.revertWithCustomError(
        factory.read.getDAO([999n]),
        factory,
        "IndexOutOfBounds"
      );
    });

    it("Should allow multiple DAOs from same creator", async function () {
      const { factory, creator } = await deployFactoryFixture();

      // Create first DAO
      await factory.write.createDAO([DEFAULT_DAO_PARAMS], { account: creator.account });

      // Create second DAO with different name
      const secondParams = {
        ...DEFAULT_DAO_PARAMS,
        daoName: "Second DAO",
        tokenName: "Second Token",
        tokenSymbol: "SECOND",
      };
      await factory.write.createDAO([secondParams], { account: creator.account });

      const creatorDAOs = await factory.read.getDAOsByCreator([creator.account.address]);
      const totalCount = await factory.read.getDAOCount();

      assert.equal(creatorDAOs.length, 2, "Creator should have 2 DAOs");
      assert.equal(totalCount, 2n, "Total count should be 2");
    });
  });

  // ============ Proxy Pattern Tests ============

  describe("Proxy Pattern (EIP-1167)", function () {
    it("Should deploy token as minimal proxy (different address from implementation)", async function () {
      const { factory, addresses } = await createDAOFixture();

      const tokenImpl = await factory.read.tokenImplementation();

      assert.notEqual(
        addresses.token.toLowerCase(),
        tokenImpl.toLowerCase(),
        "Token proxy should have different address from implementation"
      );
    });

    it("Should deploy governor as minimal proxy (different address from implementation)", async function () {
      const { factory, addresses } = await createDAOFixture();

      const governorImpl = await factory.read.governorImplementation();

      assert.notEqual(
        addresses.governor.toLowerCase(),
        governorImpl.toLowerCase(),
        "Governor proxy should have different address from implementation"
      );
    });

    it("Should create unique proxy addresses for each DAO", async function () {
      const { factory, creator, publicClient } = await deployFactoryFixture();

      // Create first DAO
      const hash1 = await factory.write.createDAO([DEFAULT_DAO_PARAMS], { account: creator.account });
      const receipt1 = await publicClient.waitForTransactionReceipt({ hash: hash1 });

      // Create second DAO
      const secondParams = { ...DEFAULT_DAO_PARAMS, daoName: "Second DAO" };
      const hash2 = await factory.write.createDAO([secondParams], { account: creator.account });
      const receipt2 = await publicClient.waitForTransactionReceipt({ hash: hash2 });

      // Get DAO info for both
      const dao1 = await factory.read.getDAO([0n]);
      const dao2 = await factory.read.getDAO([1n]);

      // All addresses should be unique
      assert.notEqual(dao1.token, dao2.token, "Token addresses should be unique");
      assert.notEqual(dao1.governor, dao2.governor, "Governor addresses should be unique");
      assert.notEqual(dao1.timelock, dao2.timelock, "Timelock addresses should be unique");
    });
  });
});
