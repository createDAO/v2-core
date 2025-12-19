/**
 * Governance Helpers
 * Utility functions for governance-related test operations
 * Encapsulates proposal creation, voting, and execution logic (SOLID - Single Responsibility)
 */
import { keccak256, toHex, encodeFunctionData, type Abi, type Account } from "viem";
import { VOTE_FOR, VOTE_AGAINST, VOTE_ABSTAIN, TIMELOCK_MIN_DELAY, ProposalState } from "./constants.js";
import type { NetworkHelpers } from "./fixtures.js";

// ============ Types ============

export interface ProposalParams {
  targets: `0x${string}`[];
  values: bigint[];
  calldatas: `0x${string}`[];
  description: string;
}

export interface GovernorContract {
  write: {
    propose: (args: [readonly `0x${string}`[], readonly bigint[], readonly `0x${string}`[], string], options?: { account?: Account }) => Promise<`0x${string}`>;
    castVote: (args: [bigint, number], options?: { account?: Account }) => Promise<`0x${string}`>;
    queue: (args: [readonly `0x${string}`[], readonly bigint[], readonly `0x${string}`[], `0x${string}`], options?: { account?: Account }) => Promise<`0x${string}`>;
    execute: (args: [readonly `0x${string}`[], readonly bigint[], readonly `0x${string}`[], `0x${string}`], options?: { account?: Account }) => Promise<`0x${string}`>;
    cancel: (args: [readonly `0x${string}`[], readonly bigint[], readonly `0x${string}`[], `0x${string}`], options?: { account?: Account }) => Promise<`0x${string}`>;
  };
  read: {
    state: (args: [bigint]) => Promise<number>;
    hashProposal: (args: [readonly `0x${string}`[], readonly bigint[], readonly `0x${string}`[], `0x${string}`]) => Promise<bigint>;
    proposalVotes: (args: [bigint]) => Promise<readonly [bigint, bigint, bigint]>;
    votingDelay: () => Promise<bigint>;
    votingPeriod: () => Promise<bigint>;
    proposalThreshold: () => Promise<bigint>;
    quorum: (args: [bigint]) => Promise<bigint>;
  };
  abi: Abi;
  address: `0x${string}`;
}

// ============ Proposal Helpers ============

/**
 * Creates a description hash for a proposal
 */
export function hashDescription(description: string): `0x${string}` {
  return keccak256(toHex(description));
}

/**
 * Creates a proposal and returns the proposal ID
 */
export async function createProposal(
  governor: GovernorContract,
  params: ProposalParams,
  proposerAccount: Account
): Promise<bigint> {
  const { targets, values, calldatas, description } = params;

  // Submit the proposal
  await governor.write.propose([targets, values, calldatas, description], {
    account: proposerAccount,
  });

  // Calculate and return the proposal ID
  const descriptionHash = hashDescription(description);
  const proposalId = await governor.read.hashProposal([targets, values, calldatas, descriptionHash]);

  return proposalId;
}

/**
 * Creates a simple token transfer proposal
 * Common pattern: transfer tokens from treasury to recipient
 */
export function createTokenTransferProposal(
  tokenAddress: `0x${string}`,
  recipient: `0x${string}`,
  amount: bigint,
  description: string
): ProposalParams {
  const calldata = encodeFunctionData({
    abi: [
      {
        name: "transfer",
        type: "function",
        inputs: [
          { name: "to", type: "address" },
          { name: "amount", type: "uint256" },
        ],
        outputs: [{ type: "bool" }],
      },
    ],
    functionName: "transfer",
    args: [recipient, amount],
  });

  return {
    targets: [tokenAddress],
    values: [0n],
    calldatas: [calldata],
    description,
  };
}

// ============ Voting Helpers ============

/**
 * Cast a vote on a proposal
 */
export async function castVote(
  governor: GovernorContract,
  proposalId: bigint,
  support: number,
  voterAccount: Account
): Promise<void> {
  await governor.write.castVote([proposalId, support], {
    account: voterAccount,
  });
}

/**
 * Cast a FOR vote
 */
export async function voteFor(
  governor: GovernorContract,
  proposalId: bigint,
  voterAccount: Account
): Promise<void> {
  await castVote(governor, proposalId, VOTE_FOR, voterAccount);
}

/**
 * Cast an AGAINST vote
 */
export async function voteAgainst(
  governor: GovernorContract,
  proposalId: bigint,
  voterAccount: Account
): Promise<void> {
  await castVote(governor, proposalId, VOTE_AGAINST, voterAccount);
}

/**
 * Cast an ABSTAIN vote
 */
export async function voteAbstain(
  governor: GovernorContract,
  proposalId: bigint,
  voterAccount: Account
): Promise<void> {
  await castVote(governor, proposalId, VOTE_ABSTAIN, voterAccount);
}

// ============ Time Manipulation Helpers ============

/**
 * Advance time by a specific number of seconds
 * Used for timestamp-based governance (ERC6372 mode=timestamp)
 */
export async function advanceTime(
  networkHelpers: NetworkHelpers,
  seconds: bigint
): Promise<void> {
  await networkHelpers.time.increase(Number(seconds));
  await networkHelpers.mine(); // Mine a block to make the time change effective
}

/**
 * Advance past the voting delay so voting can begin
 * Note: votingDelay is in seconds (timestamp-based governance)
 */
export async function advancePastVotingDelay(
  governor: GovernorContract,
  networkHelpers: NetworkHelpers
): Promise<void> {
  const votingDelay = await governor.read.votingDelay();
  await advanceTime(networkHelpers, votingDelay + 1n);
}

/**
 * Advance past the voting period so voting ends
 * Note: votingPeriod is in seconds (timestamp-based governance)
 */
export async function advancePastVotingPeriod(
  governor: GovernorContract,
  networkHelpers: NetworkHelpers
): Promise<void> {
  const votingPeriod = await governor.read.votingPeriod();
  await advanceTime(networkHelpers, votingPeriod + 1n);
}

/**
 * Advance time past the timelock delay
 */
export async function advancePastTimelockDelay(
  networkHelpers: NetworkHelpers
): Promise<void> {
  // Increase time by timelock delay + 1 second
  await networkHelpers.time.increase(Number(TIMELOCK_MIN_DELAY) + 1);
  await networkHelpers.mine();
}

// ============ Execution Helpers ============

/**
 * Queue a succeeded proposal in the timelock
 */
export async function queueProposal(
  governor: GovernorContract,
  params: ProposalParams,
  executorAccount: Account
): Promise<void> {
  const { targets, values, calldatas, description } = params;
  const descriptionHash = hashDescription(description);

  await governor.write.queue([targets, values, calldatas, descriptionHash], {
    account: executorAccount,
  });
}

/**
 * Execute a queued proposal after timelock delay
 */
export async function executeProposal(
  governor: GovernorContract,
  params: ProposalParams,
  executorAccount: Account
): Promise<void> {
  const { targets, values, calldatas, description } = params;
  const descriptionHash = hashDescription(description);

  await governor.write.execute([targets, values, calldatas, descriptionHash], {
    account: executorAccount,
  });
}

/**
 * Cancel a proposal
 */
export async function cancelProposal(
  governor: GovernorContract,
  params: ProposalParams,
  cancellerAccount: Account
): Promise<void> {
  const { targets, values, calldatas, description } = params;
  const descriptionHash = hashDescription(description);

  await governor.write.cancel([targets, values, calldatas, descriptionHash], {
    account: cancellerAccount,
  });
}

// ============ Full Lifecycle Helpers ============

/**
 * Execute a complete proposal lifecycle:
 * Create → Vote → Queue → Wait → Execute
 * 
 * Useful for integration tests
 */
export async function executeFullProposalLifecycle(
  governor: GovernorContract,
  params: ProposalParams,
  proposerAccount: Account,
  voterAccount: Account,
  networkHelpers: NetworkHelpers
): Promise<bigint> {
  // 1. Create proposal
  const proposalId = await createProposal(governor, params, proposerAccount);

  // 2. Wait for voting delay
  await advancePastVotingDelay(governor, networkHelpers);

  // 3. Vote FOR
  await voteFor(governor, proposalId, voterAccount);

  // 4. Wait for voting period to end
  await advancePastVotingPeriod(governor, networkHelpers);

  // 5. Queue in timelock
  await queueProposal(governor, params, proposerAccount);

  // 6. Wait for timelock delay
  await advancePastTimelockDelay(networkHelpers);

  // 7. Execute
  await executeProposal(governor, params, proposerAccount);

  return proposalId;
}

// ============ Assertion Helpers ============

/**
 * Asserts that a promise rejects with a custom error containing the expected error name
 * This is needed because hardhat-viem-assertions doesn't properly support Solidity custom errors
 * 
 * @param promise The promise that should reject
 * @param expectedErrorName The name of the custom error (e.g., "GovernorInsufficientProposerVotes")
 * @param message Optional assertion message
 */
export async function assertRevertWithCustomError(
  promise: Promise<unknown>,
  expectedErrorName: string,
  message?: string
): Promise<void> {
  try {
    await promise;
    throw new Error(message || `Expected transaction to revert with ${expectedErrorName}`);
  } catch (error: unknown) {
    // Check if this is our assertion error (test failed)
    if (error instanceof Error && error.message.includes("Expected transaction to revert")) {
      throw error;
    }
    
    // Collect all error text from various error properties
    // Viem errors have complex nested structures
    const errorTexts: string[] = [];
    
    // Add basic error info
    errorTexts.push(String(error));
    if (error instanceof Error) {
      errorTexts.push(error.message);
      errorTexts.push(error.name);
      if (error.stack) errorTexts.push(error.stack);
    }
    
    // Check cause chain (viem wraps errors)
    let currentError: unknown = error;
    for (let i = 0; i < 5; i++) {
      if (currentError && typeof currentError === 'object') {
        const err = currentError as Record<string, unknown>;
        
        // Add various error properties that might contain the error name
        if (err.message) errorTexts.push(String(err.message));
        if (err.name) errorTexts.push(String(err.name));
        if (err.details) errorTexts.push(String(err.details));
        if (err.shortMessage) errorTexts.push(String(err.shortMessage));
        if (err.metaMessages && Array.isArray(err.metaMessages)) {
          errorTexts.push(...err.metaMessages.map(String));
        }
        if (err.data) {
          try {
            errorTexts.push(JSON.stringify(err.data));
          } catch {
            errorTexts.push(String(err.data));
          }
        }
        
        // Move to cause for next iteration
        currentError = err.cause;
      } else {
        break;
      }
    }
    
    // Try to stringify the entire error object
    try {
      const allProps = Object.getOwnPropertyNames(error as object);
      errorTexts.push(JSON.stringify(error, allProps, 2));
    } catch {
      // Ignore stringify errors
    }
    
    const allErrorText = errorTexts.join(' ');
    
    if (!allErrorText.includes(expectedErrorName)) {
      throw new Error(
        message || 
        `Expected custom error "${expectedErrorName}" but got: ${(error as Error)?.message?.slice(0, 200) || String(error).slice(0, 200)}`
      );
    }
    // Success - error contains expected custom error name
  }
}

/**
 * Get the current state of a proposal
 */
export async function getProposalState(
  governor: GovernorContract,
  proposalId: bigint
): Promise<ProposalState> {
  const state = await governor.read.state([proposalId]);
  return state as ProposalState;
}

/**
 * Get proposal vote counts
 */
export async function getProposalVotes(
  governor: GovernorContract,
  proposalId: bigint
): Promise<{ againstVotes: bigint; forVotes: bigint; abstainVotes: bigint }> {
  const [againstVotes, forVotes, abstainVotes] = await governor.read.proposalVotes([proposalId]);
  return { againstVotes, forVotes, abstainVotes };
}
