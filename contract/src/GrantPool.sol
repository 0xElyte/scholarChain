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
    string  public poolName;
    address public immutable creator;
    IERC20  public immutable usdt;
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
    bool    public distributionEntered;
    uint256 public distributionAmount;  // per-winner share, set once
    bool    private _zeroDonorRefundDone; // lets zero-winner pools reach CLOSED

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
        bytes32 documentCID;   // IPFS CID stored as bytes32
        address payoutAddress; // address that receives grant funds
        uint256 submittedAt;
        bool    exists;        // double-submission guard
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
    enum PoolState { PENDING, ACTIVE, REVIEW, DISTRIBUTING, CLOSED, CANCELLED }

    // State is derived from block.timestamp — no mutable state variable
    function _state() internal view returns (PoolState) {
        if (isCancelled)                        return PoolState.CANCELLED;
        if (block.timestamp < submissionStart)  return PoolState.PENDING;
        if (block.timestamp < submissionEnd)    return PoolState.ACTIVE;
        if (block.timestamp < reviewEnd)        return PoolState.REVIEW;
        if (_zeroDonorRefundDone)               return PoolState.CLOSED;
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
        if (s == PoolState.PENDING)      return "PENDING";
        if (s == PoolState.ACTIVE)       return "ACTIVE";
        if (s == PoolState.REVIEW)       return "REVIEW";
        if (s == PoolState.DISTRIBUTING) return "DISTRIBUTING";
        if (s == PoolState.CLOSED)       return "CLOSED";
        return "CANCELLED";
    
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
        if (current != required)
            revert InvalidState(_stateLabel(required), _stateLabel(current));
        _;
    }

    // Deployed by ScholarChainFactory (Raphael) — receives treasuryFeeBps from factory constant
    constructor(
        string   memory _poolName,
        bytes32         _criteriaMetadataCID,
        uint256         _submissionStart,
        uint256         _submissionEnd,
        uint256         _reviewDuration,
        address[] memory _initialSigners,
        address         _usdtTokenAddress,
        address         _treasury,
        uint256         _treasuryFeeBps,
        address         _sbtContract,
        address         _creator
    ) {
        require(bytes(_poolName).length > 0,                "Pool name required");
        require(_criteriaMetadataCID != bytes32(0),         "CID required");
        require(_submissionStart > block.timestamp,         "Start must be future");
        require(_submissionEnd > _submissionStart + 1 days, "Min 1-day submission window");
        require(_reviewDuration >= 1 days,                  "Min 1-day review");
        require(_initialSigners.length >= 3,                "Min 3 signers");
        require(_usdtTokenAddress != address(0),            "Invalid USDT address");
        require(_treasury != address(0),                    "Invalid treasury");
        require(_sbtContract != address(0),                 "Invalid SBT contract");
        require(_creator != address(0),                     "Invalid creator");
        require(_treasuryFeeBps <= 10_000,                  "Fee > 100%");

        poolName            = _poolName;
        criteriaMetadataCID = _criteriaMetadataCID;
        submissionStart     = _submissionStart;
        submissionEnd       = _submissionEnd;
        reviewEnd           = _submissionEnd + _reviewDuration;
        signerLockedAt      = _submissionStart;
        creator             = _creator;
        treasury            = _treasury;
        TREASURY_FEE_BPS    = _treasuryFeeBps;
        usdt                = IERC20(_usdtTokenAddress);
        sbtContract         = IScholarChainSBT(_sbtContract);

        // Factory gets DEFAULT_ADMIN_ROLE to enable pause/unpause
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        for (uint256 i = 0; i < _initialSigners.length; i++) {
            _addSignerInternal(_initialSigners[i]);
        }
    }

    // Emergency pause — DEFAULT_ADMIN_ROLE only
    function pause()   external onlyRole(DEFAULT_ADMIN_ROLE) { _pause(); }
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) { _unpause(); }