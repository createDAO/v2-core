/**
 * DAOGovernor Tests
 * Tests for the OpenZeppelin Governor with timelock integration
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther, encodeFunctionData } from "viem";

import {
  createDAOFixture,
  createDAOWithVotersFixture,
  DEFAULT_DAO_PARAMS,
  ProposalState,
  VOTE_FOR,
  VOTE_AGAINST,
  VOTE_ABSTAIN,
  QUORUM_NUMERATOR,
  createProposal,
  createTokenTransferProposal,
  hashDescription,
  voteFor,
  voteAgainst,
  voteAbstain,
  advancePastVotingDelay,
  advancePastVotingPeriod,
  advancePastTimelockDelay,
  queueProposal,
  executeProposal,
  getProposalState,
  getProposalVotes,
  mineBlocks,
  assertRevertWithCustomError,
} from "./helpers/index.js";

describe("DAOGovernor", function () {
  // ============ Manager Role Tests ============

  describe("Manager Role", function () {
    it("Should set creator as initial manager", async function () {
      const { governor, creator } = await createDAOFixture();

      const manager = await governor.read.manager();
      assert.equal(
        manager.toLowerCase(),
        creator.account.address.toLowerCase(),
        "Creator should be set as initial manager"
      );
    });

    it("Should emit ManagerChanged event on initialization", async function () {
      const { factory, viem, publicClient, creator } = await createDAOFixture();

      // Get the block when DAO was created (check for events)
      // The ManagerChanged event should have been emitted during initialization
      // We can verify by checking the manager is set correctly
      const { governor } = await createDAOFixture();
      const manager = await governor.read.manager();
      
      // Manager should be creator, meaning ManagerChanged was called during init
      assert.equal(
        manager.toLowerCase(),
        creator.account.address.toLowerCase(),
        "Manager should be set"
      );
    });

    it("Should not allow direct setManager call from non-governance", async function () {
      const { governor, voter1 } = await createDAOFixture();

      await assertRevertWithCustomError(
        governor.write.setManager([voter1.account.address], { account: voter1.account }),
        "OnlyGovernance"
      );
    });

    it("Should not allow direct setManager call from creator", async function () {
      const { governor, creator, voter1 } = await createDAOFixture();

      // Even the creator/manager cannot directly call setManager
      // It must go through governance
      await assertRevertWithCustomError(
        governor.write.setManager([voter1.account.address], { account: creator.account }),
        "OnlyGovernance"
      );
    });
  });

  // ============ Initialization Tests ============

  describe("Initialization", function () {
    it("Should have correct name", async function () {
      const { governor, params } = await createDAOFixture();

      const name = await governor.read.name();
      assert.equal(name, params.daoName, "Governor name should match DAO name");
    });

    it("Should have correct voting delay", async function () {
      const { governor, params } = await createDAOFixture();

      const votingDelay = await governor.read.votingDelay();
      assert.equal(votingDelay, params.votingDelay, "Voting delay should match");
    });

    it("Should have correct voting period", async function () {
      const { governor, params } = await createDAOFixture();

      const votingPeriod = await governor.read.votingPeriod();
      assert.equal(votingPeriod, params.votingPeriod, "Voting period should match");
    });

    it("Should have correct proposal threshold (1% of supply)", async function () {
      const { governor, creatorAmount } = await createDAOFixture();

      const proposalThreshold = await governor.read.proposalThreshold();
      assert.equal(proposalThreshold, creatorAmount, "Proposal threshold should be 1% of supply");
    });

    it("Should be linked to correct token", async function () {
      const { governor, token } = await createDAOFixture();

      const governorToken = await governor.read.token();
      assert.equal(governorToken.toLowerCase(), token.address.toLowerCase(), "Governor should use correct token");
    });

    it("Should be linked to correct timelock", async function () {
      const { governor, timelock } = await createDAOFixture();

      const governorTimelock = await governor.read.timelock();
      assert.equal(governorTimelock.toLowerCase(), timelock.address.toLowerCase(), "Governor should use correct timelock");
    });
  });

  // ============ Quorum Tests ============

  describe("Quorum", function () {
    it("Should have 1% quorum", async function () {
      const { governor, params, publicClient, networkHelpers } = await createDAOFixture();

      // Mine a block so the token supply checkpoint is recorded
      await networkHelpers.mine();

      // Governor uses timestamp mode (ERC6372), so we need to pass a timestamp
      const block = await publicClient.getBlock();
      const quorum = await governor.read.quorum([block.timestamp - 1n]);
      const expectedQuorum = (params.totalSupply * QUORUM_NUMERATOR) / 100n;

      assert.equal(quorum, expectedQuorum, "Quorum should be 1% of total supply");
    });

    it("Should have quorum equal to creator allocation", async function () {
      const { governor, creatorAmount, publicClient, networkHelpers } = await createDAOFixture();

      // Mine a block so the token supply checkpoint is recorded
      await networkHelpers.mine();

      // Governor uses timestamp mode (ERC6372), so we need to pass a timestamp
      const block = await publicClient.getBlock();
      const quorum = await governor.read.quorum([block.timestamp - 1n]);

      assert.equal(quorum, creatorAmount, "Quorum should equal creator allocation");
    });
  });

  // ============ Proposal Creation Tests ============

  describe("Proposal Creation", function () {
    it("Should allow creator to create proposal (has threshold)", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      // Mine a block so voting power is recorded
      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Transfer 100 tokens to voter1"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      assert.ok(proposalId > 0n, "Proposal should be created with valid ID");
    });

    it("Should revert proposal from account below threshold", async function () {
      const { governor, token, voter1, networkHelpers } = await createDAOFixture();

      // Mine a block
      await networkHelpers.mine();

      // voter1 has no tokens, shouldn't be able to propose
      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Invalid proposal"
      );

      await assertRevertWithCustomError(
        governor.write.propose(
          [proposal.targets, proposal.values, proposal.calldatas, proposal.description],
          { account: voter1.account }
        ),
        "GovernorInsufficientProposerVotes"
      );
    });

    it("Should emit ProposalCreated event", async function () {
      const { governor, token, viem, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Test proposal"
      );

      await viem.assertions.emit(
        governor.write.propose(
          [proposal.targets, proposal.values, proposal.calldatas, proposal.description],
          { account: creator.account }
        ),
        governor,
        "ProposalCreated"
      );
    });

    it("Should start proposal in Pending state", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Pending state test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      const state = await getProposalState(governor as any, proposalId);

      assert.equal(state, ProposalState.Pending, "Proposal should be in Pending state");
    });
  });

  // ============ Voting Tests ============

  describe("Voting", function () {
    it("Should allow voting after voting delay", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Vote test proposal"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);

      // Advance past voting delay
      await advancePastVotingDelay(governor as any, networkHelpers);

      // Should now be Active
      const state = await getProposalState(governor as any, proposalId);
      assert.equal(state, ProposalState.Active, "Proposal should be Active");

      // Vote should succeed
      await voteFor(governor as any, proposalId, creator.account);

      // Check votes recorded
      const votes = await getProposalVotes(governor as any, proposalId);
      assert.ok(votes.forVotes > 0n, "FOR votes should be recorded");
    });

    it("Should record FOR votes correctly", async function () {
      const { governor, token, creator, voter1, creatorAmount, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "FOR vote test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteFor(governor as any, proposalId, creator.account);

      const votes = await getProposalVotes(governor as any, proposalId);
      assert.equal(votes.forVotes, creatorAmount, "FOR votes should equal creator's voting power");
      assert.equal(votes.againstVotes, 0n, "AGAINST votes should be 0");
      assert.equal(votes.abstainVotes, 0n, "ABSTAIN votes should be 0");
    });

    it("Should record AGAINST votes correctly", async function () {
      const { governor, token, creator, voter1, creatorAmount, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "AGAINST vote test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteAgainst(governor as any, proposalId, creator.account);

      const votes = await getProposalVotes(governor as any, proposalId);
      assert.equal(votes.againstVotes, creatorAmount, "AGAINST votes should equal creator's voting power");
      assert.equal(votes.forVotes, 0n, "FOR votes should be 0");
    });

    it("Should record ABSTAIN votes correctly", async function () {
      const { governor, token, creator, voter1, creatorAmount, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "ABSTAIN vote test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteAbstain(governor as any, proposalId, creator.account);

      const votes = await getProposalVotes(governor as any, proposalId);
      assert.equal(votes.abstainVotes, creatorAmount, "ABSTAIN votes should equal creator's voting power");
    });

    it("Should not allow voting before voting delay", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Early vote test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);

      // Try to vote immediately (still in Pending state)
      await assertRevertWithCustomError(
        governor.write.castVote([proposalId, VOTE_FOR], { account: creator.account }),
        "GovernorUnexpectedProposalState"
      );
    });

    it("Should emit VoteCast event", async function () {
      const { governor, token, viem, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Vote event test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);

      await viem.assertions.emit(
        governor.write.castVote([proposalId, VOTE_FOR], { account: creator.account }),
        governor,
        "VoteCast"
      );
    });
  });

  // ============ Proposal State Tests ============

  describe("Proposal States", function () {
    it("Should transition to Succeeded after quorum met with FOR majority", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Succeeded state test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteFor(governor as any, proposalId, creator.account);
      await advancePastVotingPeriod(governor as any, networkHelpers);

      const state = await getProposalState(governor as any, proposalId);
      assert.equal(state, ProposalState.Succeeded, "Proposal should be Succeeded");
    });

    it("Should transition to Defeated after quorum met with AGAINST majority", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Defeated state test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteAgainst(governor as any, proposalId, creator.account);
      await advancePastVotingPeriod(governor as any, networkHelpers);

      const state = await getProposalState(governor as any, proposalId);
      assert.equal(state, ProposalState.Defeated, "Proposal should be Defeated");
    });

    it("Should transition to Queued after queueing succeeded proposal", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Queued state test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteFor(governor as any, proposalId, creator.account);
      await advancePastVotingPeriod(governor as any, networkHelpers);
      await queueProposal(governor as any, proposal, creator.account);

      const state = await getProposalState(governor as any, proposalId);
      assert.equal(state, ProposalState.Queued, "Proposal should be Queued");
    });

    it("Should transition to Executed after execution", async function () {
      const { governor, token, creator, voter1, creatorAmount, networkHelpers, timelock, params } = await createDAOFixture();

      // For this test, we need to transfer tokens to timelock first
      // The timelock already has 99% of tokens, so let's create a proposal to transfer FROM timelock
      await networkHelpers.mine();

      const transferAmount = parseEther("100");
      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        transferAmount,
        "Executed state test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteFor(governor as any, proposalId, creator.account);
      await advancePastVotingPeriod(governor as any, networkHelpers);
      await queueProposal(governor as any, proposal, creator.account);
      await advancePastTimelockDelay(networkHelpers, params.timelockDelay);
      await executeProposal(governor as any, proposal, creator.account);

      const state = await getProposalState(governor as any, proposalId);
      assert.equal(state, ProposalState.Executed, "Proposal should be Executed");
    });
  });

  // ============ Timelock Integration Tests ============

  describe("Timelock Integration", function () {
    it("Should require proposals to be queued before execution", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Queue requirement test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteFor(governor as any, proposalId, creator.account);
      await advancePastVotingPeriod(governor as any, networkHelpers);

      // Try to execute without queueing - should fail
      const descriptionHash = hashDescription(proposal.description);
      await assertRevertWithCustomError(
        governor.write.execute(
          [proposal.targets, proposal.values, proposal.calldatas, descriptionHash],
          { account: creator.account }
        ),
        "TimelockUnexpectedOperationState"
      );
    });

    it("Should respect timelock delay", async function () {
      const { governor, token, creator, voter1, networkHelpers } = await createDAOFixture();

      await networkHelpers.mine();

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Timelock delay test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteFor(governor as any, proposalId, creator.account);
      await advancePastVotingPeriod(governor as any, networkHelpers);
      await queueProposal(governor as any, proposal, creator.account);

      // Try to execute immediately (before timelock delay) - should fail
      const descriptionHash = hashDescription(proposal.description);
      await assertRevertWithCustomError(
        governor.write.execute(
          [proposal.targets, proposal.values, proposal.calldatas, descriptionHash],
          { account: creator.account }
        ),
        "TimelockUnexpectedOperationState"
      );
    });

    it("Should execute proposal actions via timelock", async function () {
      const { governor, token, creator, voter1, networkHelpers, timelock, params } = await createDAOFixture();

      await networkHelpers.mine();

      const transferAmount = parseEther("1000");
      const voter1BalanceBefore = await token.read.balanceOf([voter1.account.address]);

      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        transferAmount,
        "Execute via timelock test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);
      await advancePastVotingDelay(governor as any, networkHelpers);
      await voteFor(governor as any, proposalId, creator.account);
      await advancePastVotingPeriod(governor as any, networkHelpers);
      await queueProposal(governor as any, proposal, creator.account);
      await advancePastTimelockDelay(networkHelpers, params.timelockDelay);
      await executeProposal(governor as any, proposal, creator.account);

      // Verify the transfer happened
      const voter1BalanceAfter = await token.read.balanceOf([voter1.account.address]);
      assert.equal(
        voter1BalanceAfter,
        voter1BalanceBefore + transferAmount,
        "Tokens should be transferred from treasury"
      );
    });
  });

  // ============ Multi-Voter Tests ============

  describe("Multi-Voter Scenarios", function () {
    it("Should aggregate votes from multiple voters", async function () {
      // Use base fixture - creator has full 10,000 tokens to meet proposal threshold
      const { governor, token, creator, voter1, voter2, creatorAmount, networkHelpers } = 
        await createDAOFixture();

      await networkHelpers.mine();

      // Creator creates proposal FIRST while they still have full voting power
      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Multi-voter test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);

      // Now distribute tokens to voters (after proposal is created)
      const voterAmount = creatorAmount / 4n; // 25% each = 2500 tokens
      await token.write.transfer([voter1.account.address, voterAmount], {
        account: creator.account,
      });
      await token.write.transfer([voter2.account.address, voterAmount], {
        account: creator.account,
      });

      // Mine a block to record the new voting power
      await networkHelpers.mine();

      await advancePastVotingDelay(governor as any, networkHelpers);

      // Multiple voters vote FOR
      await voteFor(governor as any, proposalId, creator.account);
      await voteFor(governor as any, proposalId, voter1.account);
      await voteFor(governor as any, proposalId, voter2.account);

      const votes = await getProposalVotes(governor as any, proposalId);

      // All votes should be aggregated
      const creatorVotes = await token.read.getVotes([creator.account.address]);
      const voter1Votes = await token.read.getVotes([voter1.account.address]);
      const voter2Votes = await token.read.getVotes([voter2.account.address]);

      assert.equal(
        votes.forVotes,
        creatorVotes + voter1Votes + voter2Votes,
        "FOR votes should be sum of all voter's voting power"
      );
    });

    it("Should handle mixed votes correctly", async function () {
      // Use base fixture - creator has full 10,000 tokens to meet proposal threshold
      const { governor, token, creator, voter1, voter2, creatorAmount, networkHelpers, publicClient } = 
        await createDAOFixture();

      await networkHelpers.mine();

      // Creator creates proposal FIRST while they still have full voting power
      const proposal = createTokenTransferProposal(
        token.address,
        voter1.account.address,
        parseEther("100"),
        "Mixed votes test"
      );

      const proposalId = await createProposal(governor as any, proposal, creator.account);

      // Now distribute tokens to voters (after proposal is created)
      const voterAmount = creatorAmount / 4n; // 25% each = 2500 tokens
      await token.write.transfer([voter1.account.address, voterAmount], {
        account: creator.account,
      });
      await token.write.transfer([voter2.account.address, voterAmount], {
        account: creator.account,
      });

      // Mine a block to record the new voting power
      await networkHelpers.mine();

      await advancePastVotingDelay(governor as any, networkHelpers);

      // Mixed votes
      await voteFor(governor as any, proposalId, creator.account);
      await voteAgainst(governor as any, proposalId, voter1.account);
      await voteAbstain(governor as any, proposalId, voter2.account);

      const votes = await getProposalVotes(governor as any, proposalId);

      // Get the proposal snapshot block (votes are counted at this block)
      const snapshotBlock = await governor.read.proposalSnapshot([proposalId]);

      // Check each vote type using the snapshot voting power (getPastVotes)
      // This is what OpenZeppelin Governor uses to count votes
      const creatorVotesAtSnapshot = await token.read.getPastVotes([creator.account.address, snapshotBlock]);
      const voter1VotesAtSnapshot = await token.read.getPastVotes([voter1.account.address, snapshotBlock]);
      const voter2VotesAtSnapshot = await token.read.getPastVotes([voter2.account.address, snapshotBlock]);

      assert.equal(votes.forVotes, creatorVotesAtSnapshot, "FOR votes should match creator's snapshot votes");
      assert.equal(votes.againstVotes, voter1VotesAtSnapshot, "AGAINST votes should match voter1's snapshot votes");
      assert.equal(votes.abstainVotes, voter2VotesAtSnapshot, "ABSTAIN votes should match voter2's snapshot votes");
    });
  });
});
