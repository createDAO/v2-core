/**
 * @title Configuration
 * @notice Centralized configuration for DAO deployment
 * @dev All DAO creation parameters are defined here for easy modification
 */

import { parseEther } from "viem";

/**
 * Default DAO creation parameters
 * These values can be modified to customize the DAO deployment
 */
export const DEFAULT_DAO_CONFIG = {
  // DAO Identity
  daoName: "TestDAO",
  tokenName: "TestDAO Token",
  tokenSymbol: "TEST",

  // Token Economics
  // 1,000,000 tokens with 18 decimals
  totalSupply: parseEther("1000000"),

  // Governance Timing (in blocks)
  // votingDelay: ~1 day on mainnet (assuming ~12 sec blocks)
  votingDelay: 7200n,
  // votingPeriod: ~1 week on mainnet (assuming ~12 sec blocks)
  votingPeriod: 50400n,
};

/**
 * Testnet-specific DAO configuration
 * Shorter delays for faster testing
 */
export const TESTNET_DAO_CONFIG = {
  ...DEFAULT_DAO_CONFIG,
  // Shorter delays for testnet testing
  // votingDelay: ~10 minutes on Sepolia (assuming ~12 sec blocks)
  votingDelay: 50n,
  // votingPeriod: ~1 hour on Sepolia (assuming ~12 sec blocks)
  votingPeriod: 300n,
};

/**
 * Factory constants (from contract)
 * These are immutable values defined in DAOFactory.sol
 */
export const FACTORY_CONSTANTS = {
  // Percentage of tokens sent to creator (1%)
  CREATOR_ALLOCATION_PERCENT: 1n,
  // Fixed timelock delay: 1 day in seconds
  TIMELOCK_MIN_DELAY: 86400n,
  // Quorum fraction (1% of total supply)
  QUORUM_FRACTION: 1n,
};

/**
 * Get the appropriate config based on network
 * @param {string} networkName - The network name from hardhat
 * @returns {Object} The DAO configuration for the network
 */
export const getConfigForNetwork = (networkName) => {
  const testnetworks = [
    "sepolia",
    "basesepolia",
    "hardhat",
    "localhost",
    "hardhatMainnet",
    "hardhatOp",
  ];

  if (testnetworks.includes(networkName)) {
    return TESTNET_DAO_CONFIG;
  }

  return DEFAULT_DAO_CONFIG;
};

export default {
  DEFAULT_DAO_CONFIG,
  TESTNET_DAO_CONFIG,
  FACTORY_CONSTANTS,
  getConfigForNetwork,
};
