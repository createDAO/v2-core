/**
 * @title Deploy + Create DAO (No Verification)
 * @notice Deploys factory deterministically and creates a DAO, then writes a deployment record.
 * @dev Run with:
 *   npx hardhat run scripts/flow/deploy-and-create.js --network <network>
 *
 * Optional env vars:
 *   - FACTORY_SALT: human-readable salt; will be keccak256()'d to bytes32
 *   - DEPLOYMENT_TAG: arbitrary string tag stored in the record (e.g., "sepolia-smoke")
 */

import { keccak256, toBytes } from "viem";
import * as logger from "../utils/logger.js";
import { deployFactoryDeterministic } from "../deploy/factoryDeterministic.js";
import { createDAO } from "../deploy/dao.js";
import {
  DEPLOYMENT_SCHEMA_VERSION,
  writeDeploymentRecord,
} from "../utils/deployment-record.js";

/**
 * Get deployment salt from environment or use default
 * @returns {string|undefined}
 */
const getCustomSalt = () => {
  const envSalt = process.env.FACTORY_SALT;
  if (envSalt) return keccak256(toBytes(envSalt));
  return undefined; // allow deploy script to apply default
};

const main = async () => {
  logger.header("DEPLOY + CREATE DAO (NO VERIFICATION)");
  const createdAt = new Date().toISOString();
  logger.info(`Timestamp: ${createdAt}`);

  const customSalt = getCustomSalt();
  if (process.env.FACTORY_SALT) {
    logger.info(`Using custom salt from FACTORY_SALT: \"${process.env.FACTORY_SALT}\"`);
  } else {
    logger.info("Using default salt (set FACTORY_SALT env var to customize)");
  }

  const addresses = {};

  try {
    // STEP 1: Deploy factory deterministically
    logger.step(1, "Deploying DAOFactory (CREATE2 deterministic)");

    const factoryResult = await deployFactoryDeterministic({ salt: customSalt });

    addresses.factory = factoryResult.factory;
    addresses.tokenImplementation = factoryResult.tokenImplementation;
    addresses.governorImplementation = factoryResult.governorImplementation;

    // STEP 2: Create DAO
    logger.step(2, "Creating DAO from Factory");

    const daoResult = await createDAO(
      factoryResult.factoryContract,
      factoryResult.viem,
      factoryResult.publicClient,
      factoryResult.networkName
    );

    addresses.token = daoResult.token;
    addresses.timelock = daoResult.timelock;
    addresses.governor = daoResult.governor;

    // STEP 3: Write deployment record
    logger.step(3, "Writing deployment record");

    const record = {
      schemaVersion: DEPLOYMENT_SCHEMA_VERSION,
      createdAt,
      tag: process.env.DEPLOYMENT_TAG || null,
      network: {
        name: factoryResult.networkName,
        chainId: await factoryResult.publicClient.getChainId(),
      },
      create2: {
        deployer: factoryResult.deploymentInfo?.deployer || null,
        salt: factoryResult.deploymentInfo?.salt || factoryResult.salt || null,
        initCodeHash: factoryResult.deploymentInfo?.initCodeHash || null,
        predictedAddress: factoryResult.deploymentInfo?.predictedAddress || null,
      },
      factory: {
        address: addresses.factory,
        alreadyDeployed: !!factoryResult.alreadyDeployed,
        txHash: factoryResult.txHash || null,
      },
      implementations: {
        token: addresses.tokenImplementation,
        governor: addresses.governorImplementation,
      },
      dao: {
        tokenProxy: addresses.token,
        governorProxy: addresses.governor,
        timelock: addresses.timelock,
        creator: daoResult.creator,
        config: daoResult.config,
      },
    };

    const { latestPath, timestampedPath } = writeDeploymentRecord(record);
    logger.success(`Wrote latest: ${latestPath}`);
    logger.success(`Wrote history: ${timestampedPath}`);

    // STEP 4: Summary
    logger.step(4, "Deployment Summary");
    logger.summary(addresses);

    logger.info("Next: run verification separately:");
    logger.info(`  npx hardhat run scripts/flow/verify-all.js --network ${factoryResult.networkName}`);
    logger.info("Or specify a file:");
    logger.info(`  DEPLOYMENT_FILE=${timestampedPath} npx hardhat run scripts/flow/verify-all.js --network ${factoryResult.networkName}`);
  } catch (error) {
    logger.error(`Flow failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
