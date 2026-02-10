/**
 * @title Deterministic Factory Deployment
 * @notice Deploys the DAOFactory contract using CREATE2 for same-address cross-chain deployment
 * @dev Uses Arachnid's Deterministic Deployment Proxy to ensure identical addresses across all EVM chains
 * 
 * Deployment Flow:
 * 1. Deploy DAOToken implementation via CREATE2 (deterministic)
 * 2. Deploy DAOGovernor implementation via CREATE2 (deterministic)
 * 3. Deploy DAOTimelock implementation via CREATE2 (deterministic)
 * 4. Deploy DAOFactory via CREATE2 with implementation addresses as constructor args
 * 
 * All contracts (implementations + factory) will have identical addresses across all chains.
 * 
 * Usage:
 *   npx hardhat run scripts/deploy/factoryDeterministic.js --network <network>
 * 
 * Requirements:
 * - Same compiler settings (Solidity version, optimizer, viaIR) across all deployments
 * - Arachnid's deployer must be available on the target chain (most chains have it)
 * 
 * @see https://github.com/Arachnid/deterministic-deployment-proxy
 */

import { network, artifacts } from "hardhat";
import path from "path";
import { fileURLToPath } from "url";
import { encodeAbiParameters, parseAbiParameters } from "viem";
import * as logger from "../utils/logger.js";
import {
  DETERMINISTIC_DEPLOYER,
  DEFAULT_FACTORY_SALT,
  TOKEN_IMPL_SALT,
  GOVERNOR_IMPL_SALT,
  TIMELOCK_IMPL_SALT,
  computeCreate2Address,
  deployViaCreate2,
  isDeployerAvailable,
  isContractDeployed,
  getDeploymentInfo,
} from "../utils/create2.js";

/**
 * Deploy the DAOFactory contract using CREATE2 for deterministic addressing
 * 
 * Deployment Flow:
 * 1. Deploy DAOToken implementation via CREATE2 (deterministic)
 * 2. Deploy DAOGovernor implementation via CREATE2 (deterministic)
 * 3. Deploy DAOTimelock implementation via CREATE2 (deterministic)
 * 4. Deploy DAOFactory via CREATE2 with implementation addresses (deterministic)
 * 
 * All contracts will have the same addresses across all chains.
 * 
 * @param {object} [options] - Deployment options
 * @param {string} [options.salt] - Custom salt (defaults to DEFAULT_FACTORY_SALT)
 * @returns {Object} Deployment result with factory and implementation addresses
 */
export const deployFactoryDeterministic = async (options = {}) => {
  const salt = options.salt || DEFAULT_FACTORY_SALT;
  
  // Connect to the network and get viem instance
  const { viem, networkName } = await network.connect();
  
  logger.header("Deterministic DAOFactory Deployment (CREATE2)");
  logger.info(`Network: ${networkName}`);
  logger.info(`Using CREATE2 Deployer: ${DETERMINISTIC_DEPLOYER}`);
  logger.info(`Salt: ${salt}`);

  // Get the deployer wallet
  const [deployer] = await viem.getWalletClients();
  const deployerAddress = deployer.account.address;
  logger.info(`Deployer Wallet: ${deployerAddress}`);

  // Get public client for reading contract data
  const publicClient = await viem.getPublicClient();

  // Check deployer balance
  const balance = await publicClient.getBalance({ address: deployerAddress });
  logger.info(`Balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);

  // Verify Arachnid's deployer is available
  logger.subHeader("Checking Prerequisites");
  const deployerAvailable = await isDeployerAvailable(publicClient);
  if (!deployerAvailable) {
    logger.error(`Deterministic deployer not found at ${DETERMINISTIC_DEPLOYER}`);
    logger.error("This chain may not support CREATE2 deterministic deployment.");
    logger.info("See: https://github.com/Arachnid/deterministic-deployment-proxy");
    throw new Error("Deterministic deployer not available on this chain");
  }
  logger.success("Deterministic deployer is available");

  // STEP 1: Deploy implementation contracts via CREATE2 (deterministic)
  logger.subHeader("Step 1: Deploying Implementation Contracts (CREATE2)");
  
  // Get implementation bytecodes
  const tokenArtifact = await artifacts.readArtifact("DAOToken");
  const governorArtifact = await artifacts.readArtifact("DAOGovernor");
  const timelockArtifact = await artifacts.readArtifact("DAOTimelock");
  
  logger.info("Deploying DAOToken implementation via CREATE2...");
  const tokenResult = await deployViaCreate2({
    walletClient: deployer,
    publicClient,
    initCode: tokenArtifact.bytecode,
    salt: TOKEN_IMPL_SALT,
  });
  const tokenImplementation = tokenResult.address;
  logger.success(`DAOToken Implementation: ${tokenImplementation}${tokenResult.alreadyDeployed ? ' (already deployed)' : ''}`);
  
  logger.info("Deploying DAOGovernor implementation via CREATE2...");
  const governorResult = await deployViaCreate2({
    walletClient: deployer,
    publicClient,
    initCode: governorArtifact.bytecode,
    salt: GOVERNOR_IMPL_SALT,
  });
  const governorImplementation = governorResult.address;
  logger.success(`DAOGovernor Implementation: ${governorImplementation}${governorResult.alreadyDeployed ? ' (already deployed)' : ''}`);
  
  logger.info("Deploying DAOTimelock implementation via CREATE2...");
  const timelockResult = await deployViaCreate2({
    walletClient: deployer,
    publicClient,
    initCode: timelockArtifact.bytecode,
    salt: TIMELOCK_IMPL_SALT,
  });
  const timelockImplementation = timelockResult.address;
  logger.success(`DAOTimelock Implementation: ${timelockImplementation}${timelockResult.alreadyDeployed ? ' (already deployed)' : ''}`);

  // STEP 2: Prepare factory deployment with constructor args
  logger.subHeader("Step 2: Preparing DAOFactory Deployment");
  
  // Get DAOFactory bytecode
  const factoryArtifact = await artifacts.readArtifact("DAOFactory");
  
  // Encode constructor arguments: (address tokenImpl_, address governorImpl_, address timelockImpl_)
  const constructorArgs = encodeAbiParameters(
    parseAbiParameters("address, address, address"),
    [tokenImplementation, governorImplementation, timelockImplementation]
  );
  
  // Create initCode = bytecode + constructor args
  const initCode = factoryArtifact.bytecode + constructorArgs.slice(2); // Remove 0x from args

  // Compute deployment info
  const deploymentInfo = getDeploymentInfo(initCode, salt);
  const predictedAddress = deploymentInfo.predictedAddress;
  logger.info(`Predicted DAOFactory address: ${predictedAddress}`);
  
  // Check if already deployed
  const alreadyDeployed = await isContractDeployed(publicClient, predictedAddress);
  if (alreadyDeployed) {
    logger.warn(`DAOFactory already deployed at ${predictedAddress}`);
    logger.info("Note: Implementation contracts were still checked/deployed via CREATE2");
    
    const factory = await viem.getContractAt("DAOFactory", predictedAddress);

    return {
      factory: predictedAddress,
      tokenImplementation,
      governorImplementation,
      timelockImplementation,
      factoryContract: factory,
      networkName,
      viem,
      publicClient,
      alreadyDeployed: true,
      salt,
      txHash: null,
      deploymentInfo,
    };
  }

  // STEP 3: Deploy factory via CREATE2
  logger.subHeader("Step 3: Deploying DAOFactory via CREATE2");
  logger.info("Sending deployment transaction...");
  
  const result = await deployViaCreate2({
    walletClient: deployer,
    publicClient,
    initCode,
    salt,
  });
  
  logger.success(`DAOFactory deployed at: ${result.address}`);
  if (result.txHash) {
    logger.info(`Transaction hash: ${result.txHash}`);
  }

  // Get factory contract instance
  const factory = await viem.getContractAt("DAOFactory", result.address);

  // Verify implementation addresses match
  const storedTokenImpl = await factory.read.tokenImplementation();
  const storedGovernorImpl = await factory.read.governorImplementation();
  const storedTimelockImpl = await factory.read.timelockImplementation();
  
  if (storedTokenImpl.toLowerCase() !== tokenImplementation.toLowerCase() ||
      storedGovernorImpl.toLowerCase() !== governorImplementation.toLowerCase() ||
      storedTimelockImpl.toLowerCase() !== timelockImplementation.toLowerCase()) {
    logger.warn("Warning: Stored implementation addresses don't match deployed ones!");
  }

  // Display deployment info for verification
  logger.subHeader("Deployment Info (for verification)");
  logger.keyValue("CREATE2 Deployer", deploymentInfo.deployer);
  logger.keyValue("Salt", deploymentInfo.salt);
  logger.keyValue("Init Code Hash", deploymentInfo.initCodeHash);
  logger.keyValue("Predicted Address", deploymentInfo.predictedAddress);

  return {
    factory: result.address,
    tokenImplementation,
    governorImplementation,
    timelockImplementation,
    factoryContract: factory,
    networkName,
    viem,
    publicClient,
    alreadyDeployed: false,
    salt,
    txHash: result.txHash,
    deploymentInfo,
  };
};

/**
 * Predict the DAOFactory address without deploying
 * Useful for verifying addresses before deployment
 * @param {object} [options] - Options
 * @param {string} [options.salt] - Custom salt
 * @returns {Promise<object>} Prediction info
 */
export const predictFactoryAddress = async (options = {}) => {
  const salt = options.salt || DEFAULT_FACTORY_SALT;
  
  logger.header("DAOFactory Address Prediction");
  
  // Get DAOFactory bytecode
  const factoryArtifact = await artifacts.readArtifact("DAOFactory");
  const initCode = factoryArtifact.bytecode;
  
  const deploymentInfo = getDeploymentInfo(initCode, salt);
  
  logger.info(`CREATE2 Deployer: ${deploymentInfo.deployer}`);
  logger.info(`Salt: ${deploymentInfo.salt}`);
  logger.info(`Init Code Hash: ${deploymentInfo.initCodeHash}`);
  logger.success(`Predicted Address: ${deploymentInfo.predictedAddress}`);
  
  return deploymentInfo;
};

/**
 * Get an existing deterministic factory contract instance
 * @param {string} [factoryAddress] - Optional address override (uses predicted address if not provided)
 * @param {object} [options] - Options
 * @param {string} [options.salt] - Custom salt for address computation
 * @returns {Object} Factory contract instance and implementation addresses
 */
export const getDeterministicFactory = async (factoryAddress, options = {}) => {
  const { viem, networkName } = await network.connect();
  const salt = options.salt || DEFAULT_FACTORY_SALT;
  
  // If no address provided, compute the deterministic address
  if (!factoryAddress) {
    const factoryArtifact = await artifacts.readArtifact("DAOFactory");
    factoryAddress = computeFactoryAddress(factoryArtifact.bytecode, salt);
  }

  logger.info(`Connecting to factory at: ${factoryAddress}`);

  const factory = await viem.getContractAt("DAOFactory", factoryAddress);

  const tokenImplementation = await factory.read.tokenImplementation();
  const governorImplementation = await factory.read.governorImplementation();

  logger.success("Connected to deterministic factory");
  logger.address("DAOFactory", factoryAddress);
  logger.address("DAOToken Implementation", tokenImplementation);
  logger.address("DAOGovernor Implementation", governorImplementation);

  return {
    factory: factoryAddress,
    tokenImplementation,
    governorImplementation,
    factoryContract: factory,
    networkName,
    viem,
  };
};

// Main execution
const main = async () => {
  try {
    const result = await deployFactoryDeterministic();
    
    logger.summary({
      factory: result.factory,
      tokenImplementation: result.tokenImplementation,
      governorImplementation: result.governorImplementation,
      timelockImplementation: result.timelockImplementation,
    });
    
    return result;
  } catch (error) {
    logger.error(`Deployment failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
};

// Run if executed directly (avoid running on import)
const __filename = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  main();
}

export default { 
  deployFactoryDeterministic, 
  predictFactoryAddress, 
  getDeterministicFactory 
};
