// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/governance/TimelockControllerUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title DAOTimelock
 * @author CreateDAO
 * @notice TimelockController for DAO treasury management, designed for minimal proxy (EIP-1167) deployment
 * @dev Implementation contract for DAO timelocks deployed via DAOFactory
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *                                    ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * 
 * This contract uses the INITIALIZER PATTERN instead of constructors to support
 * EIP-1167 Minimal Proxy (Clone) deployment. Key characteristics:
 * 
 * 1. IMMUTABLE PROXY: Each clone permanently points to this implementation.
 *    The proxy bytecode hardcodes the implementation address - it CANNOT be changed.
 *    This is NOT an upgradeable proxy - there is no upgrade mechanism.
 * 
 * 2. SEPARATE STORAGE: Each clone has its own storage. The implementation's
 *    storage is never used (except for immutable variables).
 * 
 * 3. ONE-TIME INITIALIZATION: The `initialize()` function can only be called once
 *    per clone, enforced by OpenZeppelin's Initializable.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *                                     FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * 
 * - Inherits all TimelockController functionality (scheduling, execution, delays)
 * - PROPOSER_ROLE: Governor can propose/schedule operations
 * - EXECUTOR_ROLE: Anyone can execute (set to address(0))
 * - CANCELLER_ROLE: Governor can cancel operations
 * - Fixed minimum delay configured during initialization
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *                                  SECURITY NOTES
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * 
 * - Implementation contract has `_disableInitializers()` in constructor to prevent
 *   initialization of the implementation itself (defense in depth)
 * - Admin role is renounced after setup - no privileged admin access
 * - All operations go through time delay for security
 */
contract DAOTimelock is Initializable, TimelockControllerUpgradeable {
    // ═══════════════════════════════════════════════════════════════════════════════════
    //                                   CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════════════

    /**
     * @notice Disables initialization on the implementation contract
     * @dev This is a security measure. The implementation contract should never be
     *      initialized directly - only clones should be initialized.
     * 
     * @custom:oz-upgrades-unsafe-allow constructor
     */
    constructor() {
        _disableInitializers();
    }

    // ═══════════════════════════════════════════════════════════════════════════════════
    //                                  INITIALIZER
    // ═══════════════════════════════════════════════════════════════════════════════════

    /**
     * @notice Initializes a new DAO Timelock (called once per clone)
     * @dev Replaces the constructor for clone deployments. Can only be called once.
     * 
     * @param minDelay_ The minimum delay in seconds for timelock operations
     * @param admin_ The initial admin address (typically the factory, which renounces after setup)
     * 
     * @custom:security The `initializer` modifier ensures:
     *   1. This function can only be called once per clone
     *   2. Reentrancy during initialization is prevented
     *   3. The initialization state is properly tracked
     */
    function initialize(
        uint256 minDelay_,
        address admin_
    ) external initializer {
        // Empty arrays for proposers and executors - will be set up by factory
        address[] memory proposers = new address[](0);
        address[] memory executors = new address[](1);
        executors[0] = address(0); // Anyone can execute

        // Initialize the TimelockController
        __TimelockController_init(minDelay_, proposers, executors, admin_);
    }
}
