/**
 * @title DAO Deployment
 * @notice Creates a new DAO using the DAOFactory
 * @dev Verifies token distribution and quorum requirements after creation
 */

import { formatEther, decodeEventLog } from "viem";
import * as logger from "../utils/logger.js";
import { getConfigForNetwork, FACTORY_CONSTANTS } from "../utils/config.js";

/**
 * Sleep helper
 * @param {number} ms
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait until the RPC reports contract bytecode at an address.
 * This avoids failures on load-balanced/stale RPCs immediately after deployment.
 *
 * @param {Object} publicClient
 * @param {string} address
 * @param {Object} [opts]
 * @param {string} [opts.label]
 * @param {number} [opts.timeoutMs]
 * @param {number} [opts.pollMs]
 */
const waitForCode = async (
  publicClient,
  address,
  { label = "contract", timeoutMs = 60_000, pollMs = 2_000 } = {}
) => {
  const started = Date.now();
  // viem returns `0x` or `undefined/null` depending on client/version
  // We'll treat anything other than a non-empty hex string as not deployed.
  while (true) {
    const code = await publicClient.getBytecode({ address });
    if (code && code !== "0x") return;

    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `Timed out waiting for bytecode at ${address} (${label}). ` +
          `This is usually RPC lag; try increasing confirmations or switching RPC.`
      );
    }

    await sleep(pollMs);
  }
};

/**
 * Retry wrapper with backoff for transient RPC inconsistencies.
 *
 * @template T
 * @param {() => Promise<T>} fn
 * @param {Object} [opts]
 * @param {number} [opts.retries]
 * @param {number} [opts.initialDelayMs]
 * @param {string} [opts.label]
 * @returns {Promise<T>}
 */
const withRetries = async (
  fn,
  { retries = 8, initialDelayMs = 750, label = "rpc read" } = {}
) => {
  let attempt = 0;
  // exponential backoff, capped
  while (true) {
    try {
      return await fn();
    } catch (error) {
      const returnedNoData =
        error?.cause?.name === "ContractFunctionZeroDataError" ||
        error?.shortMessage?.includes('returned no data') ||
        error?.message?.includes('returned no data');

      attempt += 1;
      if (!returnedNoData || attempt > retries) throw error;

      const delay = Math.min(initialDelayMs * 2 ** (attempt - 1), 10_000);
      logger.warn(
        `Transient RPC issue (${label}): contract returned no data. ` +
          `Retrying in ${delay}ms... (attempt ${attempt}/${retries})`
      );
      await sleep(delay);
    }
  }
};

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
  const confirmations = Number(process.env.TX_CONFIRMATIONS || 1);
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations,
  });
  logger.success(`Transaction confirmed in block: ${receipt.blockNumber}`);

  // Prefer reading created DAO addresses from the tx receipt event logs.
  // This avoids issues where a load-balanced RPC returns a slightly-stale state
  // immediately after a tx is mined.
  let token;
  let timelock;
  let governor;

  try {
    const factoryAddress = factoryContract.address;
    const factoryAbi = factoryContract.abi;

    for (const log of receipt.logs) {
      // Only consider logs emitted by the factory
      if (!log.address || log.address.toLowerCase() !== factoryAddress.toLowerCase()) continue;

      // Attempt to decode any factory log; ignore decode failures
      try {
        const decoded = decodeEventLog({
          abi: factoryAbi,
          data: log.data,
          topics: log.topics,
        });

        if (decoded.eventName === "DAOCreated") {
          token = decoded.args.token;
          timelock = decoded.args.timelock;
          governor = decoded.args.governor;
          break;
        }
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore and fall back
  }

  // Fallback: read the latest DAO via storage, but guard against daoCount=0.
  if (!token || !timelock || !governor) {
    const daoCount = await factoryContract.read.getDAOCount();
    if (daoCount === 0n) {
      throw new Error(
        "DAO creation tx confirmed but factory DAO count is 0. " +
          "This is likely due to RPC lag. Please re-run, increase confirmations, or switch RPC."
      );
    }

    const daoInfo = await factoryContract.read.getDAO([daoCount - 1n]);
    ({ token, timelock, governor } = daoInfo);
  }

  logger.success(`DAO created successfully!`);
  logger.address("DAOToken (Proxy)", token);
  logger.address("TimelockController", timelock);
  logger.address("DAOGovernor (Proxy)", governor);

  // Guard against load-balanced/stale RPC reads immediately after deployment
  await waitForCode(publicClient, token, { label: "DAOToken" });
  await waitForCode(publicClient, governor, { label: "DAOGovernor" });

  // Verify token distribution
  await verifyTokenDistribution(
    viem,
    publicClient,
    token,
    timelock,
    creatorAddress,
    config.totalSupply
  );

  // Verify quorum settings
  await verifyQuorumSettings(viem, publicClient, governor, token, creatorAddress);

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
  publicClient,
  tokenAddress,
  timelockAddress,
  creatorAddress,
  totalSupply
) => {
  logger.subHeader("Verifying Token Distribution");

  await waitForCode(publicClient, tokenAddress, { label: "DAOToken" });
  const tokenContract = await viem.getContractAt("DAOToken", tokenAddress);

  // Get balances (retry on transient zero-data RPC responses)
  const creatorBalance = await withRetries(
    () => tokenContract.read.balanceOf([creatorAddress]),
    { label: "DAOToken.balanceOf(creator)" }
  );
  const treasuryBalance = await withRetries(
    () => tokenContract.read.balanceOf([timelockAddress]),
    { label: "DAOToken.balanceOf(timelock)" }
  );
  const actualTotalSupply = await withRetries(
    () => tokenContract.read.totalSupply(),
    { label: "DAOToken.totalSupply" }
  );

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
  publicClient,
  governorAddress,
  tokenAddress,
  creatorAddress
) => {
  logger.subHeader("Verifying Quorum Settings");

  await waitForCode(publicClient, governorAddress, { label: "DAOGovernor" });
  await waitForCode(publicClient, tokenAddress, { label: "DAOToken" });

  const governorContract = await viem.getContractAt(
    "DAOGovernor",
    governorAddress
  );
  const tokenContract = await viem.getContractAt("DAOToken", tokenAddress);

  const currentBlock = await publicClient.getBlockNumber();

  // Get quorum at previous block (current block checkpoints may not be available)
  const quorum = await withRetries(
    () => governorContract.read.quorum([currentBlock - 1n]),
    { label: "DAOGovernor.quorum" }
  );
  const creatorVotingPower = await withRetries(
    () => tokenContract.read.getVotes([creatorAddress]),
    { label: "DAOToken.getVotes" }
  );
  const proposalThreshold = await withRetries(
    () => governorContract.read.proposalThreshold(),
    { label: "DAOGovernor.proposalThreshold" }
  );
  const votingDelay = await withRetries(
    () => governorContract.read.votingDelay(),
    { label: "DAOGovernor.votingDelay" }
  );
  const votingPeriod = await withRetries(
    () => governorContract.read.votingPeriod(),
    { label: "DAOGovernor.votingPeriod" }
  );

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
