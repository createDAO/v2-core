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

    // Ethereum Mainnet
    ethereum: {
      type: "http",
      chainType: "l1",
      chainId: 1,
      url: configVariable("ETHEREUM_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // BNB Chain
    bnbchain: {
      type: "http",
      chainType: "l1",
      chainId: 56,
      url: configVariable("BNB_CHAIN_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Polygon
    polygon: {
      type: "http",
      chainType: "l1",
      chainId: 137,
      url: configVariable("POLYGON_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Arbitrum
    arbitrum: {
      type: "http",
      chainType: "l1",
      chainId: 42161,
      url: configVariable("ARBITRUM_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Optimism
    optimism: {
      type: "http",
      chainType: "op",
      chainId: 10,
      url: configVariable("OPTIMISM_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Base
    base: {
      type: "http",
      chainType: "op",
      chainId: 8453,
      url: configVariable("BASE_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Avalanche
    avalanche: {
      type: "http",
      chainType: "l1",
      chainId: 43114,
      url: configVariable("AVALANCHE_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Gnosis
    gnosis: {
      type: "http",
      chainType: "l1",
      chainId: 100,
      url: configVariable("GNOSIS_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Mantle
    mantle: {
      type: "http",
      chainType: "l1",
      chainId: 5000,
      url: configVariable("MANTLE_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Celo
    celo: {
      type: "http",
      chainType: "l1",
      chainId: 42220,
      url: configVariable("CELO_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Blast
    blast: {
      type: "http",
      chainType: "op",
      chainId: 81457,
      url: configVariable("BLAST_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Scroll
    scroll: {
      type: "http",
      chainType: "l1",
      chainId: 534352,
      url: configVariable("SCROLL_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Unichain
    unichain: {
      type: "http",
      chainType: "op",
      chainId: 130,
      url: configVariable("UNICHAIN_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // World Chain
    worldchain: {
      type: "http",
      chainType: "op",
      chainId: 480,
      url: configVariable("WORLDCHAIN_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Sepolia Testnet
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: 11155111,
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
    },

    // Base Sepolia Testnet
    basesepolia: {
      type: "http",
      chainType: "op",
      chainId: 84532,
      url: configVariable("BASE_SEPOLIA_RPC_URL"),
      accounts: [configVariable("PRIVATE_KEY")],
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
      {
        network: "bnbchain",
        chainId: 56,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://bscscan.com",
        },
      },
      {
        network: "polygon",
        chainId: 137,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://polygonscan.com",
        },
      },
      {
        network: "arbitrum",
        chainId: 42161,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://arbiscan.io",
        },
      },
      {
        network: "optimism",
        chainId: 10,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://optimistic.etherscan.io",
        },
      },
      {
        network: "base",
        chainId: 8453,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://basescan.org",
        },
      },
      {
        network: "basesepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "avalanche",
        chainId: 43114,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://snowtrace.io",
        },
      },
      {
        network: "gnosis",
        chainId: 100,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://gnosisscan.io",
        },
      },
      {
        network: "mantle",
        chainId: 5000,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://mantlescan.xyz",
        },
      },
      {
        network: "celo",
        chainId: 42220,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://celoscan.io",
        },
      },
      {
        network: "blast",
        chainId: 81457,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://blastscan.io",
        },
      },
      {
        network: "scroll",
        chainId: 534352,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api",
          browserURL: "https://scrollscan.com",
        },
      },
      {
        network: "unichain",
        chainId: 130,
        urls: {
          apiURL: "https://api.uniscan.xyz/api",
          browserURL: "https://uniscan.xyz",
        },
      },
      {
        network: "worldchain",
        chainId: 480,
        urls: {
          apiURL: "https://api.worldscan.org/api",
          browserURL: "https://worldscan.org",
        },
      },
    ],
  },
});
