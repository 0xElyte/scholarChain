// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// OpenZeppelin access control, reentrancy protection, pause and ERC20 utilities
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {FieldDefinition, PoolSummary, PoolStateEnum} from "./Types/GrantPoolTypes.sol";

// SBT interface — Omoboi must match this exact signature
interface IScholarChainSBT {
    function mint(address to, address poolAddr, string calldata poolName, uint256 amount, address payoutAddr) external;
}

// Custom errors — cheaper than require strings (~50 gas saved per revert)
error EmptyPoolName();
error InvalidDuration();
error InvalidStartTime();
error TooFewSigners();
error InvalidFeeBps();

error InvalidCID();
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
error EmptyFieldDefinitions();
error TooManyFields();
error RecoveryTooEarly();
error NothingToRecover();

// Passed as a single memory pointer to avoid >16-slot stack depth in the caller
struct GrantPoolParams {
    string poolName;
    bytes32 criteriaMetadataCID;
    uint256 submissionStart;
    uint256 submissionEnd;
    uint256 reviewDuration;
    address[] initialSigners;
    address usdtTokenAddress;
    address treasury;
    uint256 treasuryFeeBps;
    address sbtContract;
    address creator;
    FieldDefinition[] fieldDefinitions;
}

contract GrantPool is AccessControl, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // --- Roles ---
    bytes32 public constant SIGNER_ROLE = keccak256("SIGNER_ROLE");

    // --- Pool identity ---
    string public poolName;
    address public immutable creator;
    IERC20 public immutable usdt;
    IScholarChainSBT public immutable sbtContract;

    // --- Treasury (Femi's multisig) and fee from factory ---
    address public immutable treasury;
    uint256 public immutable TREASURY_FEE_BPS;

    // --- Timing ---
    uint256 public immutable submissionStart;
    uint256 public immutable submissionEnd;
    uint256 public immutable reviewEnd;
    uint256 public immutable signerLockedAt; // signer list locks at submissionStart

    // --- Pool metadata ---
    bytes32 public criteriaMetadataCID;

    // --- Submission form schema (set once at construction, never mutated) ---
    uint256 private constant MAX_FIELDS = 10;
    FieldDefinition[] private _fieldDefinitions;

    // --- Cancellation flag (only mutable state boolean) ---
    bool public isCancelled;

    // --- Distribution ---
    bool public distributionEntered;
    uint256 public distributionAmount; // per-winner share, set once
    bool private _zeroDonorRefundDone; // lets zero-winner pools reach CLOSED

    // Admin can recover unclaimed winner funds 90 days after reviewEnd
    uint256 public constant UNCLAIMED_RECOVERY_DELAY = 90 days;

    uint256 private _claimedCount;
    uint256 private _proposalCount;
    bool public zeroWinnerDistributed;

    // --- Donation accounting ---
    uint256 public totalDeposited;
    mapping(address => uint256) public donations;
    // address[] public donors;
    // mapping(address => bool) private _isDonor;

    // --- Signers ---
    address[] public signers;
    mapping(address => bool) public isSigner;

    // --- Proposals ---
    struct Proposal {
        bytes32 documentCID; // IPFS CID stored as bytes32
        address payoutAddress; // address that receives grant funds
        uint256 submittedAt;
        bool exists; // double-submission guard
    }
    mapping(address => Proposal) public proposals;

    // --- Voting ---
    mapping(address => mapping(address => bool)) public votes; // signer => benefactor => voted
    mapping(address => uint256) public approvalCount;

    // --- Winners ---
    address[] public winners;
    mapping(address => bool) public isWinner;
    mapping(address => bool) public hasClaimed;

    // --- Events ---
    event DonationReceived(address indexed donor, uint256 amount);
    event CriteriaUpdated(bytes32 indexed newCID);
    event SignerAdded(address indexed signer);
    event PoolCancelled();
    event ProposalSubmitted(address indexed benefactor, bytes32 indexed documentCID);
    event VoteCast(address indexed signer, address indexed benefactor, bool approved);
    event BenefactorApproved(address indexed benefactor);
    event DistributionPhaseEntered(uint256 totalWinners, uint256 perWinnerAmount);
    event ProtocolFeeTransferred(address indexed treasury, uint256 amount);
    event GrantClaimed(address indexed winner, address indexed payoutAddress, uint256 amount);
    event RefundClaimed(address indexed donor, uint256 amount);
    event PoolClosed();

    // --- Pool lifecycle states (derived from timestamp, never stored) ---
    enum PoolState {
        PENDING,
        ACTIVE,
        REVIEW,
        DISTRIBUTING,
        CLOSED,
        CANCELLED
    }

    // State is derived from block.timestamp — no mutable state variable
    function _state() internal view returns (PoolState) {
        if (isCancelled) return PoolState.CANCELLED;
        if (block.timestamp < submissionStart) return PoolState.PENDING;
        if (block.timestamp < submissionEnd) return PoolState.ACTIVE;
        if (block.timestamp < reviewEnd) return PoolState.REVIEW;
        if (_zeroDonorRefundDone) return PoolState.CLOSED;
        if (winners.length > 0 && _claimedCount == winners.length) {
            return PoolState.CLOSED;
        }
        return PoolState.DISTRIBUTING;
    }

    function currentState() external view returns (PoolStateEnum) {
        return _toStateEnum(_state());
    }

    /// @dev Casts the internal PoolState to the shared PoolStateEnum.
    ///      Both enums share the same integer values — order must stay in sync.
    function _toStateEnum(PoolState s) internal pure returns (PoolStateEnum) {
        return PoolStateEnum(uint8(s));
    }

    function _stateLabel(PoolState s) internal pure returns (string memory) {
        if (s == PoolState.PENDING) return "PENDING";
        if (s == PoolState.ACTIVE) return "ACTIVE";
        if (s == PoolState.REVIEW) return "REVIEW";
        if (s == PoolState.DISTRIBUTING) return "DISTRIBUTING";
        if (s == PoolState.CLOSED) return "CLOSED";
        return "CANCELLED";
    }

    // --- Access control modifiers ---
    modifier onlyCreator() {
        if (msg.sender != creator) revert Unauthorized();
        _;
    }

    modifier onlySignerRole() {
        if (!isSigner[msg.sender]) revert Unauthorized();
        _;
    }

    modifier inState(PoolState required) {
        PoolState current = _state();
        if (current != required) {
            revert InvalidState(_stateLabel(required), _stateLabel(current));
        }
        _;
    }

    // Deployed by ScholarChainFactory — all params passed as a single struct to stay within stack limits
    constructor(GrantPoolParams memory p) {
        if (bytes(p.poolName).length == 0) revert EmptyPoolName();
        if (p.criteriaMetadataCID == bytes32(0)) revert InvalidCID();
        if (p.submissionStart <= block.timestamp) revert InvalidStartTime();
        if (p.submissionEnd <= p.submissionStart + 1 days) revert InvalidDuration();
        if (p.reviewDuration < 1 days) revert InvalidDuration();
        if (p.initialSigners.length < 3) revert TooFewSigners();
        if (p.usdtTokenAddress == address(0)) revert InvalidAddress();
        if (p.treasury == address(0)) revert InvalidAddress();
        if (p.sbtContract == address(0)) revert InvalidAddress();
        if (p.creator == address(0)) revert InvalidAddress();
        if (p.treasuryFeeBps > 10_000) revert InvalidFeeBps();
        if (p.fieldDefinitions.length == 0) revert EmptyFieldDefinitions();
        if (p.fieldDefinitions.length > MAX_FIELDS) revert TooManyFields();

        poolName = p.poolName;
        criteriaMetadataCID = p.criteriaMetadataCID;
        submissionStart = p.submissionStart;
        submissionEnd = p.submissionEnd;
        reviewEnd = p.submissionEnd + p.reviewDuration;
        signerLockedAt = p.submissionStart;
        creator = p.creator;
        treasury = p.treasury;
        TREASURY_FEE_BPS = p.treasuryFeeBps;
        usdt = IERC20(p.usdtTokenAddress);
        sbtContract = IScholarChainSBT(p.sbtContract);

        // Factory gets DEFAULT_ADMIN_ROLE to enable pause/unpause
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        // Creator also gets admin role to pause/unpause their own pool
        _grantRole(DEFAULT_ADMIN_ROLE, p.creator);

        for (uint256 i = 0; i < p.initialSigners.length; i++) {
            _addSignerInternal(p.initialSigners[i]);
        }

        for (uint256 i = 0; i < p.fieldDefinitions.length; i++) {
            _fieldDefinitions.push(p.fieldDefinitions[i]);
        }
    }

    // Emergency pause — DEFAULT_ADMIN_ROLE only
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    // Accepted in PENDING or ACTIVE — open to any donor
    function donate(uint256 amount) external nonReentrant whenNotPaused {
        PoolState s = _state();
        if (s != PoolState.PENDING && s != PoolState.ACTIVE) {
            revert InvalidState("PENDING or ACTIVE", _stateLabel(s));
        }
        if (amount == 0) revert InvalidAmount();
        _recordDonation(msg.sender, amount);
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        emit DonationReceived(msg.sender, amount);
    }

    // Creator top-up — identical accounting to donate()
    function topUpPool(uint256 amount) external nonReentrant whenNotPaused onlyCreator {
        PoolState s = _state();
        if (s != PoolState.PENDING && s != PoolState.ACTIVE) {
            revert InvalidState("PENDING or ACTIVE", _stateLabel(s));
        }
        if (amount == 0) revert InvalidAmount();
        _recordDonation(msg.sender, amount);
        usdt.safeTransferFrom(msg.sender, address(this), amount);
        emit DonationReceived(msg.sender, amount);
    }

    function _recordDonation(address donor, uint256 amount) internal {
        donations[donor] += amount;
        totalDeposited += amount;
    }

    // Update criteria CID before submission opens
    function editCriteria(bytes32 newCID) external onlyCreator inState(PoolState.PENDING) {
        if (newCID == bytes32(0)) revert InvalidCID();
        criteriaMetadataCID = newCID;
        emit CriteriaUpdated(newCID);
    }

    // Signer list locks permanently at submissionStart
    function addSigner(address signer) external onlyCreator {
        if (block.timestamp >= signerLockedAt) revert SignerListLocked();
        if (signer == address(0)) revert InvalidAddress();
        _addSignerInternal(signer);
    }

    function _addSignerInternal(address signer) internal {
        if (signer == address(0)) revert InvalidAddress();
        if (isSigner[signer]) return; // idempotent
        isSigner[signer] = true;
        signers.push(signer);
        _grantRole(SIGNER_ROLE, signer);
        emit SignerAdded(signer);
    }

    // Cancel only allowed before submission opens — protects benefactors
    function cancelPool() external onlyCreator nonReentrant inState(PoolState.PENDING) {
        isCancelled = true;
        emit PoolCancelled();
    }

    // One proposal per benefactor, ACTIVE state only
    function submitProposal(bytes32 docCID, address payoutAddr) external whenNotPaused inState(PoolState.ACTIVE) {
        if (proposals[msg.sender].exists) revert AlreadySubmitted();
        if (docCID == bytes32(0)) revert InvalidCID();
        if (payoutAddr == address(0)) revert InvalidAddress();
        proposals[msg.sender] =
            Proposal({documentCID: docCID, payoutAddress: payoutAddr, submittedAt: block.timestamp, exists: true});
        _proposalCount++;
        emit ProposalSubmitted(msg.sender, docCID);
    }

    // One vote per signer per benefactor — quorum = ceil(signers.length * 70 / 100)
    function vote(address benefactor, bool approve) external whenNotPaused onlySignerRole inState(PoolState.ACTIVE) {
        if (!proposals[benefactor].exists) revert InvalidAddress();
        if (votes[msg.sender][benefactor]) revert AlreadyVoted();
        if (isWinner[benefactor]) revert AlreadyWon();

        votes[msg.sender][benefactor] = true;

        if (approve) {
            approvalCount[benefactor]++;
            // ceiling division to avoid floating point
            uint256 quorum = (signers.length * 70 + 99) / 100;
            if (approvalCount[benefactor] >= quorum) {
                isWinner[benefactor] = true;
                winners.push(benefactor);
                emit BenefactorApproved(benefactor);
            }
        }
        emit VoteCast(msg.sender, benefactor, approve);
    }

    // Callable by anyone after reviewEnd — sends 10% fee to treasury, sets per-winner share
    function enterDistributionPhase() external nonReentrant whenNotPaused {
        if (_state() != PoolState.DISTRIBUTING) {
            revert InvalidState("DISTRIBUTING", _stateLabel(_state()));
        }
        if (distributionEntered) revert DistributionAlreadyEntered();

        distributionEntered = true;

        uint256 total = totalDeposited;
        uint256 fee = (total * TREASURY_FEE_BPS) / 10_000;
        uint256 remaining = total - fee;

        usdt.safeTransfer(treasury, fee);
        emit ProtocolFeeTransferred(treasury, fee);

        if (winners.length == 0) {
            // zero-winner path — refund 90% proportionally to donors
            zeroWinnerDistributed = true;
            _zeroDonorRefundDone = true;
            distributionAmount = 0;
            emit DistributionPhaseEntered(0, 0);
        } else {
            // floor division — dust swept to treasury on pool close
            distributionAmount = remaining / winners.length;
            emit DistributionPhaseEntered(winners.length, distributionAmount);
        }
    }

    // Pull payment — winner receives funds at their declared payoutAddress
    // SBT minted AFTER transfer to prevent ERC-721 callback reentrancy
    function claimGrant() external nonReentrant whenNotPaused inState(PoolState.DISTRIBUTING) {
        if (!isWinner[msg.sender]) revert NotAWinner();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();

        hasClaimed[msg.sender] = true; // CEI — mark before external calls
        _claimedCount++;

        address payoutAddr = proposals[msg.sender].payoutAddress;
        uint256 amount = distributionAmount;

        usdt.safeTransfer(payoutAddr, amount);
        emit GrantClaimed(msg.sender, payoutAddr, amount);

        sbtContract.mint(payoutAddr, address(this), poolName, amount, payoutAddr);

        // sweep dust to treasury and close pool when all winners claimed
        if (_claimedCount == winners.length) {
            uint256 dust = usdt.balanceOf(address(this));
            if (dust > 0) usdt.safeTransfer(treasury, dust);
            emit PoolClosed();
        }
    }

    // Pull refund for cancelled pools — only path for donors, no push loop
    function claimRefund() external nonReentrant whenNotPaused {
        uint256 amount;

        if (isCancelled) {
            if (donations[msg.sender] == 0) revert NotADonor();
            amount = donations[msg.sender];
            donations[msg.sender] = 0;
        } else if (zeroWinnerDistributed) {
            if (donations[msg.sender] == 0) revert NotADonor();

            uint256 total = totalDeposited;
            uint256 fee = (total * TREASURY_FEE_BPS) / 10_000;
            uint256 remaining = total - fee;

            amount = (donations[msg.sender] * remaining) / total;
            donations[msg.sender] = 0;
        } else {
            revert PoolNotCancelled();
        }

        usdt.safeTransfer(msg.sender, amount);
        emit RefundClaimed(msg.sender, amount);
    }

    // --- View helpers for frontend (Bamz) and integration contract (Dolapo) ---
    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    function getWinners() external view returns (address[] memory) {
        return winners;
    }

    function quorumThreshold() external view returns (uint256) {
        return (signers.length * 70 + 99) / 100;
    }

    function getProposal(address benefactor) external view returns (Proposal memory) {
        return proposals[benefactor];
    }

    function getApprovalCount(address benefactor) external view returns (uint256) {
        return approvalCount[benefactor];
    }

    function hasVoted(address signer, address benefactor) external view returns (bool) {
        return votes[signer][benefactor];
    }

    function getProposalCount() external view returns (uint256) {
        return _proposalCount;
    }

    function getClaimedCount() external view returns (uint256) {
        return _claimedCount;
    }

    // Returns the submission form schema — frontend uses this to render the dynamic form
    function getFieldDefinitions() external view returns (FieldDefinition[] memory) {
        return _fieldDefinitions;
    }

    // Single-call summary of this pool — use instead of individual public var reads.
    function getPoolSummary() external view returns (PoolSummary memory) {
        return PoolSummary({
            poolAddress: address(this),
            poolName: poolName,
            state: _toStateEnum(_state()),
            creator: creator,
            totalDeposited: totalDeposited,
            submissionStart: submissionStart,
            submissionEnd: submissionEnd,
            reviewEnd: reviewEnd,
            signerCount: signers.length,
            winnersCount: winners.length,
            claimedCount: _claimedCount,
            proposalCount: _proposalCount,
            distributionAmount: distributionAmount,
            distributionEntered: distributionEntered,
            isCancelled: isCancelled
        });
    }

    // Recover funds that winners never claimed, callable by admin after 90-day timeout.
    // Prevents permanent fund lockup when a winner's key is lost or they never claim.
    function recoverUnclaimedFunds() external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        if (block.timestamp <= reviewEnd + UNCLAIMED_RECOVERY_DELAY) revert RecoveryTooEarly();
        uint256 balance = usdt.balanceOf(address(this));
        if (balance == 0) revert NothingToRecover();
        usdt.safeTransfer(treasury, balance);
        emit PoolClosed();
    }
}
