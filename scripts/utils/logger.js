/**
 * @title Logger
 * @notice Consistent logging utility for deployment scripts
 * @dev Provides structured, colored output for better readability
 */

// ANSI color codes for terminal output
const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

/**
 * Print a section header
 * @param {string} title - The section title
 */
export const header = (title) => {
  console.log(
    `\n${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}  ${title}${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.cyan}════════════════════════════════════════════════════════════════${colors.reset}\n`
  );
};

/**
 * Print a sub-section header
 * @param {string} title - The sub-section title
 */
export const subHeader = (title) => {
  console.log(
    `\n${colors.bright}${colors.blue}── ${title} ──${colors.reset}\n`
  );
};

/**
 * Print an info message
 * @param {string} message - The message to print
 */
export const info = (message) => {
  console.log(`${colors.dim}ℹ${colors.reset}  ${message}`);
};

/**
 * Print a success message
 * @param {string} message - The message to print
 */
export const success = (message) => {
  console.log(`${colors.green}✓${colors.reset}  ${message}`);
};

/**
 * Print a warning message
 * @param {string} message - The message to print
 */
export const warn = (message) => {
  console.log(`${colors.yellow}⚠${colors.reset}  ${message}`);
};

/**
 * Print an error message
 * @param {string} message - The message to print
 */
export const error = (message) => {
  console.log(`${colors.red}✗${colors.reset}  ${message}`);
};

/**
 * Print a step being executed
 * @param {number} step - Step number
 * @param {string} description - Step description
 */
export const step = (stepNum, description) => {
  console.log(
    `\n${colors.bright}${colors.magenta}[Step ${stepNum}]${colors.reset} ${description}`
  );
};

/**
 * Print a contract address
 * @param {string} label - Label for the address
 * @param {string} address - The contract address
 */
export const address = (label, addr) => {
  console.log(
    `   ${colors.dim}${label}:${colors.reset} ${colors.cyan}${addr}${colors.reset}`
  );
};

/**
 * Print a key-value pair
 * @param {string} key - The key
 * @param {string} value - The value
 */
export const keyValue = (key, value) => {
  console.log(`   ${colors.dim}${key}:${colors.reset} ${value}`);
};

/**
 * Print deployment summary
 * @param {Object} addresses - Object containing all deployed addresses
 */
export const summary = (addresses) => {
  header("DEPLOYMENT SUMMARY");

  if (addresses.factory) {
    subHeader("Factory Contracts");
    address("DAOFactory", addresses.factory);
    if (addresses.tokenImplementation) {
      address("DAOToken Implementation", addresses.tokenImplementation);
    }
    if (addresses.governorImplementation) {
      address("DAOGovernor Implementation", addresses.governorImplementation);
    }
  }

  if (addresses.token || addresses.governor || addresses.timelock) {
    subHeader("DAO Contracts");
    if (addresses.token) address("DAOToken (Proxy)", addresses.token);
    if (addresses.timelock) address("TimelockController", addresses.timelock);
    if (addresses.governor) address("DAOGovernor (Proxy)", addresses.governor);
  }

  console.log(
    `\n${colors.bright}${colors.green}════════════════════════════════════════════════════════════════${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.green}  Deployment Complete!${colors.reset}`
  );
  console.log(
    `${colors.bright}${colors.green}════════════════════════════════════════════════════════════════${colors.reset}\n`
  );
};

/**
 * Print token distribution info
 * @param {Object} distribution - Token distribution details
 */
export const tokenDistribution = (distribution) => {
  subHeader("Token Distribution");
  keyValue("Creator Address", distribution.creator);
  keyValue("Creator Balance", `${distribution.creatorBalance} (${distribution.creatorPercent}%)`);
  keyValue("Treasury Address", distribution.treasury);
  keyValue("Treasury Balance", `${distribution.treasuryBalance} (${distribution.treasuryPercent}%)`);
  keyValue("Total Supply", distribution.totalSupply);
};

/**
 * Print governance info
 * @param {Object} governance - Governance configuration details
 */
export const governanceConfig = (governance) => {
  subHeader("Governance Configuration");
  keyValue("DAO Name", governance.daoName);
  keyValue("Voting Delay", `${governance.votingDelay} blocks`);
  keyValue("Voting Period", `${governance.votingPeriod} blocks`);
  keyValue("Proposal Threshold", governance.proposalThreshold);
  keyValue("Quorum", `${governance.quorumPercent}% of total supply`);
};

export default {
  header,
  subHeader,
  info,
  success,
  warn,
  error,
  step,
  address,
  keyValue,
  summary,
  tokenDistribution,
  governanceConfig,
};
