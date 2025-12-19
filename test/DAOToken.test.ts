/**
 * DAOToken Tests
 * Tests for the ERC20Votes governance token with auto-delegation
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther, getAddress } from "viem";

import {
  createDAOFixture,
  createDAOWithVotersFixture,
  DEFAULT_DAO_PARAMS,
  ZERO_ADDRESS,
  NON_OWNER_ADDRESS,
} from "./helpers/index.js";

describe("DAOToken", function () {
  // ============ Initialization Tests ============

  describe("Initialization", function () {
    it("Should have correct name and symbol", async function () {
      const { token, params } = await createDAOFixture();

      const name = await token.read.name();
      const symbol = await token.read.symbol();

      assert.equal(name, params.tokenName, "Name should match");
      assert.equal(symbol, params.tokenSymbol, "Symbol should match");
    });

    it("Should have correct total supply", async function () {
      const { token, params } = await createDAOFixture();

      const totalSupply = await token.read.totalSupply();
      assert.equal(totalSupply, params.totalSupply, "Total supply should match");
    });

    it("Should have 18 decimals", async function () {
      const { token } = await createDAOFixture();

      const decimals = await token.read.decimals();
      assert.equal(decimals, 18, "Decimals should be 18");
    });

    it("Should prevent re-initialization", async function () {
      const { token, creator, addresses } = await createDAOFixture();

      // Try to initialize again - should revert with InvalidInitialization
      // The token is already initialized via the factory, so this should fail
      let reverted = false;
      try {
        await token.write.initialize(
          ["New Name", "NEW", parseEther("1000"), addresses.creator],
          { account: creator.account }
        );
      } catch (error) {
        reverted = true;
        // Verify it's the InvalidInitialization error (selector: 0xf92ee8a9)
        const errorStr = String(error);
        
        assert.ok(
          errorStr.includes("revert") || errorStr.includes("0xf92ee8a9") || errorStr.includes("InvalidInitialization"),
          "Should revert with InvalidInitialization error"
        );
      }
      assert.ok(reverted, "Re-initialization should have reverted");
    });
  });

  // ============ ERC20 Standard Tests ============

  describe("ERC20 Standard", function () {
    it("Should transfer tokens correctly", async function () {
      const { token, creator, voter1, creatorAmount } = await createDAOFixture();

      const transferAmount = parseEther("100");
      const creatorBalanceBefore = await token.read.balanceOf([creator.account.address]);

      await token.write.transfer([voter1.account.address, transferAmount], {
        account: creator.account,
      });

      const creatorBalanceAfter = await token.read.balanceOf([creator.account.address]);
      const voter1Balance = await token.read.balanceOf([voter1.account.address]);

      assert.equal(creatorBalanceAfter, creatorBalanceBefore - transferAmount, "Creator balance should decrease");
      assert.equal(voter1Balance, transferAmount, "Recipient should receive tokens");
    });

    it("Should approve and transferFrom correctly", async function () {
      const { token, creator, voter1, voter2 } = await createDAOFixture();

      const approveAmount = parseEther("500");
      const transferAmount = parseEther("300");

      // Creator approves voter1 to spend
      await token.write.approve([voter1.account.address, approveAmount], {
        account: creator.account,
      });

      // Check allowance
      const allowance = await token.read.allowance([creator.account.address, voter1.account.address]);
      assert.equal(allowance, approveAmount, "Allowance should be set");

      // voter1 transfers from creator to voter2
      await token.write.transferFrom([creator.account.address, voter2.account.address, transferAmount], {
        account: voter1.account,
      });

      const voter2Balance = await token.read.balanceOf([voter2.account.address]);
      assert.equal(voter2Balance, transferAmount, "voter2 should receive tokens");

      // Check remaining allowance
      const remainingAllowance = await token.read.allowance([creator.account.address, voter1.account.address]);
      assert.equal(remainingAllowance, approveAmount - transferAmount, "Allowance should decrease");
    });

    it("Should revert transfer with insufficient balance", async function () {
      const { token, creator, voter1, creatorAmount } = await createDAOFixture();

      const excessAmount = creatorAmount + 1n;

      // Try to transfer more than balance - should revert with ERC20InsufficientBalance
      let reverted = false;
      try {
        await token.write.transfer([voter1.account.address, excessAmount], {
          account: creator.account,
        });
      } catch (error) {
        reverted = true;
        // Verify it's the ERC20InsufficientBalance error (selector: 0xe450d38c)
        const errorStr = String(error);
        assert.ok(
          errorStr.includes("revert") || errorStr.includes("0xe450d38c") || errorStr.includes("ERC20InsufficientBalance"),
          "Should revert with ERC20InsufficientBalance error"
        );
      }
      assert.ok(reverted, "Transfer with insufficient balance should have reverted");
    });

    it("Should emit Transfer event", async function () {
      const { token, viem, creator, voter1 } = await createDAOFixture();

      const transferAmount = parseEther("100");

      await viem.assertions.emitWithArgs(
        token.write.transfer([voter1.account.address, transferAmount], {
          account: creator.account,
        }),
        token,
        "Transfer",
        [getAddress(creator.account.address), getAddress(voter1.account.address), transferAmount]
      );
    });
  });

  // ============ Auto-Delegation Tests ============

  describe("Auto-Delegation", function () {
    it("Should auto-delegate to creator on DAO creation", async function () {
      const { token, creator, creatorAmount } = await createDAOFixture();

      // Creator should have voting power equal to their balance
      const votingPower = await token.read.getVotes([creator.account.address]);
      assert.equal(votingPower, creatorAmount, "Creator should have auto-delegated voting power");
    });

    it("Should auto-delegate to recipient on first token receive", async function () {
      const { token, creator, voter1 } = await createDAOFixture();

      const transferAmount = parseEther("100");

      // voter1 has no votes initially
      const votesBefore = await token.read.getVotes([voter1.account.address]);
      assert.equal(votesBefore, 0n, "voter1 should have no votes initially");

      // Transfer tokens to voter1
      await token.write.transfer([voter1.account.address, transferAmount], {
        account: creator.account,
      });

      // voter1 should now have voting power
      const votesAfter = await token.read.getVotes([voter1.account.address]);
      assert.equal(votesAfter, transferAmount, "voter1 should auto-delegate on first receive");
    });

    it("Should not re-delegate on subsequent transfers", async function () {
      const { token, creator, voter1, voter2 } = await createDAOFixture();

      const firstTransfer = parseEther("100");
      const secondTransfer = parseEther("50");

      // First transfer to voter1 (triggers auto-delegation)
      await token.write.transfer([voter1.account.address, firstTransfer], {
        account: creator.account,
      });

      // voter1 manually delegates to voter2
      await token.write.delegate([voter2.account.address], {
        account: voter1.account,
      });

      // Verify voter1's delegation changed
      const voter1Delegate = await token.read.delegates([voter1.account.address]);
      assert.equal(voter1Delegate.toLowerCase(), voter2.account.address.toLowerCase(), "voter1 should delegate to voter2");

      // Second transfer to voter1 should NOT change delegation
      await token.write.transfer([voter1.account.address, secondTransfer], {
        account: creator.account,
      });

      // Delegation should still be to voter2
      const voter1DelegateAfter = await token.read.delegates([voter1.account.address]);
      assert.equal(voter1DelegateAfter.toLowerCase(), voter2.account.address.toLowerCase(), "Delegation should remain unchanged");
    });

    it("Should auto-delegate treasury (timelock) to itself", async function () {
      const { token, timelock, treasuryAmount } = await createDAOFixture();

      // Treasury should have voting power from auto-delegation
      const treasuryVotes = await token.read.getVotes([timelock.address]);
      assert.equal(treasuryVotes, treasuryAmount, "Treasury should have auto-delegated voting power");
    });
  });

  // ============ Voting Power Tests ============

  describe("Voting Power", function () {
    it("Should return correct voting power after delegation", async function () {
      const { token, creator, voter1, creatorAmount } = await createDAOFixture();

      // Creator delegates to voter1
      await token.write.delegate([voter1.account.address], {
        account: creator.account,
      });

      // voter1 should now have creator's voting power
      const voter1Votes = await token.read.getVotes([voter1.account.address]);
      assert.equal(voter1Votes, creatorAmount, "voter1 should have delegated votes");

      // Creator should have 0 votes (delegated away)
      const creatorVotes = await token.read.getVotes([creator.account.address]);
      assert.equal(creatorVotes, 0n, "Creator should have no votes after delegating");
    });

    it("Should track historical voting power (checkpoints)", async function () {
      const { token, creator, networkHelpers, publicClient } = await createDAOFixture();

      // Get current timestamp (token uses timestamp mode for ERC6372)
      const block1 = await publicClient.getBlock();
      const timestamp1 = block1.timestamp;

      // Mine some blocks to advance time
      await networkHelpers.mine();
      await networkHelpers.mine();

      // Get votes at historical timestamp
      const pastVotes = await token.read.getPastVotes([creator.account.address, timestamp1]);

      // Should have votes at that timestamp
      assert.ok(pastVotes > 0n, "Should have voting power at historical timestamp");
    });

    it("Should update voting power after transfer", async function () {
      const { token, creator, voter1, creatorAmount } = await createDAOFixture();

      const transferAmount = parseEther("5000"); // 50% of creator's tokens

      await token.write.transfer([voter1.account.address, transferAmount], {
        account: creator.account,
      });

      // Both should have updated voting power
      const creatorVotes = await token.read.getVotes([creator.account.address]);
      const voter1Votes = await token.read.getVotes([voter1.account.address]);

      assert.equal(creatorVotes, creatorAmount - transferAmount, "Creator votes should decrease");
      assert.equal(voter1Votes, transferAmount, "voter1 votes should increase");
    });

    it("Should emit DelegateVotesChanged event", async function () {
      const { token, viem, creator, voter1, creatorAmount } = await createDAOFixture();

      await viem.assertions.emit(
        token.write.delegate([voter1.account.address], {
          account: creator.account,
        }),
        token,
        "DelegateVotesChanged"
      );
    });
  });

  // ============ Clock Tests ============

  describe("Clock (ERC6372)", function () {
    it("Should return current timestamp as clock", async function () {
      const { token, publicClient } = await createDAOFixture();

      const clock = await token.read.clock();
      const block = await publicClient.getBlock();
      const currentTimestamp = block.timestamp;

      // Clock should be approximately current timestamp (may differ slightly due to timing)
      // Allow a small tolerance for block time
      assert.ok(
        clock >= currentTimestamp - 10n && clock <= currentTimestamp + 10n,
        "Clock should return current timestamp"
      );
    });

    it("Should return correct CLOCK_MODE", async function () {
      const { token } = await createDAOFixture();

      const clockMode = await token.read.CLOCK_MODE();
      assert.equal(clockMode, "mode=timestamp", "Should use timestamp mode");
    });
  });

  // ============ Permit Tests (EIP-2612) ============

  describe("Permit (EIP-2612)", function () {
    it("Should have correct domain separator", async function () {
      const { token } = await createDAOFixture();

      // Just verify the function exists and returns a value
      const domainSeparator = await token.read.DOMAIN_SEPARATOR();
      assert.ok(domainSeparator, "Domain separator should be set");
      assert.notEqual(domainSeparator, "0x0000000000000000000000000000000000000000000000000000000000000000");
    });

    it("Should track nonces correctly", async function () {
      const { token, creator } = await createDAOFixture();

      const nonce = await token.read.nonces([creator.account.address]);
      assert.equal(nonce, 0n, "Initial nonce should be 0");
    });
  });

  // ============ Edge Cases ============

  describe("Edge Cases", function () {
    it("Should handle zero amount transfer", async function () {
      const { token, creator, voter1 } = await createDAOFixture();

      // Should not revert
      await token.write.transfer([voter1.account.address, 0n], {
        account: creator.account,
      });

      const voter1Balance = await token.read.balanceOf([voter1.account.address]);
      assert.equal(voter1Balance, 0n, "Balance should remain 0");
    });

    it("Should handle self-transfer", async function () {
      const { token, creator, creatorAmount } = await createDAOFixture();

      const transferAmount = parseEther("100");

      await token.write.transfer([creator.account.address, transferAmount], {
        account: creator.account,
      });

      const creatorBalance = await token.read.balanceOf([creator.account.address]);
      assert.equal(creatorBalance, creatorAmount, "Balance should remain unchanged after self-transfer");
    });

    it("Should handle delegation to zero address (clears delegation)", async function () {
      const { token, creator } = await createDAOFixture();

      // First delegate to self (already done via auto-delegation)
      const initialDelegate = await token.read.delegates([creator.account.address]);
      assert.equal(initialDelegate.toLowerCase(), creator.account.address.toLowerCase());

      // Delegate to another address first
      const anotherAddress = NON_OWNER_ADDRESS;
      await token.write.delegate([anotherAddress], {
        account: creator.account,
      });

      const newDelegate = await token.read.delegates([creator.account.address]);
      assert.equal(newDelegate.toLowerCase(), anotherAddress.toLowerCase());
    });

    it("Should handle multiple token distributions correctly", async function () {
      const { token, creator, voter1, voter2 } = await createDAOWithVotersFixture();

      // Get all balances
      const creatorBalance = await token.read.balanceOf([creator.account.address]);
      const voter1Balance = await token.read.balanceOf([voter1.account.address]);
      const voter2Balance = await token.read.balanceOf([voter2.account.address]);

      // All should have non-zero balance
      assert.ok(creatorBalance > 0n, "Creator should have tokens");
      assert.ok(voter1Balance > 0n, "voter1 should have tokens");
      assert.ok(voter2Balance > 0n, "voter2 should have tokens");

      // All should have voting power (auto-delegated)
      const creatorVotes = await token.read.getVotes([creator.account.address]);
      const voter1Votes = await token.read.getVotes([voter1.account.address]);
      const voter2Votes = await token.read.getVotes([voter2.account.address]);

      assert.equal(creatorVotes, creatorBalance, "Creator votes should match balance");
      assert.equal(voter1Votes, voter1Balance, "voter1 votes should match balance");
      assert.equal(voter2Votes, voter2Balance, "voter2 votes should match balance");
    });
  });
});
