// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FieldDefinition} from "../Types/GrantPoolTypes.sol";

interface IGrantPool {
    function donate(uint256 amount) external;
    function topUpPool(uint256 amount) external;
    function editCriteria(bytes32 newCID) external;
    function addSigner(address signer) external;
    function cancelPool() external;
    function submitProposal(bytes32 docCID, address payoutAddr) external;
    function vote(address benefactor, bool approve) external;
    function enterDistributionPhase() external;
    function claimGrant() external;
    function claimRefund() external;
    function currentState() external view returns (string memory);
    function getSigners() external view returns (address[] memory);
    function getWinners() external view returns (address[] memory);
    function quorumThreshold() external view returns (uint256);
    function getApprovalCount(address benefactor) external view returns (uint256);
    function hasVoted(address signer, address benefactor) external view returns (bool);
    function totalDeposited() external view returns (uint256);
    function distributionAmount() external view returns (uint256);
    function isWinner(address) external view returns (bool);
    function hasClaimed(address) external view returns (bool);
    function isCancelled() external view returns (bool);
    function isSigner(address) external view returns (bool);
    function treasury() external view returns (address);
    function creator() external view returns (address);
    function getFieldDefinitions() external view returns (FieldDefinition[] memory);
}
