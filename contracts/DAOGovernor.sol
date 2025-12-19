// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/governance/GovernorUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorSettingsUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorCountingSimpleUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorVotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorVotesQuorumFractionUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/governance/extensions/GovernorTimelockControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title DAOGovernor
 * @notice Governor contract for DAO governance with timelock integration and manager role
 * @dev Implementation contract for EIP-1167 minimal proxy deployment
 * 
 * Combines multiple OpenZeppelin governance extensions:
 * - GovernorSettings: Configurable voting delay, voting period, and proposal threshold
 * - GovernorCountingSimple: Simple For/Against/Abstain voting
 * - GovernorVotes: Voting power from ERC20Votes token
 * - GovernorVotesQuorumFraction: Quorum as percentage of total supply (1%)
 * - GovernorTimelockControl: Execution through TimelockController
 * 
 * Manager Role:
 * - A single address designated as the DAO manager
 * - Set during initialization (defaults to DAO creator)
 * - Can be changed through governance proposals
 * - Useful for backend systems to verify authorized addresses via RPC
 * 
 * Architecture decisions:
 * - Quorum: 1% of total supply (creator receives 1% and can meet quorum alone)
 * - Proposal threshold: 1% of total supply (only significant holders can propose)
 * - All proposals execute through timelock for security
 * - Uses initializer pattern for minimal proxy deployment
 */
contract DAOGovernor is
    Initializable,
    GovernorUpgradeable,
    GovernorSettingsUpgradeable,
    GovernorCountingSimpleUpgradeable,
    GovernorVotesUpgradeable,
    GovernorVotesQuorumFractionUpgradeable,
    GovernorTimelockControlUpgradeable
{
    // ============ Manager Role Storage ============

    /// @notice The address designated as the DAO manager
    /// @dev Can be queried via RPC for backend authorization checks
    address private _manager;

    /// @notice Emitted when the manager address is changed
    /// @param previousManager The address of the previous manager
    /// @param newManager The address of the new manager
    event ManagerChanged(address indexed previousManager, address indexed newManager);

    /// @notice Error thrown when a non-governance caller tries to set manager
    error OnlyGovernance();

    /**
     * @notice Disables initialization on the implementation contract
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializes a new DAO Governor (called once per clone)
     * @param name_ The name of the DAO (e.g., "MyDAO")
     * @param token_ The governance token (DAOToken) address
     * @param timelock_ The TimelockController address
     * @param votingDelay_ Delay in blocks before voting starts after proposal
     * @param votingPeriod_ Duration in blocks for voting period
     * @param proposalThreshold_ Minimum tokens required to create a proposal (in wei)
     * @param initialManager_ The initial manager address (typically the DAO creator)
     */
    function initialize(
        string memory name_,
        IVotes token_,
        TimelockControllerUpgradeable timelock_,
        uint48 votingDelay_,
        uint32 votingPeriod_,
        uint256 proposalThreshold_,
        address initialManager_
    ) external initializer {
        __Governor_init(name_);
        __GovernorSettings_init(votingDelay_, votingPeriod_, proposalThreshold_);
        __GovernorCountingSimple_init();
        __GovernorVotes_init(token_);
        __GovernorVotesQuorumFraction_init(1); // 1% quorum
        __GovernorTimelockControl_init(timelock_);
        
        // Set initial manager
        _manager = initialManager_;
        emit ManagerChanged(address(0), initialManager_);
    }

    // ============ Version Function ============

    /**
     * @notice Returns the DAOGovernor contract version
     * @dev Separate from OpenZeppelin's version() which returns the Governor version
     * @return The version string "1.0.0"
     */
    function daoVersion() public pure returns (string memory) {
        return "1.0.0";
    }

    // ============ Manager Role Functions ============

    /**
     * @notice Returns the current manager address
     * @dev Can be called via RPC to verify authorization in backend systems
     * @return The address of the current manager
     */
    function manager() public view returns (address) {
        return _manager;
    }

    /**
     * @notice Sets a new manager address
     * @dev Can only be called through governance (via timelock execution)
     * @param newManager The address to set as the new manager
     * 
     * To change the manager, create a proposal with:
     * - target: governor address
     * - value: 0
     * - calldata: abi.encodeWithSignature("setManager(address)", newManagerAddress)
     */
    function setManager(address newManager) external {
        // Only the timelock (executor) can call this function
        // This ensures changes go through governance proposals
        if (msg.sender != _executor()) {
            revert OnlyGovernance();
        }
        
        address oldManager = _manager;
        _manager = newManager;
        emit ManagerChanged(oldManager, newManager);
    }

    // ============ Clock Functions (Timestamp-Based) ============

    /**
     * @notice Returns the current clock value for governance (timestamp)
     * @dev Required by ERC6372. Must match the token's clock mode.
     *      Uses timestamps for predictable timing across all chains.
     * @return Current block timestamp as uint48
     */
    function clock() public view override(GovernorUpgradeable, GovernorVotesUpgradeable) returns (uint48) {
        return uint48(block.timestamp);
    }

    /**
     * @notice Returns the clock mode description
     * @dev Required by ERC6372. Must match the token's clock mode.
     * @return Mode string indicating timestamp-based timing
     */
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override(GovernorUpgradeable, GovernorVotesUpgradeable) returns (string memory) {
        return "mode=timestamp";
    }

    // ============ Required Overrides ============

    function votingDelay()
        public
        view
        override(GovernorUpgradeable, GovernorSettingsUpgradeable)
        returns (uint256)
    {
        return super.votingDelay();
    }

    function votingPeriod()
        public
        view
        override(GovernorUpgradeable, GovernorSettingsUpgradeable)
        returns (uint256)
    {
        return super.votingPeriod();
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(GovernorUpgradeable, GovernorVotesQuorumFractionUpgradeable)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }

    function state(uint256 proposalId)
        public
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (ProposalState)
    {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function proposalThreshold()
        public
        view
        override(GovernorUpgradeable, GovernorSettingsUpgradeable)
        returns (uint256)
    {
        return super.proposalThreshold();
    }

    function _propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description,
        address proposer
    ) internal override(GovernorUpgradeable) returns (uint256) {
        return super._propose(targets, values, calldatas, description, proposer);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(GovernorUpgradeable, GovernorTimelockControlUpgradeable) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor()
        internal
        view
        override(GovernorUpgradeable, GovernorTimelockControlUpgradeable)
        returns (address)
    {
        return super._executor();
    }
}
