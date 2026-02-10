/**
 * Test Constants
 * Centralized configuration for all test files (DRY principle)
 */
import { parseEther } from "viem";

// ============ DAO Configuration ============

export const DEFAULT_DAO_PARAMS = {
  daoName: "Test DAO",
  tokenName: "Test Token",
  tokenSymbol: "TEST",
  totalSupply: parseEther("1000000"), // 1 million tokens
  votingDelay: 1n, // 1 second (fast for testing)
  votingPeriod: 100n, // 100 seconds (fast for testing)
  // Note: Hardhat auto-increments block timestamp by 1 second per tx.
  // If timelockDelay is 1 second, a queue tx and an immediate execute tx can land
  // in blocks with timestamps t and t+1, making the timelock ready immediately.
  timelockDelay: 2n, // 2 seconds (fast for testing, but still enforces delay)
} as const;

// ============ Token Distribution ============

export const CREATOR_ALLOCATION_PERCENT = 1n;
export const TREASURY_ALLOCATION_PERCENT = 99n;

// ============ Timelock ============

export const TIMELOCK_MIN_DELAY = 86400n; // 1 day in seconds

// ============ Governance ============

export const QUORUM_NUMERATOR = 1n; // 1% quorum
export const VOTE_FOR = 1;
export const VOTE_AGAINST = 0;
export const VOTE_ABSTAIN = 2;

// ============ Proposal States (from GovernorUpgradeable) ============

export enum ProposalState {
  Pending = 0,
  Active = 1,
  Canceled = 2,
  Defeated = 3,
  Succeeded = 4,
  Queued = 5,
  Expired = 6,
  Executed = 7,
}

// ============ Test Addresses ============

export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;
// Using a properly checksummed address (getAddress("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"))
export const NON_OWNER_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const;

// ============ Helper Functions ============

export function calculateCreatorAmount(totalSupply: bigint): bigint {
  return (totalSupply * CREATOR_ALLOCATION_PERCENT) / 100n;
}

export function calculateTreasuryAmount(totalSupply: bigint): bigint {
  return totalSupply - calculateCreatorAmount(totalSupply);
}

export function calculateProposalThreshold(totalSupply: bigint): bigint {
  return (totalSupply * CREATOR_ALLOCATION_PERCENT) / 100n;
}
