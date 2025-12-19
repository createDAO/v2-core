/**
 * @title Factory Deployment
 * @notice Deploys the DAOFactory contract
 * @dev The DAOFactory constructor automatically deploys DAOToken and DAOGovernor implementations
 */

import { network } from "hardhat";
import * as logger from "../utils/logger.js";

/**
 * Deploy the DAOFactory contract
 * @returns {Object} Deployment result with factory and implementation addresses
 */
export const deployFactory = async () => {
  // Connect to the network and get viem instance (Hardhat v3 pattern)
  const { viem, networkName } = await network.connect();

  logger.subHeader("Deploying DAOFactory");
  logger.info(`Network: ${networkName}`);

  // Get the deployer wallet
  const [deployer] = await viem.getWalletClients();
  const deployerAddress = deployer.account.address;
  logger.info(`Deployer: ${deployerAddress}`);

  // Get public client for reading contract data
  const publicClient = await viem.getPublicClient();

  // Check deployer balance
  const balance = await publicClient.getBalance({ address: deployerAddress });
  logger.info(`Balance: ${(Number(balance) / 1e18).toFixed(4)} ETH`);

  // Deploy DAOFactory
  logger.info("Deploying DAOFactory contract...");
  const factory = await viem.deployContract("DAOFactory");
  logger.success(`DAOFactory deployed at: ${factory.address}`);

  // Get implementation addresses from the factory
  const tokenImplementation = await factory.read.tokenImplementation();
  const governorImplementation = await factory.read.governorImplementation();

  logger.success(`DAOToken implementation: ${tokenImplementation}`);
  logger.success(`DAOGovernor implementation: ${governorImplementation}`);

  return {
    factory: factory.address,
    tokenImplementation,
    governorImplementation,
    factoryContract: factory,
    networkName,
    viem,           // Share viem instance for downstream scripts
    publicClient,   // Share publicClient for transaction receipt waiting
  };
};

/**
 * Get an existing factory contract instance
 * @param {string} factoryAddress - The factory contract address
 * @returns {Object} Factory contract instance and implementation addresses
 */
export const getFactory = async (factoryAddress) => {
  const { viem, networkName } = await network.connect();

  logger.info(`Connecting to existing factory at: ${factoryAddress}`);

  const factory = await viem.getContractAt("DAOFactory", factoryAddress);

  const tokenImplementation = await factory.read.tokenImplementation();
  const governorImplementation = await factory.read.governorImplementation();

  logger.success("Connected to factory");
  logger.address("DAOToken implementation", tokenImplementation);
  logger.address("DAOGovernor implementation", governorImplementation);

  return {
    factory: factoryAddress,
    tokenImplementation,
    governorImplementation,
    factoryContract: factory,
    networkName,
  };
};

export default { deployFactory, getFactory };
