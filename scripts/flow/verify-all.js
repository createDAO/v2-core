/**
 * @title Verify All (From Deployment Record)
 * @notice Thin orchestrator that reads a deployment record and runs the verification modules.
 * @dev Run with:
 *   npx hardhat run scripts/flow/verify-all.js --network <network>
 *
 * Optional env vars:
 *   - DEPLOYMENT_FILE: path to a specific deployment record json.
 *     If omitted, uses deployments/<network>.latest.json
 */

import { network } from "hardhat";
import * as logger from "../utils/logger.js";
import {
  readDeploymentRecord,
  resolveDeploymentFile,
} from "../utils/deployment-record.js";
import { verifyFactoryContracts } from "../verify/factory.js";
import { verifyDAOContracts } from "../verify/dao.js";

const main = async () => {
  logger.header("VERIFY ALL CONTRACTS");

  const { networkName } = await network.connect();
  logger.info(`Network: ${networkName}`);

  const deploymentFile = resolveDeploymentFile({ networkName });
  logger.info(`Deployment file: ${deploymentFile}`);

  const record = readDeploymentRecord(deploymentFile);

  // Quick sanity: ensure the file corresponds to the same network
  if (record.network?.name && record.network.name !== networkName) {
    logger.warn(
      `Deployment record network mismatch: file=${record.network.name}, current=${networkName}`
    );
  }

  logger.subHeader("Factory Verification");
  await verifyFactoryContracts(
    {
      factory: record.factory.address,
      tokenImplementation: record.implementations.token,
      governorImplementation: record.implementations.governor,
      timelockImplementation: record.implementations.timelock,
    },
    networkName
  );

  logger.subHeader("DAO Verification");
  await verifyDAOContracts(
    {
      token: record.dao.tokenProxy,
      timelock: record.dao.timelock,
      governor: record.dao.governorProxy,
      factory: record.factory.address,
      tokenImplementation: record.implementations.token,
      governorImplementation: record.implementations.governor,
    },
    networkName,
    record.dao.config
  );

  logger.success("Verification flow completed (check logs for per-contract status)");
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(error.message);
    console.error(error);
    process.exit(1);
  });
