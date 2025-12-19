/**
 * @title Verification Utility
 * @notice Handles contract verification on Etherscan and Sourcify
 * @dev Uses exponential backoff retry logic for reliability
 *      Updated for Hardhat v3 using verifyContract from @nomicfoundation/hardhat-verify
 */

import hre from "hardhat";
import { verifyContract } from "@nomicfoundation/hardhat-verify/verify";

// Helper function to wait for a specified time
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Verify a contract on Etherscan and Sourcify
 * @param {string} contractAddress - The deployed contract address
 * @param {Array} args - Constructor arguments
 * @param {string} contract - Full contract path (e.g., "contracts/DAOFactory.sol:DAOFactory")
 * @param {string} networkName - The network name to check for local networks
 */
export const verify = async (contractAddress, args, contract, networkName = null) => {
  // Skip verification on local networks
  const localNetworks = ["hardhat", "localhost", "hardhatMainnet", "hardhatOp"];
  if (networkName && localNetworks.includes(networkName)) {
    console.log(`\nSkipping verification on local network: ${networkName}`);
    return;
  }

  console.log("\nStarting verification process...");

  await verifyWithEtherscan(contractAddress, args, contract);

  // Check if sourcify is enabled in config (Hardhat v3: verify.sourcify.enabled)
  const sourcifyEnabled = hre.config?.verify?.sourcify?.enabled ?? false;

  if (sourcifyEnabled) {
    await verifyWithSourcify(contractAddress, args, contract);
  }
};

/**
 * Verify contract on Etherscan with retry logic
 */
const verifyWithEtherscan = async (contractAddress, args, contract) => {
  const maxRetries = 5;
  const initialDelay = 10000;

  console.log("\nStarting Etherscan verification...");

  for (let i = 0; i < maxRetries; i++) {
    const waitTime = initialDelay * Math.pow(2, i);
    console.log(
      `\nEtherscan attempt ${i + 1}/${maxRetries}: Waiting ${
        waitTime / 1000
      } seconds before verification...`
    );
    await delay(waitTime);

    console.log("Attempting Etherscan verification...");
    try {
      // Use verifyContract from @nomicfoundation/hardhat-verify for Hardhat v3
      await verifyContract(
        {
          address: contractAddress,
          constructorArgs: args,
          contract: contract,
          provider: "etherscan",
        },
        hre
      );
      console.log("Etherscan verification successful!");
      return;
    } catch (e) {
      if (e.message.toLowerCase().includes("already been verified") || 
          e.message.toLowerCase().includes("already verified")) {
        console.log("Contract already verified on Etherscan!");
        return;
      }

      console.log("\nEtherscan verification attempt failed with error:");
      console.log(e);

      if (i === maxRetries - 1) {
        console.log("\nMax retries reached. Etherscan verification failed.");
      } else {
        console.log(
          "\nEtherscan verification failed, will retry after delay..."
        );
      }
    }
  }
};

/**
 * Verify contract on Sourcify with retry logic
 */
const verifyWithSourcify = async (contractAddress, args, contract) => {
  const maxRetries = 3;
  const initialDelay = 5000;

  console.log("\nStarting Sourcify verification...");

  for (let i = 0; i < maxRetries; i++) {
    const waitTime = initialDelay * Math.pow(2, i);
    console.log(
      `\nSourcify attempt ${i + 1}/${maxRetries}: Waiting ${
        waitTime / 1000
      } seconds before verification...`
    );
    await delay(waitTime);

    console.log("Attempting Sourcify verification...");
    try {
      // Use verifyContract from @nomicfoundation/hardhat-verify for Hardhat v3
      await verifyContract(
        {
          address: contractAddress,
          constructorArgs: args,
          contract: contract,
          provider: "sourcify",
        },
        hre
      );
      console.log("Sourcify verification successful!");
      return;
    } catch (e) {
      if (e.message.toLowerCase().includes("already verified")) {
        console.log("Contract already verified on Sourcify!");
        return;
      }

      console.log("\nSourcify verification attempt failed with error:");
      console.log(e);

      if (i === maxRetries - 1) {
        console.log("\nMax retries reached. Sourcify verification failed.");
      } else {
        console.log(
          "\nSourcify verification failed, will retry after delay..."
        );
      }
    }
  }
};

export default { verify };
