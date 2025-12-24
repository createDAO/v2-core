/**
 * @title Deployment Record Utility
 * @notice Reads/writes deployment records to disk so deploy and verify flows are decoupled.
 * @dev Single Responsibility: persistence + basic validation of deployment metadata.
 *
 * Records are written to `createdao-contracts/deployments/`:
 * - deployments/<network>.latest.json (always overwritten)
 * - deployments/<network>-<chainId>-<timestamp>.json (immutable history)
 */

import fs from "fs";
import path from "path";

export const DEPLOYMENT_SCHEMA_VERSION = 1;

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

export const getDeploymentsDir = () => path.join(process.cwd(), "deployments");

export const getLatestDeploymentPath = (networkName) =>
  path.join(getDeploymentsDir(), `${networkName}.latest.json`);

export const getTimestampedDeploymentPath = (networkName, chainId, isoTimestamp) => {
  const safeTs = isoTimestamp.replaceAll(":", "-"); // windows-safe-ish
  return path.join(getDeploymentsDir(), `${networkName}-${chainId}-${safeTs}.json`);
};

/**
 * Resolve which deployment file to read.
 * @param {object} params
 * @param {string} params.networkName
 * @returns {string}
 */
export const resolveDeploymentFile = ({ networkName }) => {
  return process.env.DEPLOYMENT_FILE || getLatestDeploymentPath(networkName);
};

/**
 * Write a deployment record (latest + immutable timestamped).
 * @param {object} record - Full deployment record
 * @returns {{latestPath: string, timestampedPath: string}}
 */
const stringifyWithBigInt = (value) =>
  JSON.stringify(
    value,
    (_key, v) => (typeof v === "bigint" ? v.toString() : v),
    2
  );

export const writeDeploymentRecord = (record) => {
  if (!record?.network?.name) {
    throw new Error("Deployment record missing network.name");
  }
  if (!record?.network?.chainId) {
    throw new Error("Deployment record missing network.chainId");
  }

  const deploymentsDir = getDeploymentsDir();
  ensureDir(deploymentsDir);

  const json = stringifyWithBigInt(record);
  const latestPath = getLatestDeploymentPath(record.network.name);
  const timestampedPath = getTimestampedDeploymentPath(
    record.network.name,
    record.network.chainId,
    record.createdAt
  );

  fs.writeFileSync(latestPath, json);
  fs.writeFileSync(timestampedPath, json);

  return { latestPath, timestampedPath };
};

/**
 * Read and minimally validate a deployment record.
 * @param {string} filePath
 */
export const readDeploymentRecord = (filePath) => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Deployment record not found: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, "utf8");
  const record = JSON.parse(raw);

  if (record.schemaVersion !== DEPLOYMENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported deployment record schemaVersion=${record.schemaVersion}. Expected ${DEPLOYMENT_SCHEMA_VERSION}.`
    );
  }

  if (!record?.factory?.address) {
    throw new Error("Deployment record missing factory.address");
  }

  return record;
};

export default {
  DEPLOYMENT_SCHEMA_VERSION,
  resolveDeploymentFile,
  writeDeploymentRecord,
  readDeploymentRecord,
  getDeploymentsDir,
  getLatestDeploymentPath,
  getTimestampedDeploymentPath,
};
