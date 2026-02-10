/**
 * Integration Tests - Governance Flow
 * End-to-end tests for the complete governance lifecycle
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther, encodeFunctionData } from "viem";

import {
  deployFactoryFixture,
  createDAOFixture,
  DEFAULT_DAO_PARAMS,
  ProposalState,
  createProposal,
  createTokenTransferProposal,
  voteFor,
  voteAgainst,
  advancePastVotingDelay,
  advancePastVotingPeriod,
  getProposalState,
  executeFullProposalLifecycle,
} from "../helpers/index.js";

describe("Integration: Governance Flow", function () {
  // ============ Full Lifecycle Tests ============

  describe("Complete Proposal Lifecycle", function () {
    it("Should execute full lifecycle: Create → Vote → Queue → Execute", async function () {
      const { governor, token, creator, voter1, timelock, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const transferAmount = parseEther("1000");
      const voter1BalanceBefore = await token.read.balanceOf([voter1.account.address]);
      const treasuryBalanceBefore = await token.read.balanceOf([timelock.address]);

      // Create proposal to transfer tokens from treasury
      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        transferAmount,
        "Full lifecycle test: Transfer 1000 tokens to voter1"
      );

      // Execute full lifecycle
      const proposalId = await executeFullProposalLifecycle(
        governor as any,
        proposal,
        creator.account,
        creator.account,
        networkHelpers,
        DEFAULT_DAO_PARAMS.timelockDelay
      );

      // Verify final state
      const state = await getProposalState(governor as any, proposalId);
      assert.equal(state, ProposalState.Executed, "Proposal should be Executed");

      // Verify token transfer
      const voter1BalanceAfter = await token.read.balanceOf([voter1.account.address]);
      const treasuryBalanceAfter = await token.read.balanceOf([timelock.address]);

      assert.equal(
        voter1BalanceAfter,
        voter1BalanceBefore + transferAmount,
        "voter1 should receive tokens"
      );
      assert.equal(
        treasuryBalanceAfter,
        treasuryBalanceBefore - transferAmount,
        "Treasury should decrease by transfer amount"
      );
    });

    it("Should handle defeated proposal correctly", async function () {
      const { governor, token, creator, voter1, timelock, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const transferAmount = parseEther("1000");
      const treasuryBalanceBefore = await token.read.balanceOf([timelock.address]);

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        transferAmount,
        "Defeated proposal test"
      );

      // Create and vote AGAINST
      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteAgainst(governor as any, proposalId, creator.account);
      await advancePastVotingPeriod(governor as any, networkHelpers);

      // Verify state
      const state = await getProposalState(governor as any, proposalId);
      assert.equal(state, ProposalState.Defeated, "Proposal should be Defeated");

      // Treasury should be unchanged
      const treasuryBalanceAfter = await token.read.balanceOf([timelock.address]);
      assert.equal(
        treasuryBalanceAfter,
        treasuryBalanceBefore,
        "Treasury should remain unchanged for defeated proposal"
      );
    });
  });

  // ============ Multiple DAO Independence Tests ============

  describe("Multiple DAOs Independence", function () {
    it("Should create multiple independent DAOs", async function () {
      const { factory, creator, publicClient } = await deployFactoryFixture();

      // Create first DAO
      const params1 = { ...DEFAULT_DAO_PARAMS, daoName: "DAO One", tokenName: "Token One", tokenSymbol: "ONE" };
      const hash1 = await factory.write.createDAO([params1], { account: creator.account });
      await publicClient.waitForTransactionReceipt({ hash: hash1 });

      // Create second DAO
      const params2 = { ...DEFAULT_DAO_PARAMS, daoName: "DAO Two", tokenName: "Token Two", tokenSymbol: "TWO" };
      const hash2 = await factory.write.createDAO([params2], { account: creator.account });
      await publicClient.waitForTransactionReceipt({ hash: hash2 });

      // Get both DAOs
      const dao1 = await factory.read.getDAO([0n]);
      const dao2 = await factory.read.getDAO([1n]);

      // Verify independence - all addresses should be different
      assert.notEqual(dao1.token, dao2.token, "Token addresses should be different");
      assert.notEqual(dao1.governor, dao2.governor, "Governor addresses should be different");
      assert.notEqual(dao1.timelock, dao2.timelock, "Timelock addresses should be different");

      // Verify names
      assert.equal(dao1.daoName, "DAO One");
      assert.equal(dao2.daoName, "DAO Two");
    });

    it("Should have independent token supplies across DAOs", async function () {
      const { factory, viem, creator, publicClient } = await deployFactoryFixture();

      // Create first DAO with 1M supply
      const params1 = {
        ...DEFAULT_DAO_PARAMS,
        daoName: "DAO Small",
        totalSupply: parseEther("1000000"),
      };
      await factory.write.createDAO([params1], { account: creator.account });

      // Create second DAO with 10M supply
      const params2 = {
        ...DEFAULT_DAO_PARAMS,
        daoName: "DAO Large",
        totalSupply: parseEther("10000000"),
      };
      await factory.write.createDAO([params2], { account: creator.account });

      // Get both DAOs
      const dao1 = await factory.read.getDAO([0n]);
      const dao2 = await factory.read.getDAO([1n]);

      // Get token contracts
      const token1 = await viem.getContractAt("DAOToken", dao1.token);
      const token2 = await viem.getContractAt("DAOToken", dao2.token);

      // Verify independent supplies
      const supply1 = await token1.read.totalSupply();
      const supply2 = await token2.read.totalSupply();

      assert.equal(supply1, params1.totalSupply, "First DAO should have 1M supply");
      assert.equal(supply2, params2.totalSupply, "Second DAO should have 10M supply");
    });
  });

  // ============ Treasury Management Tests ============

  describe("Treasury Management via Governance", function () {
    it("Should transfer tokens from treasury through governance", async function () {
      const { governor, token, creator, voter1, voter2, timelock, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      // Check initial balances
      const treasuryBalanceBefore = await token.read.balanceOf([timelock.address]);
      const voter2BalanceBefore = await token.read.balanceOf([voter2.account.address]);

      // Create proposal to transfer from treasury to voter2
      const transferAmount = parseEther("50000"); // 5% of treasury
      const proposal = createTokenTransferProposal(
        token.address,
        voter2.account.address,
        transferAmount,
        "Treasury distribution: 50000 tokens to voter2"
      );

      // Execute full lifecycle
      await executeFullProposalLifecycle(
        governor as any,
        proposal,
        creator.account,
        creator.account,
        networkHelpers,
        DEFAULT_DAO_PARAMS.timelockDelay
      );

      // Verify balances changed
      const treasuryBalanceAfter = await token.read.balanceOf([timelock.address]);
      const voter2BalanceAfter = await token.read.balanceOf([voter2.account.address]);

      assert.equal(
        treasuryBalanceAfter,
        treasuryBalanceBefore - transferAmount,
        "Treasury should decrease"
      );
      assert.equal(
        voter2BalanceAfter,
        voter2BalanceBefore + transferAmount,
        "voter2 should receive tokens"
      );
    });

    it("Should receive ETH in treasury and distribute via governance", async function () {
      const { governor, token, creator, voter1, timelock, networkHelpers, viem, publicClient } = 
        await createDAOFixture();

      await networkHelpers.mine();

      // Get wallets for ETH operations
      const [deployer] = await viem.getWalletClients();

      // Send ETH to timelock (treasury)
      const ethAmount = parseEther("10");
      await deployer.sendTransaction({
        to: timelock.address,
        value: ethAmount,
      });

      // Verify treasury received ETH
      const treasuryEthBefore = await publicClient.getBalance({ address: timelock.address });
      assert.equal(treasuryEthBefore, ethAmount, "Treasury should have ETH");

      // Create proposal to send ETH from treasury
      const ethToSend = parseEther("1");
      const proposal = {
        targets: [voter1.account.address] as `0x${string}`[],
        values: [ethToSend],
        calldatas: ["0x" as `0x${string}`],
        description: "Send 1 ETH to voter1",
      };

      const voter1EthBefore = await publicClient.getBalance({ address: voter1.account.address });

      // Execute full lifecycle
      await executeFullProposalLifecycle(
        governor as any,
        proposal,
        creator.account,
        creator.account,
        networkHelpers,
        DEFAULT_DAO_PARAMS.timelockDelay
      );

      // Verify ETH was sent
      const voter1EthAfter = await publicClient.getBalance({ address: voter1.account.address });
      assert.equal(
        voter1EthAfter,
        voter1EthBefore + ethToSend,
        "voter1 should receive ETH"
      );
    });
  });

  // ============ Governance Parameter Updates ============

  describe("Governance Parameter Updates via Proposals", function () {
    it("Should update voting delay through governance", async function () {
      const { governor, token, creator, timelock, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const oldDelay = await governor.read.votingDelay();
      const newDelay = 100n; // New voting delay

      // Create proposal to update voting delay
      const calldata = encodeFunctionData({
        abi: [
          {
            name: "setVotingDelay",
            type: "function",
            inputs: [{ name: "newVotingDelay", type: "uint48" }],
            outputs: [],
          },
        ],
        functionName: "setVotingDelay",
        args: [newDelay],
      });

      const proposal = {
        targets: [governor.address] as `0x${string}`[],
        values: [0n],
        calldatas: [calldata],
        description: "Update voting delay to 100 blocks",
      };

      // Execute full lifecycle
      await executeFullProposalLifecycle(
        governor as any,
        proposal,
        creator.account,
        creator.account,
        networkHelpers,
        DEFAULT_DAO_PARAMS.timelockDelay
      );

      // Verify voting delay changed
      const updatedDelay = await governor.read.votingDelay();
      assert.equal(updatedDelay, newDelay, "Voting delay should be updated");
      assert.notEqual(updatedDelay, oldDelay, "Voting delay should change from original");
    });
  });

  // ============ Creator Workflow Tests ============

  describe("Creator Workflow", function () {
    it("Creator should have immediate voting power (auto-delegation)", async function () {
      const { token, creator, creatorAmount } = await createDAOFixture();

      const votes = await token.read.getVotes([creator.account.address]);
      assert.equal(votes, creatorAmount, "Creator should have voting power immediately");
    });

    it("Creator should be able to propose immediately", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Creator immediate proposal"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      assert.ok(proposalId > 0n, "Creator should be able to propose immediately");
    });

    it("Creator can single-handedly pass proposals (meets quorum)", async function () {
      const { governor, token, creator, voter1, timelock, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const transferAmount = parseEther("100");
      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        transferAmount,
        "Creator single-voter proposal"
      );

      // Only creator votes
      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteFor(governor as any, proposalId, creator.account);
      await advancePastVotingPeriod(governor as any, networkHelpers);

      // Should succeed with just creator's vote (1% quorum, creator has 1%)
      const state = await getProposalState(governor as any, proposalId);
      assert.equal(state, ProposalState.Succeeded, "Proposal should succeed with only creator's vote");
    });
  });

  // ============ Token Distribution Scenarios ============

  describe("Token Distribution Scenarios", function () {
    it("Should distribute tokens to new DAO members via governance", async function () {
      const { governor, token, creator, voter1, voter2, timelock, networkHelpers, viem } = 
        await createDAOFixture();

      await networkHelpers.mine();

      // Create a new address for a "new member"
      const wallets = await viem.getWalletClients();
      const newMember = wallets[3]; // Use 4th wallet as new member

      const distributionAmount = parseEther("10000");

      // Create proposal
      const proposal = createTokenTransferProposal(
        token.address,
        newMember.account.address,
        distributionAmount,
        "Distribute tokens to new member"
      );

      // Execute
      await executeFullProposalLifecycle(
        governor as any,
        proposal,
        creator.account,
        creator.account,
        networkHelpers,
        DEFAULT_DAO_PARAMS.timelockDelay
      );

      // Verify new member received tokens
      const newMemberBalance = await token.read.balanceOf([newMember.account.address]);
      assert.equal(newMemberBalance, distributionAmount, "New member should receive tokens");

      // Verify new member has voting power (auto-delegation)
      const newMemberVotes = await token.read.getVotes([newMember.account.address]);
      assert.equal(newMemberVotes, distributionAmount, "New member should have voting power");
    });

    it("Should handle multiple token distributions in sequence", async function () {
      const { governor, token, creator, voter1, voter2, timelock, networkHelpers } = 
        await createDAOFixture();

      await networkHelpers.mine();

      // First distribution
      const amount1 = parseEther("1000");
      const proposal1 = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        amount1,
        "First distribution to voter1"
      );

      await executeFullProposalLifecycle(
        governor as any,
        proposal1,
        creator.account,
        creator.account,
        networkHelpers,
        DEFAULT_DAO_PARAMS.timelockDelay
      );

      const voter1BalanceAfterFirst = await token.read.balanceOf([voter1.account.address]);

      // Second distribution
      const amount2 = parseEther("2000");
      const proposal2 = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        amount2,
        "Second distribution to voter1"
      );

      await executeFullProposalLifecycle(
        governor as any,
        proposal2,
        creator.account,
        creator.account,
        networkHelpers,
        DEFAULT_DAO_PARAMS.timelockDelay
      );

      const voter1BalanceAfterSecond = await token.read.balanceOf([voter1.account.address]);

      // Verify cumulative distribution
      assert.equal(
        voter1BalanceAfterSecond,
        voter1BalanceAfterFirst + amount2,
        "voter1 should receive cumulative tokens"
      );
    });
  });
});
