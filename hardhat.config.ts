import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
            details: {
              yulDetails: {
                optimizerSteps: "u",
              },
            },
          },
          viaIR: true,
          evmVersion: "cancun",
        },
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
          evmVersion: "cancun",
        },
      },
    },
  },

  networks: {
    // Local simulation networks
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },

    ethereum: {
      type: "http",
      chainType: "l1",
      chainId: 1,
      url: configVariable("ETHEREUM_RPC_URL"),
      accounts: [configVariable("CreateDAO_Deployer")],
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("CreateDAO_Deployer")],
    },
  },

  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
    sourcify: {
      enabled: true,
    },
    customChains: [
      {
        network: "ethereum",
        chainId: 1,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://etherscan.io",
        },
      },
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://sepolia.etherscan.io",
        },
      },
    ],
  },
});
