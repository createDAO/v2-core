// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./DAOToken.sol";
import "./DAOGovernor.sol";
import "./DAOTimelock.sol";

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
    /// @notice Thrown when timelockDelay is zero
    error InvalidTimelockDelay();
    /// @notice Thrown when index is out of bounds
    error IndexOutOfBounds();

    /// @notice Percentage of tokens sent to creator (1%)
    uint256 public constant CREATOR_ALLOCATION_PERCENT = 1;

    /// @notice The DAOToken implementation contract address (for cloning)
    address public immutable tokenImplementation;

    /// @notice The DAOGovernor implementation contract address (for cloning)
    address public immutable governorImplementation;

    /// @notice The DAOTimelock implementation contract address (for cloning)
    address public immutable timelockImplementation;

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
        uint256 timelockDelay;
    }

    // ============ Custom Errors for Constructor ============
    /// @notice Thrown when implementation address is zero
    error InvalidImplementation();

    /// @notice Array of all deployed DAOs
    DAOInfo[] public deployedDAOs;

    /// @notice Mapping from creator to their DAOs
    mapping(address => DAOInfo[]) public creatorDAOs;

    /**
     * @notice Initializes the factory with pre-deployed implementation contracts
     * @dev Implementation contracts must be deployed separately before the factory.
     *      This pattern reduces factory bytecode size and allows implementation reuse.
     * @param tokenImpl_ Address of the deployed DAOToken implementation
     * @param governorImpl_ Address of the deployed DAOGovernor implementation
     * @param timelockImpl_ Address of the deployed DAOTimelock implementation
     */
    constructor(
        address tokenImpl_,
        address governorImpl_,
        address timelockImpl_
    ) {
        if (tokenImpl_ == address(0)) revert InvalidImplementation();
        if (governorImpl_ == address(0)) revert InvalidImplementation();
        if (timelockImpl_ == address(0)) revert InvalidImplementation();
        
        tokenImplementation = tokenImpl_;
        governorImplementation = governorImpl_;
        timelockImplementation = timelockImpl_;
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
     *   - timelockDelay: Minimum delay in seconds for timelock operations (e.g., 86400 for 1 day)
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
        if (params.timelockDelay == 0) revert InvalidTimelockDelay();

        // Deploy all contracts
        (token, timelock, governor) = _deployContracts(params);

        // Configure timelock roles
        _configureTimelock(DAOTimelock(payable(timelock)), governor);

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
     * @dev Generates a unique salt for deterministic deployment
     * @param creator The address creating the DAO
     * @return salt The unique salt combining chainid, creator, and timestamp
     */
    function _generateSalt(address creator) internal view returns (bytes32) {
        return keccak256(abi.encode(
            block.chainid,      // Chain-specific - ensures unique addresses across chains
            creator,            // Creator-specific
            block.timestamp     // Timestamp for same-block uniqueness
        ));
    }

    /**
     * @dev Deploys Token, Timelock, and Governor via deterministic clones (CREATE2)
     * Uses chain-unique salt to ensure different addresses across chains
     */
    function _deployContracts(
        CreateDAOParams calldata params
    ) internal returns (address token, address timelock, address governor) {
        // Calculate proposal threshold (1% of total supply)
        uint256 proposalThreshold = (params.totalSupply * CREATOR_ALLOCATION_PERCENT) / 100;

        // Generate base salt for deterministic deployment
        bytes32 baseSalt = _generateSalt(msg.sender);

        // Deploy Token as deterministic minimal proxy (EIP-1167 clone with CREATE2)
        bytes32 tokenSalt = keccak256(abi.encode(baseSalt, "TOKEN"));
        token = Clones.cloneDeterministic(tokenImplementation, tokenSalt);
        DAOToken(token).initialize(
            params.tokenName,
            params.tokenSymbol,
            params.totalSupply,
            address(this)
        );

        // Deploy Timelock as deterministic minimal proxy (EIP-1167 clone with CREATE2)
        bytes32 timelockSalt = keccak256(abi.encode(baseSalt, "TIMELOCK"));
        timelock = Clones.cloneDeterministic(timelockImplementation, timelockSalt);
        DAOTimelock(payable(timelock)).initialize(
            params.timelockDelay,
            address(this)  // Factory is initial admin, will renounce after setup
        );

        // Deploy Governor as deterministic minimal proxy (EIP-1167 clone with CREATE2)
        // Creator (msg.sender) is set as the initial manager
        bytes32 governorSalt = keccak256(abi.encode(baseSalt, "GOVERNOR"));
        governor = Clones.cloneDeterministic(governorImplementation, governorSalt);
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
     * @dev Configures DAOTimelock roles
     */
    function _configureTimelock(
        DAOTimelock daoTimelock,
        address governor
    ) internal {
        // Grant PROPOSER_ROLE to Governor
        bytes32 proposerRole = daoTimelock.PROPOSER_ROLE();
        daoTimelock.grantRole(proposerRole, governor);

        // Grant CANCELLER_ROLE to Governor
        bytes32 cancellerRole = daoTimelock.CANCELLER_ROLE();
        daoTimelock.grantRole(cancellerRole, governor);

        // Revoke ADMIN role from factory
        bytes32 adminRole = daoTimelock.DEFAULT_ADMIN_ROLE();
        daoTimelock.revokeRole(adminRole, address(this));
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
