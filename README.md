# createDAO v2

A comprehensive DAO creation and management platform built on EVM-compatible blockchains using [OpenZeppelin Governance](https://docs.openzeppelin.com/contracts/5.x/governance).

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-blue.svg)](https://docs.soliditylang.org/)
[![OpenZeppelin](https://img.shields.io/badge/OpenZeppelin-5.4.0-purple.svg)](https://www.openzeppelin.com/contracts)
[![Hardhat](https://img.shields.io/badge/Hardhat-3.1.0-yellow.svg)](https://hardhat.org/)

> **⚠️ Important**
> - The contracts are **NOT audited** yet

## About v2

This is a **complete rewrite** of createDAO, rebuilt from the ground up using OpenZeppelin's battle-tested governance contracts. Version 2 prioritizes security and simplicity by leveraging the industry-standard OZ Governor pattern rather than custom governance implementations.

## Features

- **OpenZeppelin Governance**: Built on proven, audited governance contracts
- **EIP-1167 Minimal Proxies**: Gas-efficient DAO deployment using clone pattern
- **Deterministic Deployment**: CREATE2 for predictable contract addresses across chains
- **Auto-Delegation**: Voting power automatically activated on token receipt
- **Manager Role**: On-chain authorization for off-chain DAO operations
- **TimelockController Treasury**: Secure fund management with execution delay

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DAOFactory                                     │
│  - Deploys implementations in constructor (tokenImpl, governorImpl)         │
│  - Creates complete DAO systems via Clones                                  │
│  - Tracks all deployed DAOs                                                 │
└─────────────────────────────────┬───────────────────────────────────────────┘
                                  │ createDAO()
                                  ▼
              ┌───────────────────┼───────────────────┐
              │                   │                   │
              ▼                   ▼                   ▼
    ┌─────────────────┐  ┌──────────────────┐  ┌──────────────────┐
    │ DAOToken (Proxy)│  │TimelockController│  │DAOGovernor(Proxy)│
    │   EIP-1167      │  │   (Treasury)     │  │   EIP-1167       │
    │                 │  │                  │  │                  │
    │ ERC20Votes      │  │ Holds 99% tokens │  │ Governor         │
    │ ERC20Permit     │  │ 1-day delay      │  │ Settings         │
    │ Auto-delegate   │  │                  │  │ Counting         │
    │                 │  │                  │  │ Votes/Quorum     │
    │ 1% → Creator    │  │                  │  │ Timelock         │
    │ 99% → Treasury  │  │                  │  │                  │
    └─────────────────┘  └──────────────────┘  └──────────────────┘
```

### Core Contracts

| Contract | Description |
|----------|-------------|
| **DAOFactory** | Factory for deploying complete DAO systems via minimal proxies |
| **DAOToken** | ERC20 governance token with voting power and auto-delegation |
| **DAOGovernor** | Governor contract with timelock integration and manager role |
| **TimelockController** | Treasury holding 99% of tokens with execution delay |

## Governance Settings

| Setting | Value | Description |
|---------|-------|-------------|
| Creator Allocation | 1% | Tokens sent to DAO creator (auto-delegated) |
| Treasury Allocation | 99% | Tokens held in TimelockController |
| Quorum | 1% | Minimum participation for valid proposals |
| Proposal Threshold | 1% | Tokens required to create proposals |
| Timelock Delay | 1 day | Execution delay after proposal passes |
| Token Decimals | 18 | Standard ERC20 decimals |

## Deployments

Deployed using Arachnid’s deterministic CREATE2 deployer, so the **DAOFactory address is identical across networks** when deployed with the same salt.

### DAOFactory (Same Address on Ethereum + Sepolia)

| Contract | Address | Explorer |
|----------|---------|----------|
| **DAOFactory** | `0xc852E5Cb44C50614a82050163aB7170cB88EB5F9` | [Ethereum](https://etherscan.io/address/0xc852E5Cb44C50614a82050163aB7170cB88EB5F9) · [Sepolia](https://sepolia.etherscan.io/address/0xc852E5Cb44C50614a82050163aB7170cB88EB5F9) |
| DAOToken Implementation | `0x4516F43c475A4c469367A1AfD2998FC30CF8C3B6` | [Ethereum](https://etherscan.io/address/0x4516F43c475A4c469367A1AfD2998FC30CF8C3B6) · [Sepolia](https://sepolia.etherscan.io/address/0x4516F43c475A4c469367A1AfD2998FC30CF8C3B6) |
| DAOGovernor Implementation | `0xC6Ee7F3D2D3BbA67d0a2a6562d5b6A416e390141` | [Ethereum](https://etherscan.io/address/0xC6Ee7F3D2D3BbA67d0a2a6562d5b6A416e390141) · [Sepolia](https://sepolia.etherscan.io/address/0xC6Ee7F3D2D3BbA67d0a2a6562d5b6A416e390141) |
| DAOTimelock Implementation | `0xf8354d8F218cE905ddf3a24c88F3358ece319373` | [Ethereum](https://etherscan.io/address/0xf8354d8F218cE905ddf3a24c88F3358ece319373) · [Sepolia](https://sepolia.etherscan.io/address/0xf8354d8F218cE905ddf3a24c88F3358ece319373) |

**Example DAO deployed on Ethereum (from deployment record `deployments/ethereum.latest.json`)**

| Contract | Address | Explorer |
|----------|---------|----------|
| DAOToken (Proxy / Clone) | `0x819b17cd5df5F9F9d99a28e800FFB32699c66C62` | [View on Etherscan](https://etherscan.io/address/0x819b17cd5df5F9F9d99a28e800FFB32699c66C62) |
| DAOGovernor (Proxy / Clone) | `0x39Ff10A0eb805695fdA6f3BacD17eF6B01C17294` | [View on Etherscan](https://etherscan.io/address/0x39Ff10A0eb805695fdA6f3BacD17eF6B01C17294) |
| TimelockController (Treasury) | `0x1dD03B88D166694073308685F8a2c57b46987300` | [View on Etherscan](https://etherscan.io/address/0x1dD03B88D166694073308685F8a2c57b46987300) |

### Sepolia (Ethereum Testnet)

**Example DAO deployed on Sepolia (from deployment record `deployments/sepolia.latest.json`)**

| Contract | Address | Explorer |
|----------|---------|----------|
| DAOToken (Proxy / Clone) | `0xe7B56A39C430B9F993cf7954e1EeFA83a9d154dF` | [View on Etherscan](https://sepolia.etherscan.io/address/0xe7B56A39C430B9F993cf7954e1EeFA83a9d154dF) |
| DAOGovernor (Proxy / Clone) | `0x944B6217582B731c27890Df7Af52Ad8eA8a934e2` | [View on Etherscan](https://sepolia.etherscan.io/address/0x944B6217582B731c27890Df7Af52Ad8eA8a934e2) |
| TimelockController (Treasury) | `0xA11828FD53c4ca7Fa54a1ECbfef88EAFAe3906C1` | [View on Etherscan](https://sepolia.etherscan.io/address/0xA11828FD53c4ca7Fa54a1ECbfef88EAFAe3906C1) |

#### Deployment Details (CREATE2)

```
Ethereum:
CREATE2 Deployer: 0x4e59b44847b379578588920cA78FbF26c0B4956C
Salt Label: production_2_0_0
DAOFactory Address: 0xc852E5Cb44C50614a82050163aB7170cB88EB5F9

Sepolia:
CREATE2 Deployer: 0x4e59b44847b379578588920cA78FbF26c0B4956C
Salt Label: production_2_0_0
DAOFactory Address: 0xc852E5Cb44C50614a82050163aB7170cB88EB5F9
```

## Installation

```bash
# Clone the repository
git clone https://github.com/createDAO/v2-core.git
cd v2-core

# Install dependencies
npm install
```

## Configuration

Create a `.env` file in the project root:

```env
# Network RPC URLs
SEPOLIA_RPC_URL=https://rpc.ankr.com/eth_sepolia
ETHEREUM_RPC_URL=https://rpc.ankr.com/eth

# API Keys for contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key

# Deployment wallet (use hardhat-keystore for production)
# CreateDAO_Deployer=your_wallet_CreateDAO_Deployer
```

### Secure Key Management

For production deployments, use Hardhat's keystore feature instead of plaintext private keys:

```bash
# Create encrypted keystore
npx hardhat keystore set CreateDAO_Deployer

# View keystore accounts
npx hardhat keystore list
```

## Usage

### Running Tests

Run the comprehensive test suite locally:

```bash
# Run all tests
npm test

# Run with Hardhat directly
npx hardhat test

# Run specific test file
npx hardhat test test/DAOFactory.test.ts
```

### Deployment

#### Recommended Flow (Deploy then Verify)

1) **Deploy + Create DAO (writes a deployment record; no verification)**

```bash
npx hardhat run scripts/flow/deploy-and-create.js --network sepolia
```

Optional:

```bash
FACTORY_SALT="my-production-salt" DEPLOYMENT_TAG="sepolia-smoke" npx hardhat run scripts/flow/deploy-and-create.js --network sepolia
```

This creates:
- `deployments/sepolia.latest.json`
- `deployments/sepolia-<chainId>-<timestamp>.json`

2) **Verify everything from the deployment record**

```bash
npx hardhat run scripts/flow/verify-all.js --network sepolia
```

To verify a specific record:

```bash
DEPLOYMENT_FILE=deployments/sepolia-11155111-<timestamp>.json npx hardhat run scripts/flow/verify-all.js --network sepolia
```

#### Advanced: Deploy Factory Only (Deterministic)

```bash
npx hardhat run scripts/deploy/factoryDeterministic.js --network sepolia
```

#### Predict Address Before Deployment

```bash
npx hardhat run scripts/deploy/predictAddress.js
```

### Creating a DAO

After the factory is deployed, you can create a new DAO:

```javascript
const factory = await ethers.getContractAt("DAOFactory", FACTORY_ADDRESS);

const tx = await factory.createDAO({
  daoName: "My DAO",
  tokenName: "My DAO Token",
  tokenSymbol: "MDT",
  totalSupply: ethers.parseEther("1000000"), // 1M tokens
  votingDelay: 86400,    // 1 day in seconds
  votingPeriod: 604800   // 1 week in seconds
});

const receipt = await tx.wait();
// Parse DAOCreated event for contract addresses
```

## Project Structure

```
createdao-contracts/
├── contracts/
│   ├── DAOFactory.sol      # Factory for deploying DAOs
│   ├── DAOGovernor.sol     # Governor with OZ extensions
│   └── DAOToken.sol        # ERC20 governance token
├── scripts/
│   ├── deploy/             # Deployment scripts
│   ├── flow/               # Complete workflow scripts
│   ├── utils/              # Utility functions
│   └── verify/             # Contract verification
└── test/
    ├── DAOFactory.test.ts  # Factory tests
    ├── DAOGovernor.test.ts # Governor tests
    ├── DAOToken.test.ts    # Token tests
    ├── helpers/            # Test utilities
    └── integration/        # Integration tests

```

## Tech Stack

- **Hardhat 3.1.0** - Development environment
- **OpenZeppelin Contracts 5.4.0** - Governance and token standards
- **OpenZeppelin Contracts Upgradeable 5.4.0** - For minimal proxy pattern
- **Viem** - TypeScript Ethereum library
- **TypeScript** - Type-safe development

## Documentation

- [OpenZeppelin Governor](https://docs.openzeppelin.com/contracts/5.x/governance) - OZ Governance docs

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

```
Copyright 2025 CreateDAO
```

## Contact

- **Website**: https://createdao.org
- **Email**: info@createdao.org
- **Author**: @dikobay

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

**⚠️ Note**: This project is in active development. Mainnet deployments will be announced once the contracts have been thoroughly tested and audited.
