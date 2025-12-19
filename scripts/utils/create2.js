/**
 * @title CREATE2 Utilities
 * @notice Utilities for deterministic contract deployment across EVM chains
 * @dev Uses Arachnid's Deterministic Deployment Proxy (available on 100+ chains)
 * 
 * The CREATE2 address formula:
 * address = keccak256(0xff ++ deployerAddress ++ salt ++ keccak256(initCode))[12:]
 * 
 * This ensures the same contract address on every chain when:
 * 1. The deployer address is the same (Arachnid's proxy)
 * 2. The salt is the same
 * 3. The bytecode is identical (same compiler settings)
 */

import { keccak256, getAddress, concat, toBytes, encodePacked } from "viem";

/**
 * Arachnid's Deterministic Deployment Proxy
 * Deployed at the same address on 100+ EVM chains via nick's method
 * @see https://github.com/Arachnid/deterministic-deployment-proxy
 */
export const DETERMINISTIC_DEPLOYER = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

/**
 * Default salt for DAOFactory deployment
 * Change this value to deploy to a different address
 */
export const DEFAULT_FACTORY_SALT = keccak256(toBytes("createDAO_DAOFactory_v1_dev"));

/**
 * Compute the CREATE2 address for a contract
 * @param {string} deployerAddress - The address of the CREATE2 deployer
 * @param {string} salt - The 32-byte salt (hex string)
 * @param {string} initCode - The contract creation bytecode (hex string)
 * @returns {string} The predicted contract address
 */
export const computeCreate2Address = (deployerAddress, salt, initCode) => {
  // CREATE2 address = keccak256(0xff ++ deployer ++ salt ++ keccak256(initCode))[12:]
  const initCodeHash = keccak256(initCode);
  
  const data = encodePacked(
    ["bytes1", "address", "bytes32", "bytes32"],
    ["0xff", deployerAddress, salt, initCodeHash]
  );
  
  const hash = keccak256(data);
  
  // Take last 20 bytes (40 hex chars) as the address
  return getAddress(`0x${hash.slice(-40)}`);
};

/**
 * Compute the predicted address for DAOFactory using default settings
 * @param {string} initCode - The DAOFactory creation bytecode
 * @param {string} [salt] - Optional custom salt (defaults to DEFAULT_FACTORY_SALT)
 * @returns {string} The predicted DAOFactory address
 */
export const computeFactoryAddress = (initCode, salt = DEFAULT_FACTORY_SALT) => {
  return computeCreate2Address(DETERMINISTIC_DEPLOYER, salt, initCode);
};

/**
 * Check if a contract is already deployed at an address
 * @param {object} publicClient - Viem public client
 * @param {string} address - The address to check
 * @returns {Promise<boolean>} True if contract exists at address
 */
export const isContractDeployed = async (publicClient, address) => {
  const code = await publicClient.getCode({ address });
  return code !== undefined && code !== "0x" && code.length > 2;
};

/**
 * Check if Arachnid's deployer is available on the current chain
 * @param {object} publicClient - Viem public client
 * @returns {Promise<boolean>} True if deployer is available
 */
export const isDeployerAvailable = async (publicClient) => {
  return isContractDeployed(publicClient, DETERMINISTIC_DEPLOYER);
};

/**
 * Build the transaction data for CREATE2 deployment
 * The deployer expects: salt (32 bytes) + initCode
 * @param {string} salt - The 32-byte salt (hex string with 0x prefix)
 * @param {string} initCode - The contract creation bytecode (hex string)
 * @returns {string} The transaction data
 */
export const buildDeploymentData = (salt, initCode) => {
  // Remove 0x prefix from both and concatenate
  const saltWithoutPrefix = salt.startsWith("0x") ? salt.slice(2) : salt;
  const initCodeWithoutPrefix = initCode.startsWith("0x") ? initCode.slice(2) : initCode;
  
  return `0x${saltWithoutPrefix}${initCodeWithoutPrefix}`;
};

/**
 * Deploy a contract using CREATE2 via Arachnid's deployer
 * @param {object} options - Deployment options
 * @param {object} options.walletClient - Viem wallet client
 * @param {object} options.publicClient - Viem public client
 * @param {string} options.initCode - Contract creation bytecode
 * @param {string} [options.salt] - Optional custom salt
 * @returns {Promise<{address: string, txHash: string}>} Deployed contract address and tx hash
 */
export const deployViaCreate2 = async ({
  walletClient,
  publicClient,
  initCode,
  salt = DEFAULT_FACTORY_SALT,
}) => {
  // Compute expected address
  const expectedAddress = computeCreate2Address(DETERMINISTIC_DEPLOYER, salt, initCode);
  
  // Check if already deployed
  if (await isContractDeployed(publicClient, expectedAddress)) {
    return {
      address: expectedAddress,
      txHash: null,
      alreadyDeployed: true,
    };
  }
  
  // Check if deployer is available
  if (!(await isDeployerAvailable(publicClient))) {
    throw new Error(
      `Deterministic deployer not available at ${DETERMINISTIC_DEPLOYER} on this chain. ` +
      "See https://github.com/Arachnid/deterministic-deployment-proxy for deployment instructions."
    );
  }
  
  // Build deployment transaction data
  const data = buildDeploymentData(salt, initCode);
  
  // Send deployment transaction
  const txHash = await walletClient.sendTransaction({
    to: DETERMINISTIC_DEPLOYER,
    data,
  });
  
  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  
  // Verify deployment
  if (!(await isContractDeployed(publicClient, expectedAddress))) {
    throw new Error(
      `Deployment transaction succeeded but contract not found at expected address ${expectedAddress}. ` +
      `Transaction: ${txHash}`
    );
  }
  
  return {
    address: expectedAddress,
    txHash,
    alreadyDeployed: false,
  };
};

/**
 * Get deployment info for verification purposes
 * @param {string} initCode - Contract creation bytecode
 * @param {string} [salt] - Optional custom salt
 * @returns {object} Deployment info including predicted address
 */
export const getDeploymentInfo = (initCode, salt = DEFAULT_FACTORY_SALT) => {
  return {
    deployer: DETERMINISTIC_DEPLOYER,
    salt,
    initCodeHash: keccak256(initCode),
    predictedAddress: computeCreate2Address(DETERMINISTIC_DEPLOYER, salt, initCode),
  };
};

export default {
  DETERMINISTIC_DEPLOYER,
  DEFAULT_FACTORY_SALT,
  computeCreate2Address,
  computeFactoryAddress,
  isContractDeployed,
  isDeployerAvailable,
  buildDeploymentData,
  deployViaCreate2,
  getDeploymentInfo,
};
