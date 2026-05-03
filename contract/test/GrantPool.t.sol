// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {GrantPool, GrantPoolParams} from "../src/GrantPool.sol";
import {FieldDefinition, PoolStateEnum, PoolSummary} from "../src/Types/GrantPoolTypes.sol";
import {MockERC20, MockSBT, Fixtures} from "./Helpers.sol";

// File-scoped custom errors from GrantPool.sol
import {
    EmptyPoolName, InvalidCID, InvalidStartTime, InvalidDuration,
    TooFewSigners, EmptyFieldDefinitions,
    Unauthorized, InvalidAmount, InvalidAddress, InvalidState,
    AlreadySubmitted, AlreadyVoted, AlreadyWon, AlreadyClaimed,
    NotAWinner, NotADonor, PoolNotCancelled, SignerListLocked,
    DistributionAlreadyEntered, RecoveryTooEarly, NothingToRecover
} from "../src/GrantPool.sol";


// GrantPool Test Suite


contract GrantPoolTest is Test {

    // ── Contracts 
    GrantPool   public pool;
    MockERC20   public usdt;
    MockSBT     public sbt;

    // ── Actors 
    address public creator   = makeAddr("creator");
    address public treasury  = makeAddr("treasury");
    address public donor     = makeAddr("donor");
    address public donor2    = makeAddr("donor2");
    address public applicant = makeAddr("applicant");
    address public applicant2= makeAddr("applicant2");
    address public applicant3= makeAddr("applicant3");
    address public payout    = makeAddr("payout");

    address[] public signers;
    // quorum for 5 signers = ceil(5*70/100) = 4

    // ── Timing 
    uint256 constant T0               = 1_000_000;
    uint256 constant SUBMISSION_START = T0 + 1 days;
    uint256 constant SUBMISSION_END   = T0 + 8 days;
    uint256 constant REVIEW_DURATION  = 7 days;
    uint256 constant REVIEW_END       = SUBMISSION_END + REVIEW_DURATION;

    uint256 constant FEE_BPS = 1000; // 10%

    // ── Events (mirrors GrantPool) 
    event DonationReceived(address indexed donor, uint256 amount);
    event ProposalSubmitted(address indexed benefactor, bytes32 indexed documentCID);
    event VoteCast(address indexed signer, address indexed benefactor, bool approved);
    event BenefactorApproved(address indexed benefactor);
    event DistributionPhaseEntered(uint256 totalWinners, uint256 perWinnerAmount);
    event ProtocolFeeTransferred(address indexed treasury, uint256 amount);
    event GrantClaimed(address indexed winner, address indexed payoutAddress, uint256 amount);
    event RefundClaimed(address indexed donor, uint256 amount);
    event PoolCancelled();
    event PoolClosed();
    event CriteriaUpdated(bytes32 indexed newCID);
    event SignerAdded(address indexed signer);

    // ── Setup 
    function setUp() public {
        vm.warp(T0);

        usdt = new MockERC20();
        sbt  = new MockSBT();

        signers = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            signers[i] = makeAddr(string(abi.encodePacked("signer", vm.toString(i))));
        }

        pool = _deployPool();

        // Fund donor wallets and approve pool
        usdt.mint(donor,  200_000e6);
        usdt.mint(donor2, 100_000e6);
        vm.prank(donor);  usdt.approve(address(pool), type(uint256).max);
        vm.prank(donor2); usdt.approve(address(pool), type(uint256).max);
    }

    function _deployPool() internal returns (GrantPool) {
        return new GrantPool(GrantPoolParams({
            poolName:            "Web3 Dev Scholarship 2025",
            criteriaMetadataCID: bytes32("QmTestCID"),
            submissionStart:     SUBMISSION_START,
            submissionEnd:       SUBMISSION_END,
            reviewDuration:      REVIEW_DURATION,
            initialSigners:      signers,
            usdtTokenAddress:    address(usdt),
            treasury:            treasury,
            treasuryFeeBps:      FEE_BPS,
            sbtContract:         address(sbt),
            creator:             creator,
            fieldDefinitions:    Fixtures.twoFields()
        }));
    }

    // ── Helpers 
    function _inActive() internal { vm.warp(SUBMISSION_START + 1); }
    function _inReview() internal { vm.warp(SUBMISSION_END   + 1); }
    function _inDist()   internal { vm.warp(REVIEW_END       + 1); }

    function _donate(address who, uint256 amount) internal {
        vm.prank(who); pool.donate(amount);
    }

    function _submit(address who) internal {
        vm.prank(who);
        pool.submitProposal(bytes32(uint256(uint160(who))), who);
    }

    function _voteAll(address benefactor, bool approve, uint256 count) internal {
        for (uint256 i = 0; i < count; i++) {
            vm.prank(signers[i]);
            pool.vote(benefactor, approve);
        }
    }

    /// Full happy-path setup: donate → propose → vote to quorum → enter distribution
    function _reachDistribution(uint256 depositAmount, uint256 winnerCount)
        internal returns (address[] memory winners)
    {
        _inActive();
        _donate(donor, depositAmount);

        winners = new address[](winnerCount);
        for (uint256 i = 0; i < winnerCount; i++) {
            address w = makeAddr(string(abi.encodePacked("winner", vm.toString(i))));
            usdt.mint(w, 0); 
            vm.prank(w);
            pool.submitProposal(bytes32(uint256(i + 1)), w);
            _voteAll(w, true, 4); // 4/5 signers = quorum
            winners[i] = w;
        }

        _inDist();
        pool.enterDistributionPhase();
    }

    
    // CONSTRUCTOR
    

    function test_Constructor_StoresParams() public {
        assertEq(pool.poolName(), "Web3 Dev Scholarship 2025");
        assertEq(address(pool.usdt()), address(usdt));
        assertEq(address(pool.sbtContract()), address(sbt));
        assertEq(pool.treasury(), treasury);
        assertEq(pool.creator(), creator);
        assertEq(pool.TREASURY_FEE_BPS(), FEE_BPS);
        assertEq(pool.submissionStart(), SUBMISSION_START);
        assertEq(pool.submissionEnd(), SUBMISSION_END);
        assertEq(pool.reviewEnd(), REVIEW_END);
    }

    function test_Constructor_SignersRegistered() public {
        for (uint256 i = 0; i < signers.length; i++) {
            assertTrue(pool.isSigner(signers[i]));
        }
    }

    function test_Constructor_FieldDefinitions() public {
        FieldDefinition[] memory defs = pool.getFieldDefinitions();
        assertEq(defs.length, 2);
        assertEq(defs[0].label, "Project Description");
        assertEq(defs[1].label, "Upload CV");
    }

    function _baseParams() internal view returns (GrantPoolParams memory) {
        return GrantPoolParams({
            poolName:            "Name",
            criteriaMetadataCID: bytes32("CID"),
            submissionStart:     SUBMISSION_START,
            submissionEnd:       SUBMISSION_END,
            reviewDuration:      REVIEW_DURATION,
            initialSigners:      signers,
            usdtTokenAddress:    address(usdt),
            treasury:            treasury,
            treasuryFeeBps:      FEE_BPS,
            sbtContract:         address(sbt),
            creator:             creator,
            fieldDefinitions:    Fixtures.twoFields()
        });
    }

    function test_Constructor_RevertEmptyName() public {
        GrantPoolParams memory p = _baseParams();
        p.poolName = "";
        vm.expectRevert(EmptyPoolName.selector);
        new GrantPool(p);
    }

    function test_Constructor_RevertZeroCID() public {
        GrantPoolParams memory p = _baseParams();
        p.criteriaMetadataCID = bytes32(0);
        vm.expectRevert(InvalidCID.selector);
        new GrantPool(p);
    }

    function test_Constructor_RevertStartInPast() public {
        GrantPoolParams memory p = _baseParams();
        p.submissionStart = T0 - 1;
        vm.expectRevert(InvalidStartTime.selector);
        new GrantPool(p);
    }

    function test_Constructor_RevertWindowTooShort() public {
        GrantPoolParams memory p = _baseParams();
        p.submissionEnd = SUBMISSION_START + 12 hours;
        vm.expectRevert(InvalidDuration.selector);
        new GrantPool(p);
    }

    function test_Constructor_RevertTooFewSigners() public {
        GrantPoolParams memory p = _baseParams();
        address[] memory few = new address[](2);
        few[0] = makeAddr("s1"); few[1] = makeAddr("s2");
        p.initialSigners = few;
        vm.expectRevert(TooFewSigners.selector);
        new GrantPool(p);
    }

    function test_Constructor_RevertEmptyFields() public {
        GrantPoolParams memory p = _baseParams();
        p.fieldDefinitions = new FieldDefinition[](0);
        vm.expectRevert(EmptyFieldDefinitions.selector);
        new GrantPool(p);
    }

    
    // STATE MACHINE
    

    function test_State_InitiallyPending() public {
        assertEq(uint8(pool.currentState()), uint8(PoolStateEnum.PENDING));
    }

    function test_State_ActiveAfterStart() public {
        _inActive();
        assertEq(uint8(pool.currentState()), uint8(PoolStateEnum.ACTIVE));
    }

    function test_State_ReviewAfterSubmissionEnd() public {
        _inReview();
        assertEq(uint8(pool.currentState()), uint8(PoolStateEnum.REVIEW));
    }

    function test_State_DistributingAfterReviewEnd() public {
        _inDist();
        assertEq(uint8(pool.currentState()), uint8(PoolStateEnum.DISTRIBUTING));
    }

    function test_State_CancelledOverridesAll() public {
        vm.prank(creator);
        pool.cancelPool();
        assertEq(uint8(pool.currentState()), uint8(PoolStateEnum.CANCELLED));
        _inActive();
        assertEq(uint8(pool.currentState()), uint8(PoolStateEnum.CANCELLED));
    }

    
    // DONATE
    

    function test_Donate_InPending() public {
        vm.expectEmit(true, false, false, true);
        emit DonationReceived(donor, 50_000e6);
        _donate(donor, 50_000e6);

        assertEq(pool.totalDeposited(), 50_000e6);
        assertEq(pool.donations(donor), 50_000e6);
        assertEq(usdt.balanceOf(address(pool)), 50_000e6);
    }

    function test_Donate_InActive() public {
        _inActive();
        _donate(donor, 10_000e6);
        assertEq(pool.totalDeposited(), 10_000e6);
    }

    function test_Donate_AccumulatesMultipleDonors() public {
        _donate(donor, 60_000e6);
        _donate(donor2, 40_000e6);
        assertEq(pool.totalDeposited(), 100_000e6);
        assertEq(pool.donations(donor),  60_000e6);
        assertEq(pool.donations(donor2), 40_000e6);
    }

    function test_Donate_RevertZeroAmount() public {
        vm.prank(donor);
        vm.expectRevert(InvalidAmount.selector);
        pool.donate(0);
    }

    function test_Donate_RevertInReview() public {
        _inReview();
        vm.prank(donor);
        vm.expectRevert();
        pool.donate(1e6);
    }

    function test_Donate_RevertInCancelled() public {
        vm.prank(creator); pool.cancelPool();
        vm.prank(donor);
        vm.expectRevert();
        pool.donate(1e6);
    }

    function test_TopUpPool_OnlyCreator() public {
        usdt.mint(creator, 10_000e6);
        vm.prank(creator);
        usdt.approve(address(pool), type(uint256).max);
        vm.prank(creator);
        pool.topUpPool(10_000e6);
        assertEq(pool.totalDeposited(), 10_000e6);
    }

    function test_TopUpPool_RevertIfNotCreator() public {
        usdt.mint(donor, 1e6);
        vm.prank(donor); usdt.approve(address(pool), type(uint256).max);
        vm.prank(donor);
        vm.expectRevert(Unauthorized.selector);
        pool.topUpPool(1e6);
    }

    
    // CRITERIA & SIGNERS (PENDING-only mutations)
    

    function test_EditCriteria_InPending() public {
        bytes32 newCID = bytes32("QmNewCID");
        vm.expectEmit(true, false, false, false);
        emit CriteriaUpdated(newCID);
        vm.prank(creator);
        pool.editCriteria(newCID);
        assertEq(pool.criteriaMetadataCID(), newCID);
    }

    function test_EditCriteria_RevertIfNotCreator() public {
        vm.prank(donor);
        vm.expectRevert(Unauthorized.selector);
        pool.editCriteria(bytes32("other"));
    }

    function test_EditCriteria_RevertAfterStart() public {
        _inActive();
        vm.prank(creator);
        vm.expectRevert();
        pool.editCriteria(bytes32("other"));
    }

    function test_AddSigner_BeforeStart() public {
        address newSigner = makeAddr("newSigner");
        vm.expectEmit(true, false, false, false);
        emit SignerAdded(newSigner);
        vm.prank(creator);
        pool.addSigner(newSigner);
        assertTrue(pool.isSigner(newSigner));
    }

    function test_AddSigner_IdempotentForExisting() public {
        uint256 before = pool.getSigners().length;
        vm.prank(creator); pool.addSigner(signers[0]); // already a signer
        assertEq(pool.getSigners().length, before); // no duplicate added
    }

    function test_AddSigner_RevertAfterStart() public {
        _inActive();
        vm.prank(creator);
        vm.expectRevert(SignerListLocked.selector);
        pool.addSigner(makeAddr("late"));
    }

    
    // CANCEL
    

    function test_Cancel_InPending() public {
        vm.expectEmit(false, false, false, false);
        emit PoolCancelled();
        vm.prank(creator);
        pool.cancelPool();
        assertTrue(pool.isCancelled());
    }

    function test_Cancel_RevertIfNotCreator() public {
        vm.prank(donor);
        vm.expectRevert(Unauthorized.selector);
        pool.cancelPool();
    }

    function test_Cancel_RevertAfterStart() public {
        _inActive();
        vm.prank(creator);
        vm.expectRevert();
        pool.cancelPool();
    }

    
    // SUBMIT PROPOSAL
    

    function test_SubmitProposal_Success() public {
        _inActive();
        vm.expectEmit(true, true, false, false);
        emit ProposalSubmitted(applicant, bytes32(uint256(uint160(applicant))));
        _submit(applicant);

        GrantPool.Proposal memory p = pool.getProposal(applicant);
        assertTrue(p.exists);
        assertEq(p.payoutAddress, applicant);
    }

    function test_SubmitProposal_RevertIfAlreadySubmitted() public {
        _inActive();
        _submit(applicant);
        vm.prank(applicant);
        vm.expectRevert(AlreadySubmitted.selector);
        pool.submitProposal(bytes32(uint256(1)), applicant);
    }

    function test_SubmitProposal_RevertInPending() public {
        vm.prank(applicant);
        vm.expectRevert();
        pool.submitProposal(bytes32(uint256(1)), applicant);
    }

    function test_SubmitProposal_RevertInReview() public {
        _inReview();
        vm.prank(applicant);
        vm.expectRevert();
        pool.submitProposal(bytes32(uint256(1)), applicant);
    }

    function test_SubmitProposal_RevertZeroCID() public {
        _inActive();
        vm.prank(applicant);
        vm.expectRevert(InvalidCID.selector);
        pool.submitProposal(bytes32(0), applicant);
    }

    function test_SubmitProposal_RevertZeroPayoutAddr() public {
        _inActive();
        vm.prank(applicant);
        vm.expectRevert(InvalidAddress.selector);
        pool.submitProposal(bytes32(uint256(1)), address(0));
    }

    
    // VOTE
    

    function test_Vote_ApproveEmitsEvent() public {
        _inActive();
        _submit(applicant);
        vm.expectEmit(true, true, false, true);
        emit VoteCast(signers[0], applicant, true);
        vm.prank(signers[0]);
        pool.vote(applicant, true);
    }

    function test_Vote_RejectDoesNotMarkWinner() public {
        _inActive();
        _submit(applicant);
        _voteAll(applicant, false, 5); // all reject
        assertFalse(pool.isWinner(applicant));
    }

    function test_Vote_QuorumReachedMarksWinner() public {
        _inActive();
        _submit(applicant);
        // quorum = ceil(5*70/100) = 4; vote 3 → not yet winner
        _voteAll(applicant, true, 3);
        assertFalse(pool.isWinner(applicant));
        // 4th vote reaches quorum
        vm.expectEmit(true, false, false, false);
        emit BenefactorApproved(applicant);
        vm.prank(signers[3]);
        pool.vote(applicant, true);
        assertTrue(pool.isWinner(applicant));
    }

    function test_Vote_QuorumThresholdView() public {
        assertEq(pool.quorumThreshold(), 4); // ceil(5*0.70) = 4
    }

    function test_Vote_RevertDoubleVote() public {
        _inActive();
        _submit(applicant);
        vm.prank(signers[0]); pool.vote(applicant, true);
        vm.prank(signers[0]);
        vm.expectRevert(AlreadyVoted.selector);
        pool.vote(applicant, true);
    }

    function test_Vote_RevertNonSigner() public {
        _inActive();
        _submit(applicant);
        vm.prank(donor);
        vm.expectRevert(Unauthorized.selector);
        pool.vote(applicant, true);
    }

    function test_Vote_RevertNoProposal() public {
        _inActive();
        vm.prank(signers[0]);
        vm.expectRevert(InvalidAddress.selector);
        pool.vote(makeAddr("nobody"), true);
    }

    function test_Vote_RevertAlreadyWinner() public {
        _inActive();
        _submit(applicant);
        _voteAll(applicant, true, 4); // reaches quorum
        vm.prank(signers[4]);
        vm.expectRevert(AlreadyWon.selector);
        pool.vote(applicant, true);
    }

    function test_Vote_OnlyInActive() public {
        _inActive();
        _submit(applicant);
        _inReview(); // warp to REVIEW
        vm.prank(signers[0]);
        vm.expectRevert();
        pool.vote(applicant, true);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ENTER DISTRIBUTION PHASE
    // ══════════════════════════════════════════════════════════════════════════

    function test_EnterDistribution_SendsFeeAndSetsAmount() public {
        uint256 deposit = 100_000e6;
        _reachDistribution(deposit, 1);

        uint256 fee       = deposit / 10; // 10_000e6
        uint256 remaining = deposit - fee; // 90_000e6

        assertEq(usdt.balanceOf(treasury),       fee);
        assertEq(pool.distributionAmount(),       remaining); // 1 winner
        assertEq(pool.distributionEntered(),      true);
    }

    function test_EnterDistribution_TwoWinnersCorrectPerShare() public {
        uint256 deposit = 100_000e6;
        _reachDistribution(deposit, 2);
        // remaining = 90_000e6 / 2 = 45_000e6 per winner
        assertEq(pool.distributionAmount(), 45_000e6);
    }

    function test_EnterDistribution_EmitsEvent() public {
        _inActive();
        _donate(donor, 10_000e6);
        _submit(applicant);
        _voteAll(applicant, true, 4);
        _inDist();

        vm.expectEmit(false, false, false, true);
        emit DistributionPhaseEntered(1, 9_000e6);
        pool.enterDistributionPhase();
    }

    function test_EnterDistribution_RevertIfCalledTwice() public {
        _reachDistribution(10_000e6, 1);
        vm.expectRevert(DistributionAlreadyEntered.selector);
        pool.enterDistributionPhase();
    }

    function test_EnterDistribution_ZeroWinnersPath() public {
        _inActive();
        _donate(donor, 10_000e6);
        // no proposals, no winners
        _inDist();
        pool.enterDistributionPhase();

        assertEq(pool.zeroWinnerDistributed(), true);
        assertEq(pool.distributionAmount(),    0);
        assertEq(usdt.balanceOf(treasury),     1_000e6); // fee only
        assertEq(uint8(pool.currentState()),          uint8(PoolStateEnum.CLOSED));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CLAIM GRANT
    // ══════════════════════════════════════════════════════════════════════════

    function test_ClaimGrant_WinnerReceivesFunds() public {
        address[] memory winners = _reachDistribution(90_000e6, 1);
        address w      = winners[0];
        uint256 perShare = pool.distributionAmount(); // 81_000e6

        uint256 balBefore = usdt.balanceOf(w);

        vm.expectEmit(true, true, false, true);
        emit GrantClaimed(w, w, perShare);
        vm.prank(w); pool.claimGrant();

        assertEq(usdt.balanceOf(w), balBefore + perShare);
        assertTrue(pool.hasClaimed(w));
    }

    function test_ClaimGrant_MintsSBT() public {
        address[] memory winners = _reachDistribution(10_000e6, 1);
        vm.prank(winners[0]); pool.claimGrant();
        assertEq(sbt.mintCallCount(), 1);
    }

    function test_ClaimGrant_DustSweptAfterLastClaim() public {
        // Use raw (non-e6) amount to create 1-wei dust:
        // total=10_000_000_001, fee=1_000_000_000 (floor), remaining=9_000_000_001
        // 9_000_000_001 / 3 = 3_000_000_000 each, dust = 1 wei
        address[] memory winners = _reachDistribution(10_000_000_001, 3);
        uint256 perShare = pool.distributionAmount();

        // claim first two
        vm.prank(winners[0]); pool.claimGrant();
        vm.prank(winners[1]); pool.claimGrant();

        uint256 treasuryBefore = usdt.balanceOf(treasury);

        vm.expectEmit(false, false, false, false);
        emit PoolClosed();
        vm.prank(winners[2]); pool.claimGrant();

        // treasury received fee + dust
        uint256 treasuryAfter = usdt.balanceOf(treasury);
        assertTrue(treasuryAfter > treasuryBefore);
        assertEq(uint8(pool.currentState()), uint8(PoolStateEnum.CLOSED));
    }

    function test_ClaimGrant_RevertIfNotWinner() public {
        _reachDistribution(10_000e6, 1);
        vm.prank(applicant); // applicant not a winner here
        vm.expectRevert(NotAWinner.selector);
        pool.claimGrant();
    }

    function test_ClaimGrant_RevertDoubleClaim() public {
        // Use 2 winners so pool stays DISTRIBUTING after first claim
        address[] memory winners = _reachDistribution(10_000e6, 2);
        vm.prank(winners[0]); pool.claimGrant();
        vm.prank(winners[0]);
        vm.expectRevert(AlreadyClaimed.selector);
        pool.claimGrant();
    }

    function test_ClaimGrant_RevertInReviewState() public {
        // claimGrant requires DISTRIBUTING; calling during REVIEW must revert
        _inActive();
        _donate(donor, 10_000e6);
        _submit(applicant);
        _voteAll(applicant, true, 4);
        _inReview(); // warp to REVIEW, not yet DISTRIBUTING
        vm.prank(applicant);
        vm.expectRevert(abi.encodeWithSelector(InvalidState.selector, "DISTRIBUTING", "REVIEW"));
        pool.claimGrant();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CLAIM REFUND
    // ══════════════════════════════════════════════════════════════════════════

    function test_ClaimRefund_CancelledPoolFullRefund() public {
        _donate(donor, 50_000e6);
        vm.prank(creator); pool.cancelPool();

        uint256 balBefore = usdt.balanceOf(donor);
        vm.expectEmit(true, false, false, true);
        emit RefundClaimed(donor, 50_000e6);
        vm.prank(donor); pool.claimRefund();

        assertEq(usdt.balanceOf(donor), balBefore + 50_000e6);
        assertEq(pool.donations(donor), 0); // cleared
    }

    function test_ClaimRefund_RevertDoubleRefund() public {
        _donate(donor, 10_000e6);
        vm.prank(creator); pool.cancelPool();
        vm.prank(donor); pool.claimRefund();
        vm.prank(donor);
        vm.expectRevert(NotADonor.selector);
        pool.claimRefund();
    }

    function test_ClaimRefund_RevertIfNotDonor() public {
        vm.prank(creator); pool.cancelPool();
        vm.prank(applicant);
        vm.expectRevert(NotADonor.selector);
        pool.claimRefund();
    }

    function test_ClaimRefund_ZeroWinnersProportionalRefund() public {
        // donor contributes 60%, donor2 40% → get back 90% of their share
        _inActive();
        _donate(donor,  60_000e6);
        _donate(donor2, 40_000e6);
        _inDist();
        pool.enterDistributionPhase(); // zero winners path

        // donor should get back 90% of 60_000 = 54_000e6
        uint256 balBefore = usdt.balanceOf(donor);
        vm.prank(donor); pool.claimRefund();
        assertEq(usdt.balanceOf(donor), balBefore + 54_000e6);

        // donor2 should get back 90% of 40_000 = 36_000e6
        uint256 bal2Before = usdt.balanceOf(donor2);
        vm.prank(donor2); pool.claimRefund();
        assertEq(usdt.balanceOf(donor2), bal2Before + 36_000e6);
    }

    function test_ClaimRefund_RevertIfNotCancelledAndHasWinners() public {
        _reachDistribution(10_000e6, 1);
        vm.prank(donor);
        vm.expectRevert(PoolNotCancelled.selector);
        pool.claimRefund();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // RECOVER UNCLAIMED FUNDS
    // ══════════════════════════════════════════════════════════════════════════

    function test_RecoverUnclaimed_AfterTimeout() public {
        address[] memory winners = _reachDistribution(10_000e6, 2);
        // only 1 of 2 claims
        vm.prank(winners[0]); pool.claimGrant();

        // warp past 90-day timeout
        vm.warp(REVIEW_END + pool.UNCLAIMED_RECOVERY_DELAY() + 1);

        uint256 treasuryBefore = usdt.balanceOf(treasury);
        // admin is the test contract (Factory = address(this) had DEFAULT_ADMIN_ROLE)
        // creator also has DEFAULT_ADMIN_ROLE
        vm.prank(creator); pool.recoverUnclaimedFunds();

        assertTrue(usdt.balanceOf(treasury) > treasuryBefore);
    }

    function test_RecoverUnclaimed_RevertTooEarly() public {
        _reachDistribution(10_000e6, 1);
        // only 89 days after reviewEnd
        vm.warp(REVIEW_END + 89 days);
        vm.prank(creator);
        vm.expectRevert(RecoveryTooEarly.selector);
        pool.recoverUnclaimedFunds();
    }

    function test_RecoverUnclaimed_RevertNothingToRecover() public {
        address[] memory winners = _reachDistribution(10_000e6, 1);
        vm.prank(winners[0]); pool.claimGrant(); // all claimed
        vm.warp(REVIEW_END + pool.UNCLAIMED_RECOVERY_DELAY() + 1);
        vm.prank(creator);
        vm.expectRevert(NothingToRecover.selector);
        pool.recoverUnclaimedFunds();
    }

    function test_RecoverUnclaimed_RevertNonAdmin() public {
        _reachDistribution(10_000e6, 1);
        vm.warp(REVIEW_END + pool.UNCLAIMED_RECOVERY_DELAY() + 1);
        vm.prank(donor);
        vm.expectRevert();
        pool.recoverUnclaimedFunds();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PAUSE / UNPAUSE
    // ══════════════════════════════════════════════════════════════════════════

    function test_Pause_BlocksDonate() public {
        vm.prank(creator); pool.pause();
        vm.prank(donor);
        vm.expectRevert();
        pool.donate(1e6);
    }

    function test_Unpause_AllowsDonate() public {
        vm.prank(creator); pool.pause();
        vm.prank(creator); pool.unpause();
        _donate(donor, 1_000e6);
        assertEq(pool.totalDeposited(), 1_000e6);
    }

    function test_Pause_RevertNonAdmin() public {
        vm.prank(donor);
        vm.expectRevert();
        pool.pause();
    }

    // ══════════════════════════════════════════════════════════════════════════
    // VIEW HELPERS
    // ══════════════════════════════════════════════════════════════════════════

    function test_GetSigners() public {
        address[] memory s = pool.getSigners();
        assertEq(s.length, 5);
        assertEq(s[0], signers[0]);
    }

    function test_GetWinners_EmptyInitially() public {
        assertEq(pool.getWinners().length, 0);
    }

    function test_HasVoted() public {
        _inActive();
        _submit(applicant);
        assertFalse(pool.hasVoted(signers[0], applicant));
        vm.prank(signers[0]); pool.vote(applicant, true);
        assertTrue(pool.hasVoted(signers[0], applicant));
    }

    function test_GetApprovalCount() public {
        _inActive();
        _submit(applicant);
        assertEq(pool.getApprovalCount(applicant), 0);
        _voteAll(applicant, true, 3);
        assertEq(pool.getApprovalCount(applicant), 3);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GET PROPOSAL COUNT
    // ══════════════════════════════════════════════════════════════════════════

    function test_GetProposalCount_ZeroInitially() public {
        assertEq(pool.getProposalCount(), 0);
    }

    function test_GetProposalCount_IncrementsOnSubmit() public {
        _inActive();
        _submit(applicant);
        assertEq(pool.getProposalCount(), 1);
    }

    function test_GetProposalCount_MultipleSubmissions() public {
        _inActive();
        _submit(applicant);
        _submit(applicant2);
        _submit(applicant3);
        assertEq(pool.getProposalCount(), 3);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GET CLAIMED COUNT
    // ══════════════════════════════════════════════════════════════════════════

    function test_GetClaimedCount_ZeroInitially() public {
        assertEq(pool.getClaimedCount(), 0);
    }

    function test_GetClaimedCount_IncrementsOnClaim() public {
        _reachDistribution(10_000e6, 1);
        address winner = pool.getWinners()[0];
        vm.prank(winner);
        pool.claimGrant();
        assertEq(pool.getClaimedCount(), 1);
    }

    function test_GetClaimedCount_MultipleWinners() public {
        _reachDistribution(30_000e6, 3);
        address[] memory w = pool.getWinners();
        vm.prank(w[0]); pool.claimGrant();
        assertEq(pool.getClaimedCount(), 1);
        vm.prank(w[1]); pool.claimGrant();
        assertEq(pool.getClaimedCount(), 2);
        vm.prank(w[2]); pool.claimGrant();
        assertEq(pool.getClaimedCount(), 3);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // GET POOL SUMMARY
    // ══════════════════════════════════════════════════════════════════════════

    function test_GetPoolSummary_StaticFields() public view {
        PoolSummary memory s = pool.getPoolSummary();
        assertEq(s.poolAddress,      address(pool));
        assertEq(s.poolName,         "Web3 Dev Scholarship 2025");
        assertEq(s.creator,          creator);
        assertEq(s.submissionStart,  SUBMISSION_START);
        assertEq(s.submissionEnd,    SUBMISSION_END);
        assertEq(s.reviewEnd,        REVIEW_END);
        assertEq(s.signerCount,      5);
        assertFalse(s.isCancelled);
        assertFalse(s.distributionEntered);
    }

    function test_GetPoolSummary_StatePending() public view {
        PoolSummary memory s = pool.getPoolSummary();
        assertEq(uint8(s.state), uint8(PoolStateEnum.PENDING));
    }

    function test_GetPoolSummary_StateActive() public {
        _inActive();
        PoolSummary memory s = pool.getPoolSummary();
        assertEq(uint8(s.state), uint8(PoolStateEnum.ACTIVE));
    }

    function test_GetPoolSummary_StateCancelled() public {
        vm.prank(creator);
        pool.cancelPool();
        PoolSummary memory s = pool.getPoolSummary();
        assertEq(uint8(s.state), uint8(PoolStateEnum.CANCELLED));
        assertTrue(s.isCancelled);
    }

    function test_GetPoolSummary_ProposalCountUpdates() public {
        _inActive();
        _submit(applicant);
        _submit(applicant2);
        PoolSummary memory s = pool.getPoolSummary();
        assertEq(s.proposalCount, 2);
    }

    function test_GetPoolSummary_WinnersCountUpdates() public {
        _reachDistribution(10_000e6, 2);
        PoolSummary memory s = pool.getPoolSummary();
        assertEq(s.winnersCount,  2);
        assertEq(uint8(s.state),  uint8(PoolStateEnum.DISTRIBUTING));
        assertTrue(s.distributionEntered);
        assertGt(s.distributionAmount, 0);
    }

    function test_GetPoolSummary_ClaimedCountUpdates() public {
        _reachDistribution(10_000e6, 1);
        address winner = pool.getWinners()[0];
        vm.prank(winner);
        pool.claimGrant();
        PoolSummary memory s = pool.getPoolSummary();
        assertEq(s.claimedCount, 1);
        assertEq(uint8(s.state), uint8(PoolStateEnum.CLOSED));
    }

    function test_GetPoolSummary_TotalDeposited() public {
        _inActive();
        _donate(donor, 50_000e6);
        _donate(donor2, 20_000e6);
        PoolSummary memory s = pool.getPoolSummary();
        assertEq(s.totalDeposited, 70_000e6);
    }
}
