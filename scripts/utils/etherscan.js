/**
 * @title Etherscan API Utility
 * @notice Centralized Etherscan API communication layer
 * @dev Single Responsibility: Handles all direct Etherscan API interactions
 * 
 * This module provides:
 * - Configuration retrieval for Etherscan API
 * - Source code verification submission
 * - Proxy contract verification
 * - Status polling with retry logic
 */

import hre, { network } from "hardhat";

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** @notice Networks where verification should be skipped */
export const LOCAL_NETWORKS = ["hardhat", "localhost", "hardhatMainnet", "hardhatOp"];

/** @notice Etherscan V2 API unified endpoint */
const ETHERSCAN_API_URL = "https://api.etherscan.io/v2/api";

/**
 * @notice Resolve Etherscan API key.
 *
 * @dev Hardhat v3 supports `configVariable("ENV_NAME")` which produces a *configuration variable object*,
 *      not a string. Hardhat resolves it at runtime (and hardhat-keystore can provide the value via hooks).
 *
 *      The hardhat-verify plugin uses `hre.config.verify.etherscan.apiKey`, so we mirror that behavior here.
 *      Fallback to `process.env.ETHERSCAN_API_KEY` for convenience.
 */
const resolveEtherscanApiKey = async () => {
  const fromConfig = hre.config?.verify?.etherscan?.apiKey;

  // Case 1: plain string
  if (typeof fromConfig === "string" && fromConfig.length > 0) {
    return fromConfig;
  }

  // Case 2: resolved configuration variable (Hardhat internal)
  // It implements `.get(): Promise<string>`
  if (
    fromConfig !== undefined &&
    fromConfig !== null &&
    typeof fromConfig === "object" &&
    // eslint-disable-next-line no-prototype-builtins
    ("get" in fromConfig) &&
    typeof fromConfig.get === "function"
  ) {
    const v = await fromConfig.get();
    if (typeof v === "string" && v.length > 0) {
      return v;
    }
  }

  // Fallback: direct env var
  const fromEnv = process.env.ETHERSCAN_API_KEY;
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    return fromEnv;
  }

  return null;
};

/** @notice Default retry configuration */
const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 10000,
  checkInterval: 5000,
  maxStatusChecks: 10,
};

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

/** @notice Promisified delay function */
export const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if the current network is a local network
 * @param {string} networkName - The network name
 * @returns {boolean} True if local network
 */
export const isLocalNetwork = (networkName) => LOCAL_NETWORKS.includes(networkName);

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Get Etherscan API configuration for the current network
 * @returns {Promise<{apiUrl: string, apiKey: string, chainId: number}>}
 */
export const getEtherscanConfig = async () => {
  // Get chain ID using Hardhat v3 pattern
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const chainId = await publicClient.getChainId();

  const apiKey = await resolveEtherscanApiKey();
  if (!apiKey) {
    throw new Error(
      "Missing ETHERSCAN_API_KEY. Set it in .env or hardhat.config.ts verify.etherscan.apiKey."
    );
  }

  return { apiUrl: ETHERSCAN_API_URL, apiKey, chainId };
};

// ═══════════════════════════════════════════════════════════════════════════
// STATUS CHECKING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Poll Etherscan for source code verification status
 * @param {Object} params - Parameters
 * @param {string} params.apiUrl - Etherscan API URL
 * @param {string} params.apiKey - API key
 * @param {number} params.chainId - Chain ID
 * @param {string} params.guid - Verification request GUID
 * @param {Object} [params.config] - Retry configuration
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const checkVerificationStatus = async ({
  apiUrl,
  apiKey,
  chainId,
  guid,
  config = {},
}) => {
  const { maxStatusChecks, checkInterval } = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  for (let i = 0; i < maxStatusChecks; i++) {
    await delay(checkInterval);
    
    try {
      const params = new URLSearchParams({
        chainid: chainId.toString(),
        apikey: apiKey,
        module: "contract",
        action: "checkverifystatus",
        guid,
      });
      
      const response = await fetch(`${apiUrl}?${params.toString()}`);
      const result = await response.json();
      
      const resultText = typeof result.result === "string" ? result.result : "";

      if (resultText === "Pass - Verified") {
        return { success: true, message: "Verified successfully!" };
      }

      // Etherscan sometimes returns this for already-verified contracts (still via GUID)
      if (resultText.toLowerCase().includes("already verified")) {
        return { success: true, message: "Already verified" };
      }
      
      if (resultText.toLowerCase().includes("fail")) {
        return { success: false, message: resultText };
      }
      
      console.log(`   Status [${i + 1}/${maxStatusChecks}]: ${result.result}`);
    } catch (error) {
      console.log(`   Status check error: ${error.message}`);
    }
  }
  
  return {
    success: false,
    message: "Verification still pending after timeout. Check Etherscan manually.",
  };
};

/**
 * Poll Etherscan for proxy verification status
 * @param {Object} params - Parameters
 * @param {string} params.apiUrl - Etherscan API URL
 * @param {string} params.apiKey - API key
 * @param {number} params.chainId - Chain ID
 * @param {string} params.guid - Verification request GUID
 * @param {Object} [params.config] - Retry configuration
 * @returns {Promise<boolean>}
 */
export const checkProxyVerificationStatus = async ({
  apiUrl,
  apiKey,
  chainId,
  guid,
  config = {},
}) => {
  const { maxStatusChecks, checkInterval } = { ...DEFAULT_RETRY_CONFIG, ...config };
  
  for (let i = 0; i < maxStatusChecks; i++) {
    await delay(checkInterval);
    
    try {
      const url = new URL(apiUrl);
      url.searchParams.set("chainid", chainId.toString());
      url.searchParams.set("module", "contract");
      url.searchParams.set("action", "checkproxyverification");
      url.searchParams.set("guid", guid);
      url.searchParams.set("apikey", apiKey);
      
      const response = await fetch(url.toString());
      const result = await response.json();
      
      const proxyResultText = typeof result.result === "string" ? result.result : "";

      if (result.status === "1") {
        return true;
      }

      // For EIP-1167 clones, Etherscan's proxy endpoint often can't detect the implementation.
      // This is not a transient condition in most cases, so treat it as terminal to avoid spamming retries.
      if (proxyResultText.toLowerCase().includes("unfortunately not detected")) {
        console.log(`   Proxy verification unsupported for this address (Etherscan couldn't detect implementation).`);
        return false;
      }
      
      if (proxyResultText.toLowerCase().includes("fail")) {
        console.log(`   Proxy verification failed: ${proxyResultText}`);
        return false;
      }
      
      console.log(`   Proxy status [${i + 1}/${maxStatusChecks}]: ${proxyResultText}`);
    } catch (error) {
      console.log(`   Proxy status check error: ${error.message}`);
    }
  }
  
  return false;
};

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICATION SUBMISSION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Submit source code for verification via Etherscan API
 * @param {Object} params - Parameters
 * @param {string} params.contractAddress - Contract address
 * @param {string} params.sourceCode - Standard JSON input (stringified)
 * @param {string} params.contractFQN - Fully qualified contract name
 * @param {string} params.compilerVersion - Compiler version (e.g., "v0.8.28+commit....")
 * @param {string} params.constructorArgsEncoded - Hex-encoded constructor args (no 0x prefix)
 * @param {string} params.apiUrl - Etherscan API URL
 * @param {string} params.apiKey - API key
 * @param {number} params.chainId - Chain ID
 * @returns {Promise<{success: boolean, guid?: string, message: string}>}
 */
export const submitSourceVerification = async ({
  contractAddress,
  sourceCode,
  contractFQN,
  compilerVersion,
  constructorArgsEncoded,
  apiUrl,
  apiKey,
  chainId,
}) => {
  console.log(`   Chain ID: ${chainId}`);
  console.log(`   Contract: ${contractFQN}`);
  console.log(`   Address: ${contractAddress}`);
  console.log(`   API Key: ${apiKey ? apiKey.substring(0, 4) + '...' + apiKey.substring(apiKey.length - 4) : 'UNDEFINED'} (length: ${apiKey?.length || 0})`);
  
  // For Etherscan V2 API, chainid and apikey go in URL query params
  const url = new URL(apiUrl);
  url.searchParams.set("chainid", chainId.toString());
  url.searchParams.set("apikey", apiKey);
  
  // POST body contains the verification data
  const params = new URLSearchParams();
  params.append("module", "contract");
  params.append("action", "verifysourcecode");
  params.append("contractaddress", contractAddress);
  params.append("sourceCode", sourceCode);
  params.append("codeformat", "solidity-standard-json-input");
  params.append("contractname", contractFQN);
  params.append("compilerversion", compilerVersion);
  // Note: Etherscan API has this typo "Arguements"
  params.append("constructorArguements", constructorArgsEncoded);
  
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  
  const result = await response.json();
  
  // Debug: Log full response
  console.log(`   API Response: status=${result.status}, message=${result.message}, result=${typeof result.result === 'string' ? result.result.substring(0, 200) : result.result}`);
  
  if (result.status === "1") {
    return { success: true, guid: result.result, message: "Submitted" };
  }
  
  if (result.result?.toLowerCase().includes("already verified")) {
    return { success: true, message: "Already verified!" };
  }
  
  // Return both message and result for better error info
  const errorMsg = result.result || result.message || "Unknown error";
  return { success: false, message: errorMsg };
};

/**
 * Submit proxy verification request via Etherscan API
 * @param {Object} params - Parameters
 * @param {string} params.proxyAddress - Proxy contract address
 * @param {string} [params.expectedImplementation] - Expected implementation address
 * @param {string} params.apiUrl - Etherscan API URL
 * @param {string} params.apiKey - API key
 * @param {number} params.chainId - Chain ID
 * @returns {Promise<{success: boolean, guid?: string, message: string}>}
 */
export const submitProxyVerification = async ({
  proxyAddress,
  expectedImplementation,
  apiUrl,
  apiKey,
  chainId,
}) => {
  const url = new URL(apiUrl);
  url.searchParams.set("chainid", chainId.toString());
  url.searchParams.set("module", "contract");
  url.searchParams.set("action", "verifyproxycontract");
  url.searchParams.set("apikey", apiKey);
  
  const formData = new URLSearchParams();
  formData.append("address", proxyAddress);
  if (expectedImplementation) {
    formData.append("expectedimplementation", expectedImplementation);
  }
  
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formData.toString(),
  });
  
  const result = await response.json();
  
  if (result.status === "1") {
    return { success: true, guid: result.result, message: "Submitted" };
  }
  
  if (
    result.result?.toLowerCase().includes("already verified") ||
    result.message?.toLowerCase().includes("already verified")
  ) {
    return { success: true, message: "Already verified!" };
  }
  
  return { success: false, message: result.message || result.result };
};

export default {
  LOCAL_NETWORKS,
  delay,
  isLocalNetwork,
  getEtherscanConfig,
  checkVerificationStatus,
  checkProxyVerificationStatus,
  submitSourceVerification,
  submitProxyVerification,
};
