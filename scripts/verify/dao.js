/**
 * @title DAO Verification
 * @notice Verifies the DAO proxy contracts and TimelockController
 * @dev Single Responsibility: Orchestrates DAO contract verification
 * 
 * Contract Types:
 * - DAOToken & DAOGovernor: EIP-1167 minimal proxies - verified via Etherscan Proxy API
 * - TimelockController: Standard OZ contract - verified with constructor args via direct API
 * 
 * EIP-1167 Proxy Verification:
 * Minimal proxies have a standard bytecode pattern that Etherscan can detect.
 * We use Etherscan's "verifyproxycontract" API endpoint to tell Etherscan
 * that these are proxies pointing to verified implementations.
 */

import * as logger from "../utils/logger.js";
import {
  isLocalNetwork,
  getEtherscanConfig,
  submitProxyVerification,
  checkProxyVerificationStatus,
  delay,
} from "../utils/etherscan.js";
import {
  verifyTimelockController,
  TIMELOCK_MIN_DELAY,
  ZERO_ADDRESS,
} from "../utils/verification-direct.js";

// ═══════════════════════════════════════════════════════════════════════════
// PROXY VERIFICATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify a proxy contract on Etherscan using the proxy verification API
 * @param {string} proxyAddress - The proxy contract address
 * @param {string} [expectedImplementation] - The expected implementation address (optional, for validation)
 * @param {string} networkName - The network name
 * @returns {Promise<boolean>} Whether verification was successful
 */
export const verifyProxyContract = async (proxyAddress, expectedImplementation, networkName) => {
  // Skip on local networks
  if (isLocalNetwork(networkName)) {
    logger.info(`Skipping proxy verification on local network: ${networkName}`);
    return true;
  }

  let etherscanConfig;
  try {
    etherscanConfig = await getEtherscanConfig();
  } catch (error) {
    logger.warn(`Cannot get Etherscan config: ${error.message}`);
    return false;
  }

  const { apiUrl, apiKey, chainId } = etherscanConfig;
  logger.info(`Verifying proxy at ${proxyAddress}...`);
  
  const maxRetries = 3;
  const initialDelay = 10000;

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Submit proxy verification request
      const submitResult = await submitProxyVerification({
        proxyAddress,
        expectedImplementation,
        apiUrl,
        apiKey,
        chainId,
      });

      // Already verified
      if (submitResult.success && !submitResult.guid) {
        logger.success(`Proxy already verified: ${proxyAddress}`);
        return true;
      }

      // Submission successful, poll for status
      if (submitResult.success && submitResult.guid) {
        logger.info(`Proxy verification submitted. GUID: ${submitResult.guid}`);
        
        const verified = await checkProxyVerificationStatus({
          apiUrl,
          apiKey,
          chainId,
          guid: submitResult.guid,
        });

        if (verified) {
          logger.success(`Proxy verification successful for ${proxyAddress}`);
          return true;
        }
      } else {
        logger.warn(`Proxy verification response: ${submitResult.message}`);
      }
    } catch (error) {
      logger.warn(`Proxy verification attempt ${i + 1} failed: ${error.message}`);
    }

    if (i < maxRetries - 1) {
      const waitTime = initialDelay * Math.pow(2, i);
      logger.info(`Retrying in ${waitTime / 1000} seconds...`);
      await delay(waitTime);
    }
  }

  logger.warn(`Proxy verification failed after ${maxRetries} attempts. You may need to manually verify on Etherscan.`);
  return false;
};

// ═══════════════════════════════════════════════════════════════════════════
// DAO VERIFICATION ORCHESTRATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Verify all DAO-related contracts
 * @param {Object} addresses - Object containing DAO addresses
 * @param {string} addresses.token - The DAOToken proxy address
 * @param {string} addresses.timelock - The TimelockController address
 * @param {string} addresses.governor - The DAOGovernor proxy address
 * @param {string} addresses.factory - The DAOFactory address
 * @param {string} [addresses.tokenImplementation] - The DAOToken implementation address
 * @param {string} [addresses.governorImplementation] - The DAOGovernor implementation address
 * @param {string} networkName - The network name (for skipping local networks)
 * @param {Object} [daoConfig] - The DAO configuration used during creation (for logging)
 */
export const verifyDAOContracts = async (addresses, networkName, daoConfig = null) => {
  // Skip verification on local networks
  if (isLocalNetwork(networkName)) {
    logger.info(`Skipping DAO contract verification on local network: ${networkName}`);
    return;
  }

  logger.subHeader("DAO Contract Verification");

  const { token, timelock, governor, factory, tokenImplementation, governorImplementation } = addresses;

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: Verify TimelockController with constructor arguments
  // ═══════════════════════════════════════════════════════════════════════════
  logger.info("");
  logger.info("Step 1: Verifying TimelockController...");
  logger.info("Using direct Etherscan API with standard JSON input...");
  
  const timelockResult = await verifyTimelockController({
    timelockAddress: timelock,
    factoryAddress: factory,
    minDelay: TIMELOCK_MIN_DELAY,
    networkName,
  });
  
  if (timelockResult.success) {
    logger.success(`TimelockController: ${timelockResult.message}`);
  } else {
    logger.warn(`TimelockController: ${timelockResult.message}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: Verify DAOToken Proxy
  // ═══════════════════════════════════════════════════════════════════════════
  logger.info("");
  logger.info("Step 2: Verifying DAOToken proxy...");
  logger.info("(Note: this is an EIP-1167 clone; Etherscan's proxy API may not detect the implementation immediately.)");
  
  await verifyProxyContract(token, tokenImplementation, networkName);

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 3: Verify DAOGovernor Proxy
  // ═══════════════════════════════════════════════════════════════════════════
  logger.info("");
  logger.info("Step 3: Verifying DAOGovernor proxy...");
  logger.info("(Note: this is an EIP-1167 clone; Etherscan's proxy API may not detect the implementation immediately.)");
  
  await verifyProxyContract(governor, governorImplementation, networkName);

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════
  logger.subHeader("Verification Summary");
  
  logger.info(`TimelockController: ${timelock}`);
  logger.info(`  → Verified with constructor args`);
  
  logger.info(`DAOToken Proxy: ${token}`);
  logger.info(`  → Implementation: ${tokenImplementation || "from factory"}`);
  
  logger.info(`DAOGovernor Proxy: ${governor}`);
  logger.info(`  → Implementation: ${governorImplementation || "from factory"}`);

  // Log initialization parameters for reference (if provided)
  if (daoConfig) {
    logger.info("");
    logger.info("DAO Initialize Parameters (for reference):");
    logger.info(`  Token Name: ${daoConfig.tokenName}`);
    logger.info(`  Token Symbol: ${daoConfig.tokenSymbol}`);
    logger.info(`  Total Supply: ${daoConfig.totalSupply}`);
    logger.info(`  DAO Name: ${daoConfig.daoName}`);
    logger.info(`  Voting Delay: ${daoConfig.votingDelay}`);
    logger.info(`  Voting Period: ${daoConfig.votingPeriod}`);
  }

  logger.info("");
  logger.info("Note: If proxy verification fails, you can manually verify on Etherscan:");
  logger.info("  1. Go to the proxy contract page on Etherscan");
  logger.info("  2. Click 'More Options' → 'Is this a proxy?'");
  logger.info("  3. Etherscan will auto-detect the implementation");
};

/**
 * Get TimelockController constructor args for manual verification
 * @param {string} factoryAddress - The factory address (used as initial admin)
 * @returns {Object} Constructor arguments object
 */
export const getTimelockConstructorArgs = (factoryAddress) => {
  return {
    minDelay: TIMELOCK_MIN_DELAY,
    proposers: [],
    executors: [ZERO_ADDRESS],
    admin: factoryAddress,
  };
};

export default {
  verifyDAOContracts,
  verifyProxyContract,
  getTimelockConstructorArgs,
};
