/**
 * @title Direct Verification Utility
 * @notice Verifies contracts using direct Etherscan API with standard JSON input
 * @dev Required for verifying contracts that don't have Hardhat artifacts
 *      (e.g., OpenZeppelin contracts imported via npm in Hardhat v3)
 * 
 * Single Responsibility: Handles direct API verification with build-info
 * 
 * The approach:
 * 1. Read build-info JSON from artifacts/build-info/
 * 2. Extract the standard JSON input (full compilation input)
 * 3. Submit to Etherscan API with constructor arguments
 * 4. Poll for verification status
 */

import fs from "fs";
import path from "path";
import { encodeAbiParameters } from "viem";
import {
  isLocalNetwork,
  getEtherscanConfig,
  submitSourceVerification,
  checkVerificationStatus,
  delay,
} from "./etherscan.js";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** @notice TimelockController fully qualified name */
export const TIMELOCK_FQN = "npm/@openzeppelin/contracts@5.4.0/governance/TimelockController.sol:TimelockController";

/** @notice TimelockController constructor parameter types */
export const TIMELOCK_CONSTRUCTOR_TYPES = [
  { type: "uint256" },  // minDelay
  { type: "address[]" }, // proposers
  { type: "address[]" }, // executors
  { type: "address" },   // admin
];

/** @notice Default min delay for TimelockController (1 day in seconds) */
export const TIMELOCK_MIN_DELAY = 86400n;

/** @notice Address(0) - used to allow anyone to execute */
export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// ═══════════════════════════════════════════════════════════════════════════
// BUILD INFO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Find and read the largest build-info file (contains full compilation)
 * @returns {{buildInfo: Object, fileName: string}} The build-info JSON object and filename
 * @throws {Error} If no build-info files are found
 */
export const getBuildInfo = () => {
  const buildInfoDir = path.join(process.cwd(), "artifacts", "build-info");
  
  if (!fs.existsSync(buildInfoDir)) {
    throw new Error("No build-info directory found. Run 'npx hardhat compile' first.");
  }
  
  // Get all build-info files (excluding .output.json files)
  const files = fs.readdirSync(buildInfoDir)
    .filter((f) => f.endsWith(".json") && !f.includes(".output."));
  
  if (files.length === 0) {
    throw new Error("No build-info files found. Run 'npx hardhat compile' first.");
  }
  
  // Find the largest build-info file (main compilation that includes all dependencies)
  let largest = { size: 0, file: null };
  for (const file of files) {
    const filePath = path.join(buildInfoDir, file);
    const stats = fs.statSync(filePath);
    if (stats.size > largest.size) {
      largest = { size: stats.size, file: filePath };
    }
  }
  
  const buildInfo = JSON.parse(fs.readFileSync(largest.file, "utf8"));
  return { buildInfo, fileName: path.basename(largest.file) };
};

// ═══════════════════════════════════════════════════════════════════════════
// CONSTRUCTOR ENCODING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Encode constructor arguments for Etherscan
 * @param {Array<{type: string}>} paramTypes - Array of ABI parameter types
 * @param {Array} paramValues - Array of parameter values
 * @returns {string} Hex-encoded constructor arguments without 0x prefix
 */
export const encodeConstructorArgs = (paramTypes, paramValues) => {
  const encoded = encodeAbiParameters(paramTypes, paramValues);
  // Remove 0x prefix for Etherscan
  return encoded.slice(2);
};

/**
 * Get encoded constructor args for TimelockController
 * @param {Object} params - Parameters
 * @param {string} params.adminAddress - Admin address (usually factory)
 * @param {bigint} [params.minDelay] - Min delay (default: 86400n = 1 day)
 * @param {string[]} [params.proposers] - Proposers array (default: empty)
 * @param {string[]} [params.executors] - Executors array (default: [address(0)])
 * @returns {string} Hex-encoded constructor arguments without 0x prefix
 */
export const getTimelockConstructorArgsEncoded = ({
  adminAddress,
  minDelay = TIMELOCK_MIN_DELAY,
  proposers = [],
  executors = [ZERO_ADDRESS],
}) => {
  return encodeConstructorArgs(TIMELOCK_CONSTRUCTOR_TYPES, [
    minDelay,
    proposers,
    executors,
    adminAddress,
  ]);
};

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify a contract on Etherscan using direct API with standard JSON input
 * @param {Object} options - Verification options
 * @param {string} options.contractAddress - The deployed contract address
 * @param {string} options.contractFQN - Fully qualified name (e.g., "@openzeppelin/contracts/governance/TimelockController.sol:TimelockController")
 * @param {string} options.constructorArgsEncoded - Hex-encoded constructor args (without 0x prefix)
 * @param {string} options.networkName - Network name (for skipping local networks)
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const verifyWithDirectApi = async ({
  contractAddress,
  contractFQN,
  constructorArgsEncoded,
  networkName,
}) => {
  // Skip verification on local networks
  if (isLocalNetwork(networkName)) {
    console.log(`   Skipping verification on local network: ${networkName}`);
    return { success: true, message: "Skipped on local network" };
  }
  
  const maxRetries = 3;
  const initialDelay = 10000;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Get Etherscan config
      const { apiUrl, apiKey, chainId } = await getEtherscanConfig();
      
      // Get build-info
      const { buildInfo, fileName } = getBuildInfo();
      console.log(`   Using build-info: ${fileName}`);
      
      // Get compiler version
      const compilerVersion = `v${buildInfo.solcLongVersion}`;
      console.log(`   Compiler: ${compilerVersion}`);
      
      // Extract standard JSON input
      const sourceCode = JSON.stringify(buildInfo.input);
      
      console.log(`   Submitting to Etherscan (attempt ${attempt + 1}/${maxRetries})...`);
      
      // Submit verification
      const submitResult = await submitSourceVerification({
        contractAddress,
        sourceCode,
        contractFQN,
        compilerVersion,
        constructorArgsEncoded,
        apiUrl,
        apiKey,
        chainId,
      });
      
      // If already verified, return success
      if (submitResult.success && !submitResult.guid) {
        return submitResult;
      }
      
      // If submission successful, poll for status
      if (submitResult.success && submitResult.guid) {
        console.log(`   Verification submitted. GUID: ${submitResult.guid}`);
        console.log(`   Polling for result...`);
        
        return await checkVerificationStatus({
          apiUrl,
          apiKey,
          chainId,
          guid: submitResult.guid,
        });
      }
      
      // Submission failed
      console.log(`   Submission response: ${submitResult.message}`);
      
      // If it's a retryable error, continue
      if (attempt < maxRetries - 1) {
        const waitTime = initialDelay * Math.pow(2, attempt);
        console.log(`   Retrying in ${waitTime / 1000} seconds...`);
        await delay(waitTime);
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
      
      if (attempt < maxRetries - 1) {
        const waitTime = initialDelay * Math.pow(2, attempt);
        console.log(`   Retrying in ${waitTime / 1000} seconds...`);
        await delay(waitTime);
      }
    }
  }
  
  return { success: false, message: `Failed after ${maxRetries} attempts` };
};

/**
 * Verify TimelockController contract
 * @param {Object} options
 * @param {string} options.timelockAddress - The deployed TimelockController address
 * @param {string} options.factoryAddress - The factory address (used as admin in constructor)
 * @param {bigint} [options.minDelay] - The minimum delay (default: 86400n = 1 day)
 * @param {string} options.networkName - Network name
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const verifyTimelockController = async ({
  timelockAddress,
  factoryAddress,
  minDelay = TIMELOCK_MIN_DELAY,
  networkName,
}) => {
  const constructorArgsEncoded = getTimelockConstructorArgsEncoded({
    adminAddress: factoryAddress,
    minDelay,
  });
  
  return verifyWithDirectApi({
    contractAddress: timelockAddress,
    contractFQN: TIMELOCK_FQN,
    constructorArgsEncoded,
    networkName,
  });
};

export default {
  // Constants
  TIMELOCK_FQN,
  TIMELOCK_CONSTRUCTOR_TYPES,
  TIMELOCK_MIN_DELAY,
  ZERO_ADDRESS,
  // Functions
  getBuildInfo,
  encodeConstructorArgs,
  getTimelockConstructorArgsEncoded,
  verifyWithDirectApi,
  verifyTimelockController,
};
