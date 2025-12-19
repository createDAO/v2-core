/**
 * @title Full Deployment Flow
 * @notice Orchestrates complete DAO deployment: Factory → Verify → Create DAO
 * @dev Run with: npx hardhat run scripts/flow/full.js --network <network>
 * 
 * This script performs:
 * 1. Deploy DAOFactory (automatically deploys DAOToken & DAOGovernor implementations)
 * 2. Verify Factory and implementation contracts on Etherscan/Sourcify
 * 3. Create a new DAO from the factory
 * 4. Verify token distribution and quorum settings
 */

import * as logger from "../utils/logger.js";
import { deployFactory } from "../deploy/factory.js";
import { createDAO } from "../deploy/dao.js";
import { verifyFactoryContracts } from "../verify/factory.js";

/**
 * Main deployment flow
 */
const main = async () => {
  logger.header("FULL DAO DEPLOYMENT FLOW");
  logger.info(`Timestamp: ${new Date().toISOString()}`);

  // Track all deployed addresses
  const addresses = {};

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Deploy DAOFactory
    // ═══════════════════════════════════════════════════════════════════════════
    logger.step(1, "Deploying DAOFactory and Implementations");

    const factoryResult = await deployFactory();
    addresses.factory = factoryResult.factory;
    addresses.tokenImplementation = factoryResult.tokenImplementation;
    addresses.governorImplementation = factoryResult.governorImplementation;
    const networkName = factoryResult.networkName;

    logger.info(`Network: ${networkName}`);

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 2: Verify Factory Contracts
    // ═══════════════════════════════════════════════════════════════════════════
    logger.step(2, "Verifying Factory Contracts");

    await verifyFactoryContracts(
      {
        factory: addresses.factory,
        tokenImplementation: addresses.tokenImplementation,
        governorImplementation: addresses.governorImplementation,
      },
      networkName
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 3: Create DAO
    // ═══════════════════════════════════════════════════════════════════════════
    logger.step(3, "Creating DAO from Factory");

    // Pass shared viem context to ensure same network connection
    const daoResult = await createDAO(
      factoryResult.factoryContract,
      factoryResult.viem,
      factoryResult.publicClient,
      factoryResult.networkName
    );
    addresses.token = daoResult.token;
    addresses.timelock = daoResult.timelock;
    addresses.governor = daoResult.governor;

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 4: Print Summary
    // ═══════════════════════════════════════════════════════════════════════════
    logger.step(4, "Deployment Summary");
    logger.summary(addresses);

  } catch (error) {
    logger.error(`Deployment failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
};

// Execute main function
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
