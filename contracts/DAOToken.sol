// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20VotesUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title DAOToken
 * @author CreateDAO
 * @notice ERC20 governance token with voting capabilities, designed for minimal proxy (EIP-1167) deployment
 * @dev Implementation contract for DAO governance tokens deployed via DAOFactory
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
 * 2. NO OWNER/ADMIN: The proxy has no owner, no admin, no special privileges.
 *    It simply forwards all calls to this implementation via delegatecall.
 * 
 * 3. SEPARATE STORAGE: Each clone has its own storage. The implementation's
 *    storage is never used (except for immutable variables).
 * 
 * 4. ONE-TIME INITIALIZATION: The `initialize()` function can only be called once
 *    per clone, enforced by OpenZeppelin's Initializable. This prevents:
 *    - Re-initialization attacks
 *    - State manipulation after deployment
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *                                     FEATURES
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * 
 * - ERC20Votes: Tracks voting power with historical checkpoints for governance
 * - ERC20Permit: Gasless approvals via EIP-2612 signatures
 * - Auto-delegation: First-time token recipients automatically self-delegate,
 *   ensuring voting power is immediately active without manual action
 * - 18 decimals (standard ERC20)
 * 
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *                                  SECURITY NOTES
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * 
 * - Implementation contract has `_disableInitializers()` in constructor to prevent
 *   initialization of the implementation itself (defense in depth)
 * - No minting after initial supply - total supply is fixed at initialization
 * - No owner/admin functions - fully decentralized from deployment
 */
contract DAOToken is 
    Initializable, 
    ERC20Upgradeable, 
    ERC20PermitUpgradeable, 
    ERC20VotesUpgradeable 
{
    // ═══════════════════════════════════════════════════════════════════════════════════
    //                                    STORAGE
    // ═══════════════════════════════════════════════════════════════════════════════════

    /// @notice Tracks addresses that have received tokens (for auto-delegation)
    /// @dev Used to auto-delegate voting power on first token receipt
    mapping(address => bool) private _hasReceivedTokens;

    // ═══════════════════════════════════════════════════════════════════════════════════
    //                                   CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════════════════════

    /**
     * @notice Disables initialization on the implementation contract
     * @dev This is a security measure. The implementation contract should never be
     *      initialized directly - only clones should be initialized.
     * 
     *      Why this matters:
     *      - If someone initialized the implementation, they could potentially
     *        manipulate it in ways that affect clone behavior (for immutable vars)
     *      - This follows OpenZeppelin's best practice for implementation contracts
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
     * @notice Initializes a new DAO governance token (called once per clone)
     * @dev Replaces the constructor for clone deployments. Can only be called once.
     * 
     * @param name_ The name of the token (e.g., "MyDAO Token")
     * @param symbol_ The symbol of the token (e.g., "MDT")
     * @param totalSupply_ Total supply to mint in wei (e.g., 1000000 * 10^18 for 1M tokens)
     * @param mintTo_ Address to receive the initial supply (typically the factory,
     *                which then distributes to creator and treasury)
     * 
     * @custom:security The `initializer` modifier ensures:
     *   1. This function can only be called once per clone
     *   2. Reentrancy during initialization is prevented
     *   3. The initialization state is properly tracked
     */
    function initialize(
        string memory name_,
        string memory symbol_,
        uint256 totalSupply_,
        address mintTo_
    ) external initializer {
        // Initialize inherited contracts in the correct order
        // Order matters for proper initialization of storage variables
        __ERC20_init(name_, symbol_);
        __ERC20Permit_init(name_);
        __ERC20Votes_init();

        // Mint the total supply to the specified address
        // This is typically the factory, which distributes tokens appropriately
        _mint(mintTo_, totalSupply_);
    }

    // ═══════════════════════════════════════════════════════════════════════════════════
    //                                 CLOCK FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════════════════════

    /**
     * @notice Returns the current clock value for governance (timestamp)
     * @dev Required by ERC6372 for governance timing. Uses timestamps as the
     *      time-keeping mechanism for voting snapshots.
     * 
     *      Why timestamps over block numbers:
     *      - Predictable timing across all chains (L1, L2s have different block times)
     *      - Better UX: users understand "1 day" better than "7200 blocks"
     *      - Consistent behavior regardless of network congestion
     * 
     * @return Current block timestamp as uint48
     */
    function clock() public view override returns (uint48) {
        return uint48(block.timestamp);
    }

    /**
     * @notice Returns the clock mode description
     * @dev Required by ERC6372. Indicates that this token uses timestamps
     *      for governance timing (as opposed to block numbers).
     * 
     * @return Mode string indicating timestamp-based timing
     */
    // solhint-disable-next-line func-name-mixedcase
    function CLOCK_MODE() public pure override returns (string memory) {
        return "mode=timestamp";
    }

    // ═══════════════════════════════════════════════════════════════════════════════════
    //                               INTERNAL OVERRIDES
    // ═══════════════════════════════════════════════════════════════════════════════════

    /**
     * @dev Internal update function with auto-delegation feature
     * 
     * When an address receives tokens for the first time, this function
     * automatically delegates their voting power to themselves. This ensures:
     * 
     * 1. Users have immediate voting power without manual delegation
     * 2. The DAO creator can vote immediately after receiving their allocation
     * 3. Users don't lose voting ability due to forgetting to delegate
     * 
     * @param from Source address (address(0) for mints)
     * @param to Destination address (address(0) for burns)
     * @param value Amount of tokens being transferred
     */
    function _update(
        address from,
        address to,
        uint256 value
    ) internal override(ERC20Upgradeable, ERC20VotesUpgradeable) {
        // Call parent implementation (handles balance updates and voting checkpoints)
        super._update(from, to, value);

        // Auto-delegate to self on first receive
        // Conditions:
        // - `to` is not zero address (not a burn)
        // - `to` has never received tokens before
        if (to != address(0) && !_hasReceivedTokens[to]) {
            _hasReceivedTokens[to] = true;
            _delegate(to, to);
        }
    }

    /**
     * @dev Override for ERC20Permit nonces
     * @param owner The address to query nonces for
     * @return Current nonce for the owner
     */
    function nonces(
        address owner
    ) public view override(ERC20PermitUpgradeable, NoncesUpgradeable) returns (uint256) {
        return super.nonces(owner);
    }
}
