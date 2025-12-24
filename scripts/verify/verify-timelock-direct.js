/**
 * @title Verify TimelockController - Standalone Script
 * @notice Verifies an already-deployed TimelockController on Etherscan
 * @dev Uses direct Etherscan API with standard JSON input (required for OZ contracts in Hardhat v3)
 * 
 * Usage:
 *   TIMELOCK_ADDRESS=0x... FACTORY_ADDRESS=0x... npx hardhat run scripts/verify/verify-timelock-direct.js --network sepolia
 * 
 * Environment Variables:
 *   - TIMELOCK_ADDRESS: The deployed TimelockController address
 *   - FACTORY_ADDRESS: The DAOFactory address (used as initial admin in constructor)
 */

import hre, { network } from "hardhat";
import * as logger from "../utils/logger.js";
import {
  verifyTimelockController,
  TIMELOCK_MIN_DELAY,
  ZERO_ADDRESS,
} from "../utils/verification-direct.js";

/**
 * Get network name reliably in Hardhat v3
 * @returns {Promise<string>}
 */
const getNetworkName = async () => {
  // Try different methods to get network name
  if (hre.network?.name) {
    return hre.network.name;
  }
  
  // Fallback: get from network config
  try {
    const { viem } = await network.connect();
    const publicClient = await viem.getPublicClient();
    const chainId = await publicClient.getChainId();
    
    // Map chain ID to network name
    const chainIdToNetwork = {
      1: "mainnet",
      11155111: "sepolia",
      5: "goerli",
      10: "optimism",
      42161: "arbitrum",
      137: "polygon",
      31337: "hardhat",
    };
    
    return chainIdToNetwork[chainId] || `chain-${chainId}`;
  } catch {
    return "unknown";
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Validate that an address is properly formatted
 * @param {string} address - The address to validate
 * @param {string} name - The name of the address (for error messages)
 * @throws {Error} If the address is invalid
 */
const validateAddress = (address, name) => {
  if (!address || address.length !== 42 || !address.startsWith("0x")) {
    throw new Error(
      `Invalid or missing ${name}. ` +
      `Expected a 42-character hex address starting with '0x', got: ${address || "(empty)"}`
    );
  }
};

/**
 * Parse and validate configuration from environment variables
 * @returns {{timelockAddress: string, factoryAddress: string}}
 */
const getConfig = () => {
  const timelockAddress = process.env.TIMELOCK_ADDRESS || "";
  const factoryAddress = process.env.FACTORY_ADDRESS || "";
  
  validateAddress(timelockAddress, "TIMELOCK_ADDRESS");
  validateAddress(factoryAddress, "FACTORY_ADDRESS");
  
  return { timelockAddress, factoryAddress };
};

/**
 * Display usage information
 */
const showUsage = () => {
  logger.info("");
  logger.info("Usage:");
  logger.info("  TIMELOCK_ADDRESS=0x... FACTORY_ADDRESS=0x... npx hardhat run scripts/verify/verify-timelock-direct.js --network <network>");
};

// ═══════════════════════════════════════════════════════════════════════════
// MAIN SCRIPT
// ═══════════════════════════════════════════════════════════════════════════

const main = async () => {
  logger.header("VERIFY TIMELOCK CONTROLLER");
  
  // Get network info (using fallback for Hardhat v3 compatibility)
  const networkName = await getNetworkName();
  logger.info(`Network: ${networkName}`);
  
  // Validate configuration
  let config;
  try {
    config = getConfig();
  } catch (error) {
    logger.error(error.message);
    showUsage();
    process.exit(1);
  }
  
  const { timelockAddress, factoryAddress } = config;
  
  // Log configuration
  logger.subHeader("Contract Addresses");
  logger.info(`TimelockController: ${timelockAddress}`);
  logger.info(`Factory (admin):    ${factoryAddress}`);
  
  // Log constructor arguments for reference
  logger.subHeader("Constructor Arguments");
  logger.info(`minDelay:  ${TIMELOCK_MIN_DELAY.toString()} (${Number(TIMELOCK_MIN_DELAY) / 86400} days)`);
  logger.info(`proposers: [] (empty - governor added via grantRole)`);
  logger.info(`executors: [${ZERO_ADDRESS}] (anyone)`);
  logger.info(`admin:     ${factoryAddress} (revoked after setup)`);
  
  // Run verification
  logger.subHeader("Verification");
  logger.info("Using direct Etherscan API with standard JSON input...");
  
  const result = await verifyTimelockController({
    timelockAddress,
    factoryAddress,
    minDelay: TIMELOCK_MIN_DELAY,
    networkName,
  });
  
  if (result.success) {
    logger.success(`TimelockController verification completed: ${result.message}`);
  } else {
    logger.error(`TimelockController verification failed: ${result.message}`);
    process.exit(1);
  }
};

// Execute
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
