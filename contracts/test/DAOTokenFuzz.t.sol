// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {DAOToken} from "../DAOToken.sol";
import {DAOFactory} from "../DAOFactory.sol";

/**
 * @title DAOToken Fuzz Tests
 * @notice Solidity fuzz tests for DAOToken edge cases
 * @dev Uses forge-std for assertions and fuzzing capabilities
 * 
 * Run with: npx hardhat test solidity
 */
contract DAOTokenFuzzTest is Test {
    DAOFactory factory;
    DAOToken token;
    address creator;
    address treasury;

    // Constants matching factory
    uint256 constant CREATOR_PERCENT = 1;
    uint256 constant MIN_SUPPLY = 100; // Minimum 100 wei to have meaningful 1%

    function setUp() public {
        creator = address(this);
        factory = new DAOFactory();

        // Create a DAO to get a properly initialized token
        DAOFactory.CreateDAOParams memory params = DAOFactory.CreateDAOParams({
            daoName: "Fuzz Test DAO",
            tokenName: "Fuzz Token",
            tokenSymbol: "FUZZ",
            totalSupply: 1_000_000 ether,
            votingDelay: 1,
            votingPeriod: 100
        });

        (address tokenAddr, address timelockAddr,) = factory.createDAO(params);
        token = DAOToken(tokenAddr);
        treasury = timelockAddr;
    }

    // ============ Transfer Fuzz Tests ============

    /**
     * @notice Fuzz test: Transfer should preserve total supply
     * @param transferAmount Amount to transfer (bounded to creator's balance)
     */
    function testFuzz_TransferPreservesTotalSupply(uint256 transferAmount) public {
        uint256 creatorBalance = token.balanceOf(creator);
        
        // Bound transfer amount to valid range
        transferAmount = bound(transferAmount, 0, creatorBalance);
        
        uint256 totalSupplyBefore = token.totalSupply();
        
        address recipient = address(0x1234);
        token.transfer(recipient, transferAmount);
        
        uint256 totalSupplyAfter = token.totalSupply();
        
        assertEq(totalSupplyAfter, totalSupplyBefore, "Total supply should remain constant after transfer");
    }

    /**
     * @notice Fuzz test: Transfer should correctly update balances
     * @param transferAmount Amount to transfer
     */
    function testFuzz_TransferUpdatesBalances(uint256 transferAmount) public {
        uint256 creatorBalance = token.balanceOf(creator);
        transferAmount = bound(transferAmount, 0, creatorBalance);
        
        address recipient = address(0x5678);
        uint256 recipientBalanceBefore = token.balanceOf(recipient);
        uint256 creatorBalanceBefore = token.balanceOf(creator);
        
        token.transfer(recipient, transferAmount);
        
        assertEq(
            token.balanceOf(creator),
            creatorBalanceBefore - transferAmount,
            "Sender balance should decrease"
        );
        assertEq(
            token.balanceOf(recipient),
            recipientBalanceBefore + transferAmount,
            "Recipient balance should increase"
        );
    }

    // ============ Voting Power Fuzz Tests ============

    /**
     * @notice Fuzz test: Auto-delegation should activate voting power on first receive
     * @param transferAmount Amount to transfer to new address
     */
    function testFuzz_AutoDelegationOnFirstReceive(uint256 transferAmount) public {
        uint256 creatorBalance = token.balanceOf(creator);
        transferAmount = bound(transferAmount, 1, creatorBalance); // At least 1 wei
        
        // Generate a unique recipient address for each fuzz run
        address recipient = address(uint160(uint256(keccak256(abi.encode(transferAmount)))));
        
        // Recipient should have 0 votes before receiving
        assertEq(token.getVotes(recipient), 0, "New address should have 0 votes");
        
        token.transfer(recipient, transferAmount);
        
        // After receiving, should have auto-delegated voting power
        assertEq(
            token.getVotes(recipient),
            transferAmount,
            "Recipient should have voting power equal to received amount"
        );
    }

    /**
     * @notice Fuzz test: Voting power should always equal balance when self-delegated
     * @param transferAmount Amount to transfer
     */
    function testFuzz_VotingPowerEqualsSelfDelegatedBalance(uint256 transferAmount) public {
        uint256 creatorBalance = token.balanceOf(creator);
        transferAmount = bound(transferAmount, 0, creatorBalance);
        
        address recipient = address(0xABCD);
        token.transfer(recipient, transferAmount);
        
        // After auto-delegation, voting power should equal balance
        uint256 balance = token.balanceOf(recipient);
        uint256 votes = token.getVotes(recipient);
        
        assertEq(votes, balance, "Voting power should equal balance when self-delegated");
    }

    // ============ Delegation Fuzz Tests ============

    /**
     * @notice Fuzz test: Delegation should transfer voting power correctly
     * @param delegateAmount Amount the delegator has
     */
    function testFuzz_DelegationTransfersVotingPower(uint256 delegateAmount) public {
        uint256 creatorBalance = token.balanceOf(creator);
        delegateAmount = bound(delegateAmount, 1, creatorBalance);
        
        address holder = address(0x1111);
        address delegate = address(0x2222);
        
        // Transfer tokens to holder (triggers auto-delegation to self)
        token.transfer(holder, delegateAmount);
        
        // Holder delegates to delegate
        vm.prank(holder);
        token.delegate(delegate);
        
        // Holder should have 0 votes
        assertEq(token.getVotes(holder), 0, "Delegator should have 0 votes after delegating");
        
        // Delegate should have holder's votes
        assertEq(
            token.getVotes(delegate),
            delegateAmount,
            "Delegate should have delegator's voting power"
        );
    }

    // ============ Edge Case Tests ============

    /**
     * @notice Fuzz test: Zero transfer should not revert and preserve state
     */
    function testFuzz_ZeroTransferPreservesState() public {
        address recipient = address(0x9999);
        
        uint256 creatorBalanceBefore = token.balanceOf(creator);
        uint256 recipientBalanceBefore = token.balanceOf(recipient);
        
        token.transfer(recipient, 0);
        
        assertEq(token.balanceOf(creator), creatorBalanceBefore, "Creator balance unchanged");
        assertEq(token.balanceOf(recipient), recipientBalanceBefore, "Recipient balance unchanged");
    }

    /**
     * @notice Fuzz test: Multiple transfers should maintain invariants
     * @param amount1 First transfer amount
     * @param amount2 Second transfer amount  
     */
    function testFuzz_MultipleTransfersMaintainInvariants(uint256 amount1, uint256 amount2) public {
        uint256 creatorBalance = token.balanceOf(creator);
        
        // Bound amounts so total doesn't exceed balance
        amount1 = bound(amount1, 0, creatorBalance / 2);
        amount2 = bound(amount2, 0, creatorBalance / 2);
        
        address recipient1 = address(0x1111);
        address recipient2 = address(0x2222);
        
        uint256 totalSupplyBefore = token.totalSupply();
        
        token.transfer(recipient1, amount1);
        token.transfer(recipient2, amount2);
        
        // Total supply should be unchanged
        assertEq(token.totalSupply(), totalSupplyBefore, "Total supply invariant");
        
        // Sum of balances should equal total supply
        uint256 sumBalances = token.balanceOf(creator) + 
                             token.balanceOf(recipient1) + 
                             token.balanceOf(recipient2) +
                             token.balanceOf(treasury);
        
        assertEq(sumBalances, totalSupplyBefore, "Sum of balances should equal total supply");
    }

    // ============ Supply Invariant Tests ============

    /**
     * @notice Fuzz test: Token supply should never exceed initial supply
     * @param randomSeed Random value to generate various scenarios
     */
    function testFuzz_SupplyNeverExceedsInitial(uint256 randomSeed) public {
        // Use randomSeed to determine transfer amounts
        uint256 creatorBalance = token.balanceOf(creator);
        uint256 transferAmount = bound(randomSeed, 0, creatorBalance);
        
        uint256 initialSupply = token.totalSupply();
        
        address recipient = address(uint160(randomSeed));
        if (recipient != address(0)) {
            token.transfer(recipient, transferAmount);
        }
        
        assertLe(
            token.totalSupply(),
            initialSupply,
            "Total supply should never exceed initial supply"
        );
    }
}
