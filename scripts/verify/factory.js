/**
 * @title Factory Verification
 * @notice Verifies the DAOFactory and its implementation contracts
 * @dev Uses the existing verification utility with retry logic
 */

import * as logger from "../utils/logger.js";
import { verify } from "../utils/verification.js";

/**
 * Verify all factory-related contracts
 * @param {Object} addresses - Object containing factory and implementation addresses
 * @param {string} addresses.factory - The DAOFactory contract address
 * @param {string} addresses.tokenImplementation - The DAOToken implementation address
 * @param {string} addresses.governorImplementation - The DAOGovernor implementation address
 * @param {string} addresses.timelockImplementation - The DAOTimelock implementation address
 * @param {string} networkName - The network name (for skipping local networks)
 */
export const verifyFactoryContracts = async (addresses, networkName) => {
  logger.subHeader("Verifying Factory Contracts");

  const { factory, tokenImplementation, governorImplementation, timelockImplementation } = addresses;

  // Verify DAOToken implementation (no constructor arguments - uses _disableInitializers)
  logger.info("Verifying DAOToken implementation...");
  await verify(
    tokenImplementation,
    [], // No constructor args
    "contracts/DAOToken.sol:DAOToken",
    networkName
  );
  logger.success("DAOToken implementation verification initiated");

  // Verify DAOGovernor implementation (no constructor arguments - uses _disableInitializers)
  logger.info("Verifying DAOGovernor implementation...");
  await verify(
    governorImplementation,
    [], // No constructor args
    "contracts/DAOGovernor.sol:DAOGovernor",
    networkName
  );
  logger.success("DAOGovernor implementation verification initiated");

  // Verify DAOTimelock implementation (no constructor arguments - uses _disableInitializers)
  logger.info("Verifying DAOTimelock implementation...");
  await verify(
    timelockImplementation,
    [], // No constructor args
    "contracts/DAOTimelock.sol:DAOTimelock",
    networkName
  );
  logger.success("DAOTimelock implementation verification initiated");

  // Verify DAOFactory (constructor takes 3 implementation addresses)
  logger.info("Verifying DAOFactory...");
  await verify(
    factory,
    [tokenImplementation, governorImplementation, timelockImplementation], // Constructor args
    "contracts/DAOFactory.sol:DAOFactory",
    networkName
  );
  logger.success("DAOFactory verification initiated");
};

/**
 * Verify a single contract
 * @param {string} address - Contract address to verify
 * @param {Array} constructorArgs - Constructor arguments
 * @param {string} contractPath - Full contract path (e.g., "contracts/DAOFactory.sol:DAOFactory")
 * @param {string} networkName - The network name (for skipping local networks)
 */
export const verifyContract = async (address, constructorArgs, contractPath, networkName) => {
  logger.info(`Verifying ${contractPath} at ${address}...`);
  await verify(address, constructorArgs, contractPath, networkName);
  logger.success(`${contractPath} verification initiated`);
};

export default { verifyFactoryContracts, verifyContract };
