// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/governance/TimelockController.sol";

/**
 * @title TimelockHelper
 * @notice Helper contract to ensure TimelockController is compiled into artifacts for testing
 * @dev This contract is not deployed, it only exists to generate the TimelockController artifact
 */
contract TimelockHelper is TimelockController {
    constructor() TimelockController(0, new address[](0), new address[](0), msg.sender) {}
}
