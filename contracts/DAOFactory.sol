// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/governance/TimelockController.sol";
import "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./DAOToken.sol";
import "./DAOGovernor.sol";

/**
 * @title DAOFactory
 * @notice Factory contract for deploying complete DAO governance systems
 * @dev Deploys and configures: DAOToken and DAOGovernor (via minimal proxy), TimelockController (treasury)
 * 
 * Architecture:
 * - Token: ERC20Votes with auto-delegation, deployed as EIP-1167 minimal proxy
 * - Governor: Controls treasury via proposals, deployed as EIP-1167 minimal proxy
 * - Treasury: TimelockController holds 99% of tokens
 * - Creator: Receives 1% of tokens (auto-delegated, can immediately vote)
 * 
 * Gas Optimization:
 * - DAOToken and DAOGovernor use minimal proxy pattern (EIP-1167)
 * - Each proxy deployment costs ~45k gas instead of ~2M gas for full contracts
 * - Implementation contracts are deployed once in constructor
 * - Uses custom errors instead of require strings for reduced bytecode
 */
contract DAOFactory {
    // ============ Custom Errors ============
    /// @notice Thrown when totalSupply is zero
    error InvalidTotalSupply();
    /// @notice Thrown when daoName is empty
    error EmptyDAOName();
    /// @notice Thrown when tokenName is empty
    error EmptyTokenName();
    /// @notice Thrown when tokenSymbol is empty
    error EmptyTokenSymbol();
    /// @notice Thrown when votingPeriod is zero
    error InvalidVotingPeriod();
    /// @notice Thrown when index is out of bounds
    error IndexOutOfBounds();

    /// @notice Fixed timelock delay: 1 day
    uint256 public constant TIMELOCK_MIN_DELAY = 1 days;

    /// @notice Percentage of tokens sent to creator (1%)
    uint256 public constant CREATOR_ALLOCATION_PERCENT = 1;

    /// @notice The DAOToken implementation contract address (for cloning)
    address public immutable tokenImplementation;

    /// @notice The DAOGovernor implementation contract address (for cloning)
    address public immutable governorImplementation;

    /// @notice Emitted when a new DAO is created
    event DAOCreated(
        address indexed creator,
        address indexed token,
        address indexed governor,
        address timelock,
        string daoName,
        string tokenName,
        string tokenSymbol,
        uint256 totalSupply
    );

    /// @notice Struct to hold DAO deployment info
    struct DAOInfo {
        address token;
        address timelock;
        address governor;
        address creator;
        string daoName;
        uint256 createdAt;
    }

    /// @notice Struct for createDAO parameters to avoid stack too deep
    struct CreateDAOParams {
        string daoName;
        string tokenName;
        string tokenSymbol;
        uint256 totalSupply;
        uint48 votingDelay;
        uint32 votingPeriod;
    }

    /// @notice Array of all deployed DAOs
    DAOInfo[] public deployedDAOs;

    /// @notice Mapping from creator to their DAOs
    mapping(address => DAOInfo[]) public creatorDAOs;

    /**
     * @notice Deploys the DAOToken and DAOGovernor implementations for cloning
     * @dev Implementation contracts are never initialized - only clones are
     */
    constructor() {
        tokenImplementation = address(new DAOToken());
        governorImplementation = address(new DAOGovernor());
    }

    /**
     * @notice Creates a new DAO with governance token, timelock treasury, and governor
     * @param params CreateDAOParams struct containing:
     *   - daoName: Name of the DAO (used for Governor)
     *   - tokenName: Name of the governance token
     *   - tokenSymbol: Symbol of the governance token
     *   - totalSupply: Total token supply in wei (e.g., 1000000 * 10^18 for 1M tokens)
     *   - votingDelay: Delay in seconds before voting starts (e.g., 86400 for 1 day)
     *   - votingPeriod: Duration in seconds for voting (e.g., 604800 for 1 week)
     * @return token Address of deployed DAOToken (proxy)
     * @return timelock Address of deployed TimelockController (treasury)
     * @return governor Address of deployed DAOGovernor (proxy)
     */
    function createDAO(
        CreateDAOParams calldata params
    ) external returns (address token, address timelock, address governor) {
        if (params.totalSupply == 0) revert InvalidTotalSupply();
        if (bytes(params.daoName).length == 0) revert EmptyDAOName();
        if (bytes(params.tokenName).length == 0) revert EmptyTokenName();
        if (bytes(params.tokenSymbol).length == 0) revert EmptyTokenSymbol();
        if (params.votingPeriod == 0) revert InvalidVotingPeriod();

        // Deploy all contracts
        (token, timelock, governor) = _deployContracts(params);

        // Configure timelock roles
        _configureTimelock(TimelockController(payable(timelock)), governor);

        // Distribute tokens
        _distributeTokens(DAOToken(token), timelock, params.totalSupply);

        // Record DAO info
        _recordDAO(token, timelock, governor, params.daoName);

        // Emit event
        emit DAOCreated(
            msg.sender,
            token,
            governor,
            timelock,
            params.daoName,
            params.tokenName,
            params.tokenSymbol,
            params.totalSupply
        );

        return (token, timelock, governor);
    }

    /**
     * @dev Deploys Token (via clone), Timelock, and Governor (via clone) contracts
     */
    function _deployContracts(
        CreateDAOParams calldata params
    ) internal returns (address token, address timelock, address governor) {
        // Calculate proposal threshold (1% of total supply)
        uint256 proposalThreshold = (params.totalSupply * CREATOR_ALLOCATION_PERCENT) / 100;

        // Deploy Token as minimal proxy (EIP-1167 clone)
        token = Clones.clone(tokenImplementation);
        DAOToken(token).initialize(
            params.tokenName,
            params.tokenSymbol,
            params.totalSupply,
            address(this)
        );

        // Deploy TimelockController (not cloned - different config per DAO)
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0); // Anyone can execute

        TimelockController timelockController = new TimelockController(
            TIMELOCK_MIN_DELAY,
            proposers,
            executors,
            address(this)
        );
        timelock = address(timelockController);

        // Deploy Governor as minimal proxy (EIP-1167 clone)
        // Creator (msg.sender) is set as the initial manager
        governor = Clones.clone(governorImplementation);
        DAOGovernor(payable(governor)).initialize(
            params.daoName,
            IVotes(token),
            TimelockControllerUpgradeable(payable(timelock)),
            params.votingDelay,
            params.votingPeriod,
            proposalThreshold,
            msg.sender  // Set creator as initial manager
        );

        return (token, timelock, governor);
    }

    /**
     * @dev Configures TimelockController roles
     */
    function _configureTimelock(
        TimelockController timelockController,
        address governor
    ) internal {
        // Grant PROPOSER_ROLE to Governor
        bytes32 proposerRole = timelockController.PROPOSER_ROLE();
        timelockController.grantRole(proposerRole, governor);

        // Grant CANCELLER_ROLE to Governor
        bytes32 cancellerRole = timelockController.CANCELLER_ROLE();
        timelockController.grantRole(cancellerRole, governor);

        // Revoke ADMIN role from factory
        bytes32 adminRole = timelockController.DEFAULT_ADMIN_ROLE();
        timelockController.revokeRole(adminRole, address(this));
    }

    /**
     * @dev Distributes tokens to creator and treasury
     */
    function _distributeTokens(
        DAOToken daoToken,
        address timelock,
        uint256 totalSupply
    ) internal {
        uint256 creatorAmount = (totalSupply * CREATOR_ALLOCATION_PERCENT) / 100;
        uint256 treasuryAmount = totalSupply - creatorAmount;

        // Transfer 1% to creator
        daoToken.transfer(msg.sender, creatorAmount);
        
        // Transfer 99% to timelock (treasury)
        daoToken.transfer(timelock, treasuryAmount);
    }

    /**
     * @dev Records DAO info in storage
     */
    function _recordDAO(
        address token,
        address timelock,
        address governor,
        string calldata daoName
    ) internal {
        DAOInfo memory daoInfo = DAOInfo({
            token: token,
            timelock: timelock,
            governor: governor,
            creator: msg.sender,
            daoName: daoName,
            createdAt: block.timestamp
        });
        
        deployedDAOs.push(daoInfo);
        creatorDAOs[msg.sender].push(daoInfo);
    }

    /**
     * @notice Returns the total number of DAOs created
     */
    function getDAOCount() external view returns (uint256) {
        return deployedDAOs.length;
    }

    /**
     * @notice Returns all DAOs created by a specific address
     * @param creator The address to query
     */
    function getDAOsByCreator(address creator) external view returns (DAOInfo[] memory) {
        return creatorDAOs[creator];
    }

    /**
     * @notice Returns DAO info at a specific index
     * @param index The index in deployedDAOs array
     */
    function getDAO(uint256 index) external view returns (DAOInfo memory) {
        if (index >= deployedDAOs.length) revert IndexOutOfBounds();
        return deployedDAOs[index];
    }
}
