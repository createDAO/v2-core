/**
 * @title DAO Deployment
 * @notice Creates a new DAO using the DAOFactory
 * @dev Verifies token distribution and quorum requirements after creation
 */

import { formatEther } from "viem";
import * as logger from "../utils/logger.js";
import { getConfigForNetwork, FACTORY_CONSTANTS } from "../utils/config.js";

/**
 * Create a new DAO from the factory
 * @param {Object} factoryContract - The deployed factory contract instance
 * @param {Object} viem - The viem instance from factory deployment (shared context)
 * @param {Object} publicClient - The public client from factory deployment (shared context)
 * @param {string} networkName - The network name
 * @param {Object} customConfig - Optional custom configuration (overrides defaults)
 * @returns {Object} The created DAO addresses and contracts
 */
export const createDAO = async (factoryContract, viem, publicClient, networkName, customConfig = {}) => {
  // Use shared viem instance from factory deployment to ensure same network context
  logger.subHeader("Creating DAO");

  // Get the creator wallet
  const [creator] = await viem.getWalletClients();
  const creatorAddress = creator.account.address;
  logger.info(`Creator: ${creatorAddress}`);

  // Get network-specific config and merge with custom config
  const networkConfig = getConfigForNetwork(networkName);
  const config = { ...networkConfig, ...customConfig };

  // Log configuration
  logger.info(`DAO Name: ${config.daoName}`);
  logger.info(`Token Name: ${config.tokenName}`);
  logger.info(`Token Symbol: ${config.tokenSymbol}`);
  logger.info(`Total Supply: ${formatEther(config.totalSupply)} tokens`);
  logger.info(`Voting Delay: ${config.votingDelay} blocks`);
  logger.info(`Voting Period: ${config.votingPeriod} blocks`);

  // Prepare parameters struct
  const params = {
    daoName: config.daoName,
    tokenName: config.tokenName,
    tokenSymbol: config.tokenSymbol,
    totalSupply: config.totalSupply,
    votingDelay: config.votingDelay,
    votingPeriod: config.votingPeriod,
  };

  // Create DAO
  logger.info("Creating DAO...");
  const hash = await factoryContract.write.createDAO([params]);
  logger.info(`Transaction hash: ${hash}`);

  // Wait for transaction and get receipt (using shared publicClient from factory)
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
  });
  logger.success(`Transaction confirmed in block: ${receipt.blockNumber}`);

  // Get DAO count and fetch the latest DAO
  const daoCount = await factoryContract.read.getDAOCount();
  const daoInfo = await factoryContract.read.getDAO([daoCount - 1n]);

  const { token, timelock, governor } = daoInfo;

  logger.success(`DAO created successfully!`);
  logger.address("DAOToken (Proxy)", token);
  logger.address("TimelockController", timelock);
  logger.address("DAOGovernor (Proxy)", governor);

  // Verify token distribution
  await verifyTokenDistribution(
    viem,
    token,
    timelock,
    creatorAddress,
    config.totalSupply
  );

  // Verify quorum settings
  await verifyQuorumSettings(viem, governor, token, creatorAddress);

  return {
    token,
    timelock,
    governor,
    creator: creatorAddress,
    config,
  };
};

/**
 * Verify that token distribution is correct
 * @param {Object} viem - The viem instance
 * @param {string} tokenAddress - The token contract address
 * @param {string} timelockAddress - The timelock (treasury) address
 * @param {string} creatorAddress - The creator's address
 * @param {bigint} totalSupply - The total token supply
 */
const verifyTokenDistribution = async (
  viem,
  tokenAddress,
  timelockAddress,
  creatorAddress,
  totalSupply
) => {
  logger.subHeader("Verifying Token Distribution");

  const tokenContract = await viem.getContractAt("DAOToken", tokenAddress);

  // Get balances
  const creatorBalance = await tokenContract.read.balanceOf([creatorAddress]);
  const treasuryBalance = await tokenContract.read.balanceOf([timelockAddress]);
  const actualTotalSupply = await tokenContract.read.totalSupply();

  // Calculate expected amounts
  const expectedCreatorAmount =
    (totalSupply * FACTORY_CONSTANTS.CREATOR_ALLOCATION_PERCENT) / 100n;
  const expectedTreasuryAmount = totalSupply - expectedCreatorAmount;

  // Verify total supply
  if (actualTotalSupply === totalSupply) {
    logger.success(
      `Total supply correct: ${formatEther(actualTotalSupply)} tokens`
    );
  } else {
    logger.error(
      `Total supply mismatch! Expected: ${formatEther(
        totalSupply
      )}, Got: ${formatEther(actualTotalSupply)}`
    );
  }

  // Verify creator balance (1%)
  if (creatorBalance === expectedCreatorAmount) {
    logger.success(
      `Creator balance correct: ${formatEther(creatorBalance)} tokens (${
        FACTORY_CONSTANTS.CREATOR_ALLOCATION_PERCENT
      }%)`
    );
  } else {
    logger.error(
      `Creator balance mismatch! Expected: ${formatEther(
        expectedCreatorAmount
      )}, Got: ${formatEther(creatorBalance)}`
    );
  }

  // Verify treasury balance (99%)
  if (treasuryBalance === expectedTreasuryAmount) {
    logger.success(
      `Treasury balance correct: ${formatEther(treasuryBalance)} tokens (${
        100n - FACTORY_CONSTANTS.CREATOR_ALLOCATION_PERCENT
      }%)`
    );
  } else {
    logger.error(
      `Treasury balance mismatch! Expected: ${formatEther(
        expectedTreasuryAmount
      )}, Got: ${formatEther(treasuryBalance)}`
    );
  }

  // Log token distribution summary
  logger.tokenDistribution({
    creator: creatorAddress,
    creatorBalance: formatEther(creatorBalance),
    creatorPercent: FACTORY_CONSTANTS.CREATOR_ALLOCATION_PERCENT.toString(),
    treasury: timelockAddress,
    treasuryBalance: formatEther(treasuryBalance),
    treasuryPercent: (
      100n - FACTORY_CONSTANTS.CREATOR_ALLOCATION_PERCENT
    ).toString(),
    totalSupply: formatEther(actualTotalSupply),
  });
};

/**
 * Verify quorum settings to ensure DAO is not deadlocked
 * @param {Object} viem - The viem instance
 * @param {string} governorAddress - The governor contract address
 * @param {string} tokenAddress - The token contract address
 * @param {string} creatorAddress - The creator's address
 */
const verifyQuorumSettings = async (
  viem,
  governorAddress,
  tokenAddress,
  creatorAddress
) => {
  logger.subHeader("Verifying Quorum Settings");

  const governorContract = await viem.getContractAt(
    "DAOGovernor",
    governorAddress
  );
  const tokenContract = await viem.getContractAt("DAOToken", tokenAddress);

  // Get public client for current block
  const publicClient = await viem.getPublicClient();
  const currentBlock = await publicClient.getBlockNumber();

  // Get quorum at previous block (current block checkpoints may not be available)
  const quorum = await governorContract.read.quorum([currentBlock - 1n]);
  const creatorVotingPower = await tokenContract.read.getVotes([
    creatorAddress,
  ]);
  const proposalThreshold = await governorContract.read.proposalThreshold();
  const votingDelay = await governorContract.read.votingDelay();
  const votingPeriod = await governorContract.read.votingPeriod();

  logger.info(`Quorum required: ${formatEther(quorum)} tokens`);
  logger.info(
    `Creator voting power: ${formatEther(creatorVotingPower)} tokens`
  );
  logger.info(`Proposal threshold: ${formatEther(proposalThreshold)} tokens`);

  // Verify creator can meet quorum (prevents deadlock)
  if (creatorVotingPower >= quorum) {
    logger.success(
      `✓ Creator can meet quorum alone (${formatEther(
        creatorVotingPower
      )} >= ${formatEther(quorum)})`
    );
  } else {
    logger.warn(
      `⚠ Creator cannot meet quorum alone. Additional votes needed: ${formatEther(
        quorum - creatorVotingPower
      )}`
    );
  }

  // Verify creator can create proposals
  if (creatorVotingPower >= proposalThreshold) {
    logger.success(
      `✓ Creator can create proposals (${formatEther(
        creatorVotingPower
      )} >= ${formatEther(proposalThreshold)})`
    );
  } else {
    logger.error(
      `✗ Creator cannot create proposals! Needs: ${formatEther(
        proposalThreshold - creatorVotingPower
      )} more tokens`
    );
  }

  // Log governance configuration
  logger.governanceConfig({
    daoName: await governorContract.read.name(),
    votingDelay: votingDelay.toString(),
    votingPeriod: votingPeriod.toString(),
    proposalThreshold: formatEther(proposalThreshold) + " tokens",
    quorumPercent: FACTORY_CONSTANTS.QUORUM_FRACTION.toString(),
  });
};

export default { createDAO };
