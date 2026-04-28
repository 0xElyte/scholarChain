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

    // --- Cancellation flag (only mutable state boolean) ---
    bool public isCancelled;

    // --- Distribution ---
    bool public distributionEntered;
    uint256 public distributionAmount; // per-winner share, set once
    bool private _zeroDonorRefundDone; // lets zero-winner pools reach CLOSED

    // --- Donation accounting ---
    uint256 public totalDeposited;
    mapping(address => uint256) public donations;
    address[] public donors;
    mapping(address => bool) private _isDonor;

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
        if (winners.length > 0) {
            bool allClaimed = true;
            for (uint256 i = 0; i < winners.length; i++) {
                if (!hasClaimed[winners[i]]) { allClaimed = false; break; }
            }
            if (allClaimed) return PoolState.CLOSED;
        }
        return PoolState.DISTRIBUTING;
    }

    function currentState() external view returns (string memory) {
        return _stateLabel(_state());
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

    // Deployed by ScholarChainFactory (Raphael) — receives treasuryFeeBps from factory constant
    constructor(
        string memory _poolName,
        bytes32 _criteriaMetadataCID,
        uint256 _submissionStart,
        uint256 _submissionEnd,
        uint256 _reviewDuration,
        address[] memory _initialSigners,
        address _usdtTokenAddress,
        address _treasury,
        uint256 _treasuryFeeBps,
        address _sbtContract,
        address _creator
    ) {
        require(bytes(_poolName).length > 0, "Pool name required");
        require(_criteriaMetadataCID != bytes32(0), "CID required");
        require(_submissionStart > block.timestamp, "Start must be future");
        require(_submissionEnd > _submissionStart + 1 days, "Min 1-day submission window");
        require(_reviewDuration >= 1 days, "Min 1-day review");
        require(_initialSigners.length >= 3, "Min 3 signers");
        require(_usdtTokenAddress != address(0), "Invalid USDT address");
        require(_treasury != address(0), "Invalid treasury");
        require(_sbtContract != address(0), "Invalid SBT contract");
        require(_creator != address(0), "Invalid creator");
        require(_treasuryFeeBps <= 10_000, "Fee > 100%");

        poolName = _poolName;
        criteriaMetadataCID = _criteriaMetadataCID;
        submissionStart = _submissionStart;
        submissionEnd = _submissionEnd;
        reviewEnd = _submissionEnd + _reviewDuration;
        signerLockedAt = _submissionStart;
        creator = _creator;
        treasury = _treasury;
        TREASURY_FEE_BPS = _treasuryFeeBps;
        usdt = IERC20(_usdtTokenAddress);
        sbtContract = IScholarChainSBT(_sbtContract);

        // Factory gets DEFAULT_ADMIN_ROLE to enable pause/unpause
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        for (uint256 i = 0; i < _initialSigners.length; i++) {
            _addSignerInternal(_initialSigners[i]);
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
        if (!_isDonor[donor]) {
            _isDonor[donor] = true;
            donors.push(donor);
        }
        donations[donor] += amount;
        totalDeposited += amount;
    }

    // Update criteria CID before submission opens
    function editCriteria(bytes32 newCID) external onlyCreator inState(PoolState.PENDING) {
        if (newCID == bytes32(0)) revert InvalidAmount();
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
        if (docCID == bytes32(0)) revert InvalidAmount();
        if (payoutAddr == address(0)) revert InvalidAddress();
        proposals[msg.sender] =
            Proposal({documentCID: docCID, payoutAddress: payoutAddr, submittedAt: block.timestamp, exists: true});
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
            _refundDonorsProportional(remaining, total);
            _zeroDonorRefundDone = true;
            distributionAmount = 0;
            emit DistributionPhaseEntered(0, 0);
        } else {
            // floor division — dust swept to treasury on pool close
            distributionAmount = remaining / winners.length;
            emit DistributionPhaseEntered(winners.length, distributionAmount);
        }
    }

    function _refundDonorsProportional(uint256 refundPool, uint256 totalDep) internal {
        uint256 len = donors.length;
        for (uint256 i = 0; i < len; i++) {
            address donor = donors[i];
            uint256 share = donations[donor];
            if (share == 0) continue;
            uint256 refundAmt = (share * refundPool) / totalDep;
            donations[donor] = 0; // CEI — zero before transfer
            if (refundAmt > 0) {
                usdt.safeTransfer(donor, refundAmt);
                emit RefundClaimed(donor, refundAmt);
            }
        }
    }

    // Pull payment — winner receives funds at their declared payoutAddress
    // SBT minted AFTER transfer to prevent ERC-721 callback reentrancy
    function claimGrant() external nonReentrant whenNotPaused inState(PoolState.DISTRIBUTING) {
        if (!isWinner[msg.sender]) revert NotAWinner();
        if (hasClaimed[msg.sender]) revert AlreadyClaimed();

        hasClaimed[msg.sender] = true; // CEI — mark before external calls

        address payoutAddr = proposals[msg.sender].payoutAddress;
        uint256 amount = distributionAmount;

        usdt.safeTransfer(payoutAddr, amount);
        emit GrantClaimed(msg.sender, payoutAddr, amount);

        sbtContract.mint(payoutAddr, address(this), poolName, amount, payoutAddr);

        // sweep dust to treasury and close pool when all winners claimed
        bool allDone = true;
        for (uint256 i = 0; i < winners.length; i++) {
            if (!hasClaimed[winners[i]]) { allDone = false; break; }
        }
        if (allDone) {
            uint256 dust = usdt.balanceOf(address(this));
            if (dust > 0) usdt.safeTransfer(treasury, dust);
            emit PoolClosed();
        }
    }

    // Pull refund for cancelled pools — only path for donors, no push loop
    function claimRefund() external nonReentrant whenNotPaused {
        if (!isCancelled) revert PoolNotCancelled();
        if (donations[msg.sender] == 0) revert NotADonor();
        uint256 amount = donations[msg.sender];
        donations[msg.sender] = 0; // CEI
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

    function getDonors() external view returns (address[] memory) {
        return donors;
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
}
