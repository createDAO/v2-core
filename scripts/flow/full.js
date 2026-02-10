/**
 * @title Full Deployment Flow
 * @notice Orchestrates complete DAO deployment: Factory → Verify → Create DAO → Verify DAO
 * @dev Run with: npx hardhat run scripts/flow/full.js --network <network>
 * 
 * This script performs:
 * 1. Deploy DAOFactory via CREATE2 (deterministic address across all chains)
 *    - If already deployed (same salt + bytecode), reuses existing deployment
 *    - Automatically deploys DAOToken & DAOGovernor implementations
 * 2. Verify Factory and implementation contracts on Etherscan/Sourcify
 * 3. Create a new DAO from the factory
 *    - Verifies token distribution and quorum settings
 * 4. Verify DAO contracts (TimelockController)
 *    - DAOToken & DAOGovernor proxies auto-detected by Etherscan (EIP-1167)
 * 5. Print deployment summary
 * 
 * Deterministic Deployment:
 * - Uses Arachnid's CREATE2 deployer (0x4e59b44847b379578588920cA78FbF26c0B4956C)
 * - Same salt + same bytecode = same address on ALL EVM chains
 * - Running twice with same salt is SAFE - just returns existing address
 * 
 * To use a custom salt (e.g., for production):
 *   Set environment variable: FACTORY_SALT="your_custom_salt_here"
 *   Or modify DEFAULT_FACTORY_SALT in scripts/utils/create2.js
 */

import { keccak256, toBytes } from "viem";
import * as logger from "../utils/logger.js";
import { deployFactoryDeterministic } from "../deploy/factoryDeterministic.js";
import { createDAO } from "../deploy/dao.js";
import { verifyFactoryContracts } from "../verify/factory.js";
import { verifyDAOContracts } from "../verify/dao.js";

/**
 * Get deployment salt from environment or use default
 * @returns {string|undefined} Custom salt or undefined for default
 */
const getCustomSalt = () => {
  const envSalt = process.env.FACTORY_SALT;
  if (envSalt) {
    // Convert human-readable string to bytes32 hash
    return keccak256(toBytes(envSalt));
  }
  return undefined; // Use default salt from create2.js
};

/**
 * Main deployment flow
 */
const main = async () => {
  logger.header("FULL DAO DEPLOYMENT FLOW (Deterministic CREATE2)");
  logger.info(`Timestamp: ${new Date().toISOString()}`);

  // Check for custom salt
  const customSalt = getCustomSalt();
  if (process.env.FACTORY_SALT) {
    logger.info(`Using custom salt from FACTORY_SALT env var: "${process.env.FACTORY_SALT}"`);
  } else {
    logger.info("Using default salt (set FACTORY_SALT env var to customize)");
  }

  // Track all deployed addresses
  const addresses = {};

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 1: Deploy DAOFactory via CREATE2
    // ═══════════════════════════════════════════════════════════════════════════
    logger.step(1, "Deploying DAOFactory via CREATE2");

    const factoryResult = await deployFactoryDeterministic({ salt: customSalt });
    addresses.factory = factoryResult.factory;
    addresses.tokenImplementation = factoryResult.tokenImplementation;
    addresses.governorImplementation = factoryResult.governorImplementation;
    addresses.timelockImplementation = factoryResult.timelockImplementation;
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
        timelockImplementation: addresses.timelockImplementation,
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
    // STEP 4: Verify DAO Contracts
    // ═══════════════════════════════════════════════════════════════════════════
    logger.step(4, "Verifying DAO Contracts");

    await verifyDAOContracts(
      {
        token: addresses.token,
        timelock: addresses.timelock,
        governor: addresses.governor,
        factory: addresses.factory,
        tokenImplementation: addresses.tokenImplementation,
        governorImplementation: addresses.governorImplementation,
      },
      networkName,
      daoResult.config // Pass DAO config for logging
    );

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: Print Summary
    // ═══════════════════════════════════════════════════════════════════════════
    logger.step(5, "Deployment Summary");
    
    if (factoryResult.alreadyDeployed) {
      logger.info("📦 Factory was REUSED (already deployed with same salt + bytecode)");
    } else {
      logger.info("🆕 Factory was freshly deployed via CREATE2");
    }
    
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
