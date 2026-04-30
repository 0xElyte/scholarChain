// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import {GrantPool} from "./GrantPool.sol";

// Custom errors
error Factory__ZeroAddress();
error Factory__NotAContract();
error Factory__EmptyPoolName();
error Factory__ZeroCID();
error Factory__SubmissionStartInPast();
error Factory__SubmissionWindowTooShort();
error Factory__ReviewDurationTooShort();
error Factory__TooFewSigners();
error Factory__TooManySigners();
error Factory__DuplicateOrZeroSigner();
error Factory__InvalidFeeBps();

contract ScholarChainFactory is AccessControl, Pausable {

    // MINTER_ROLE on ScholarChainSBT — granted to each deployed pool
    bytes32 private constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // O(n²) uniqueness loop is cheaper than storage mappings for small n;
    // cap prevents unbounded gas / DoS on createPool
    uint256 private constant MAX_SIGNERS = 20;

    // ─── State 
    address public sbtContract;
    address public treasury;

    // Immutable: set once in constructor, passed to every GrantPool at deploy time
    // Per architecture spec: value must be 1000 (10% in basis points)
    uint256 public immutable TREASURY_FEE_BPS;

    address[] private _allPools;
    mapping(address => address[]) private _poolsByCreator;

    // ─── Events 
    event PoolCreated(address indexed poolAddress, address indexed creator, string poolName);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event SBTContractUpdated(address indexed newSBT);

    // ─── Params struct 
    struct CreatePoolParams {
        string poolName;
        bytes32 criteriaMetadataCID;
        uint256 submissionStart;
        uint256 submissionEnd;
        uint256 reviewDuration;
        address[] initialSigners;
        address usdtTokenAddress;
    }

    // ─── Constructor
    // _treasuryFeeBps must be 1000 (10%) per protocol spec
    constructor(address _treasury, address _sbtContract, uint256 _treasuryFeeBps) {
        if (_treasury == address(0)) revert Factory__ZeroAddress();
        if (_sbtContract == address(0) || _sbtContract.code.length == 0) revert Factory__NotAContract();
        if (_treasuryFeeBps == 0 || _treasuryFeeBps > 10_000) revert Factory__InvalidFeeBps();

        treasury = _treasury;
        sbtContract = _sbtContract;
        TREASURY_FEE_BPS = _treasuryFeeBps;

        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ─── Pool creation 

    /// @notice Deploys a new GrantPool. Factory must hold DEFAULT_ADMIN_ROLE on
    ///         ScholarChainSBT so it can grant MINTER_ROLE to the new pool.
    function createPool(CreatePoolParams calldata p)
        external
        whenNotPaused
        returns (address poolAddress)
    {
        _validateParams(p);

        GrantPool pool = new GrantPool(
            p.poolName,
            p.criteriaMetadataCID,
            p.submissionStart,
            p.submissionEnd,
            p.reviewDuration,
            p.initialSigners,
            p.usdtTokenAddress,
            treasury,
            TREASURY_FEE_BPS,
            sbtContract,
            msg.sender
        );

        poolAddress = address(pool);

        // Allow the pool to mint SBTs for its winners
        IAccessControl(sbtContract).grantRole(MINTER_ROLE, poolAddress);

        _allPools.push(poolAddress);
        _poolsByCreator[msg.sender].push(poolAddress);

        emit PoolCreated(poolAddress, msg.sender, p.poolName);
    }

    //  Admin 
    function setTreasury(address _newTreasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_newTreasury == address(0)) revert Factory__ZeroAddress();
        emit TreasuryUpdated(treasury, _newTreasury);
        treasury = _newTreasury;
    }

    function setSBTContract(address _newSBT) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (_newSBT == address(0) || _newSBT.code.length == 0) revert Factory__NotAContract();
        sbtContract = _newSBT;
        emit SBTContractUpdated(_newSBT);
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // Views 
    function getAllPools() external view returns (address[] memory) {
        return _allPools;
    }

    function getPoolsByCreator(address creator) external view returns (address[] memory) {
        return _poolsByCreator[creator];
    }

    // Internal 
    function _validateParams(CreatePoolParams calldata p) internal view {
        if (bytes(p.poolName).length == 0) revert Factory__EmptyPoolName();
        if (p.criteriaMetadataCID == bytes32(0)) revert Factory__ZeroCID();
        if (p.submissionStart <= block.timestamp) revert Factory__SubmissionStartInPast();
        if (p.submissionEnd <= p.submissionStart + 1 days) revert Factory__SubmissionWindowTooShort();
        if (p.reviewDuration < 1 days) revert Factory__ReviewDurationTooShort();
        if (p.initialSigners.length < 3) revert Factory__TooFewSigners();
        if (p.initialSigners.length > MAX_SIGNERS) revert Factory__TooManySigners();
        if (p.usdtTokenAddress == address(0)) revert Factory__ZeroAddress();

        for (uint256 i = 0; i < p.initialSigners.length; i++) {
            if (p.initialSigners[i] == address(0)) revert Factory__DuplicateOrZeroSigner();
            for (uint256 j = i + 1; j < p.initialSigners.length; j++) {
                if (p.initialSigners[i] == p.initialSigners[j]) revert Factory__DuplicateOrZeroSigner();
            }
        }
    }
}
