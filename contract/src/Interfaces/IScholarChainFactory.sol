// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IScholarChainFactory {

    struct CreatePoolParams {
        string poolName;
        bytes32 criteriaMetadataCID;
        uint256 submissionStart;
        uint256 submissionEnd;
        uint256 reviewDuration;
        address[] initialSigners;
        address usdtTokenAddress;
    }

    // Events 
    event PoolCreated(address indexed poolAddress, address indexed creator, string poolName);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event SBTContractUpdated(address indexed newSBT);

    // Functions 
    function createPool(CreatePoolParams calldata p) external returns (address poolAddress);
    function setTreasury(address _newTreasury) external;
    function setSBTContract(address _newSBT) external;
    function pause() external;
    function unpause() external;
    function getAllPools() external view returns (address[] memory);
    function getPoolsByCreator(address creator) external view returns (address[] memory);

    // State getters 
    function treasury() external view returns (address);
    function sbtContract() external view returns (address);
    function TREASURY_FEE_BPS() external view returns (uint256);
}
