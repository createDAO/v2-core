/**
 * @title Address Prediction Script
 * @notice Predicts the DAOFactory address for deterministic deployment
 * @dev Run this script to verify the expected address before deploying to any chain
 * 
 * Usage:
 *   npx hardhat run scripts/deploy/predictAddress.js
 * 
 * This will output the address where DAOFactory will be deployed using CREATE2
 * on ANY EVM chain (assuming same compiler settings and salt).
 */

import { artifacts } from "hardhat";
import { keccak256, toBytes } from "viem";
import * as logger from "../utils/logger.js";
import {
  DETERMINISTIC_DEPLOYER,
  DEFAULT_FACTORY_SALT,
  computeCreate2Address,
  getDeploymentInfo,
} from "../utils/create2.js";

/**
 * Main execution
 */
const main = async () => {
  logger.header("DAOFactory Address Prediction (CREATE2)");
  
  // Get DAOFactory bytecode
  logger.info("Compiling contracts to get bytecode...");
  const factoryArtifact = await artifacts.readArtifact("DAOFactory");
  const initCode = factoryArtifact.bytecode;
  
  // Get deployment info
  const deploymentInfo = getDeploymentInfo(initCode, DEFAULT_FACTORY_SALT);
  
  logger.subHeader("Deployment Parameters");
  logger.keyValue("CREATE2 Deployer", DETERMINISTIC_DEPLOYER);
  logger.keyValue("Salt", DEFAULT_FACTORY_SALT);
  logger.keyValue("Salt (human readable)", "createDAO_DAOFactory_v1_dev");
  logger.keyValue("Init Code Length", `${initCode.length / 2 - 1} bytes`);
  logger.keyValue("Init Code Hash", deploymentInfo.initCodeHash);
  
  logger.subHeader("Predicted Addresses");
  logger.success(`DAOFactory: ${deploymentInfo.predictedAddress}`);
  
  // Show how address changes with different salts
  logger.subHeader("Address with Different Salts (examples)");
  
  const exampleSalts = [
    { name: "v1", salt: keccak256(toBytes("createDAO_DAOFactory_v1")) },
    { name: "v2", salt: keccak256(toBytes("createDAO_DAOFactory_v2")) },
    { name: "production", salt: keccak256(toBytes("createDAO_DAOFactory_production")) },
    { name: "testnet", salt: keccak256(toBytes("createDAO_DAOFactory_testnet")) },
  ];
  
  for (const { name, salt } of exampleSalts) {
    const address = computeCreate2Address(DETERMINISTIC_DEPLOYER, salt, initCode);
    logger.keyValue(`Salt "${name}"`, address);
  }
  
  logger.subHeader("Important Notes");
  logger.info("• The predicted address will be IDENTICAL on ALL EVM chains");
  logger.info("• Ensure compiler settings (optimizer, viaIR) are consistent");
  logger.info("• To change the address, use a different salt value");
  logger.info("• The same bytecode MUST be used on all chains");
  
  console.log("\n");
  
  return deploymentInfo;
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    logger.error(`Prediction failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
