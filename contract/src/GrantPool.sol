// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OpenZeppelin access control, reentrancy protection, pause and ERC20 utilities
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// SBT interface — Omoboi must match this exact signature
interface IScholarChainSBT {
    function mint(address to, address poolAddr, string calldata poolName, uint256 amount, address payoutAddr) external;
}

// Custom errors — cheaper than require strings (~50 gas saved per revert)
error Unauthorized();
error InvalidState(string expected, string current);
error AlreadySubmitted();
error AlreadyVoted();
error AlreadyWon();
error AlreadyClaimed();
error InvalidAddress();
error InvalidAmount();
error NotAWinner();
error NotADonor();
error PoolNotCancelled();
error SignerListLocked();
error DistributionAlreadyEntered();
