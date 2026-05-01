// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {TreasuryMultisig} from "../src/TreasuryMultisig.sol";
import {TreasuryMultisigErrors} from "../src/Types/TreasuryMultisigTypes.sol";
import {MockERC20} from "./Helpers.sol";

// ─────────────────────────────────────────────────────────────────────────────
// TreasuryMultisig Test Suite
// Tests the full multisig lifecycle: proposal → signing → execution,
// signature revocation, signer management, and threshold changes.
// ─────────────────────────────────────────────────────────────────────────────
contract TreasuryMultisigTest is Test {

    TreasuryMultisig public msig;
    MockERC20        public token;

    // 3 signers — required = 2
    address public s1 = makeAddr("signer1");
    address public s2 = makeAddr("signer2");
    address public s3 = makeAddr("signer3");
    address public outsider = makeAddr("outsider");
    address public recipient = makeAddr("recipient");

    uint256 constant REQUIRED = 2;

    function setUp() public {
        token = new MockERC20();

        address[] memory initialSigners = new address[](3);
        initialSigners[0] = s1;
        initialSigners[1] = s2;
        initialSigners[2] = s3;

        msig = new TreasuryMultisig(initialSigners, REQUIRED, address(token));

        // Fund the treasury
        token.mint(address(msig), 100_000e6);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ══════════════════════════════════════════════════════════════════════════

    function test_Constructor_SignersRegistered() public {
        assertTrue(msig.isSignerPublic(s1));
        assertTrue(msig.isSignerPublic(s2));
        assertTrue(msig.isSignerPublic(s3));
        assertFalse(msig.isSignerPublic(outsider));
    }

    function test_Constructor_RequiredSignatures() public {
        assertEq(msig.getRequiredSignatures(), REQUIRED);
    }

    function test_Constructor_SignerCount() public {
        assertEq(msig.getSigners().length, 3);
    }

    function test_Constructor_TokenAddress() public {
        assertEq(msig.getTokenAddress(), address(token));
    }

    function test_Constructor_RevertZeroRequired() public {
        address[] memory s = _threeSigners();
        vm.expectRevert(
            TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures.selector
        );
        new TreasuryMultisig(s, 0, address(token));
    }

    function test_Constructor_RevertRequiredExceedsSigners() public {
        address[] memory s = _threeSigners();
        vm.expectRevert(
            TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures.selector
        );
        new TreasuryMultisig(s, 4, address(token));
    }

    function test_Constructor_RevertZeroSignerAddress() public {
        address[] memory s = _threeSigners();
        s[1] = address(0);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner.selector);
        new TreasuryMultisig(s, 2, address(token));
    }

    function test_Constructor_RevertDuplicateSigner() public {
        address[] memory s = _threeSigners();
        s[2] = s[0]; // duplicate
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner.selector);
        new TreasuryMultisig(s, 2, address(token));
    }

    function test_Constructor_RevertZeroToken() public {
        address[] memory s = _threeSigners();
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__InvalidParameters.selector);
        new TreasuryMultisig(s, 2, address(0));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PROPOSE ERC20 WITHDRAWAL
    // ══════════════════════════════════════════════════════════════════════════

    function test_ProposeWithdrawal_CreatesProposal() public {
        vm.prank(s1);
        uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        assertEq(id, 1);
        assertEq(msig.getProposalCount(), 1);
    }

    function test_ProposeWithdrawal_ProposerAutomaticallySigns() public {
        vm.prank(s1);
        uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        (, , , , uint256 sigCount) = msig.getProposalDetails(id);
        assertEq(sigCount, 1); // proposer auto-signs
    }

    function test_ProposeWithdrawal_RevertNonSigner() public {
        vm.prank(outsider);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__NotASigner.selector);
        msig.proposeERC20Withdrawal(recipient, 1_000e6);
    }

    function test_ProposeWithdrawal_RevertZeroRecipient() public {
        vm.prank(s1);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__InvalidParameters.selector);
        msig.proposeERC20Withdrawal(address(0), 1_000e6);
    }

    function test_ProposeWithdrawal_RevertZeroAmount() public {
        vm.prank(s1);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__InvalidParameters.selector);
        msig.proposeERC20Withdrawal(recipient, 0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SIGN PROPOSAL
    // ══════════════════════════════════════════════════════════════════════════

    function test_SignProposal_AddsSignature() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        vm.prank(s2); msig.signProposal(id);
        (, , , , uint256 sigCount) = msig.getProposalDetails(id);
        assertEq(sigCount, 2);
    }

    function test_SignProposal_RevertDoubleSign() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        vm.prank(s2); msig.signProposal(id);
        vm.prank(s2);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__AlreadySigned.selector);
        msig.signProposal(id);
    }

    function test_SignProposal_RevertProposerCannotSign() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        // s1 auto-signs on propose; revoke first so hasNotSigned passes,
        // then the ProposerCannotSign check fires
        vm.prank(s1); msig.revokeSignature(id);
        vm.prank(s1);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__ProposerCannotSign.selector);
        msig.signProposal(id);
    }

    function test_SignProposal_RevertNonSigner() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        vm.prank(outsider);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__NotASigner.selector);
        msig.signProposal(id);
    }

    function test_SignProposal_RevertInvalidId() public {
        vm.prank(s2);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__InvalidProposalId.selector);
        msig.signProposal(999);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // REVOKE SIGNATURE
    // ══════════════════════════════════════════════════════════════════════════

    function test_RevokeSignature_DecreasesCount() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        vm.prank(s2); msig.signProposal(id);

        vm.prank(s2); msig.revokeSignature(id);
        (, , , , uint256 sigCount) = msig.getProposalDetails(id);
        assertEq(sigCount, 1); // only s1's auto-sign remains
    }

    function test_RevokeSignature_RevertNotSigned() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        // s3 never signed
        vm.prank(s3);
        vm.expectRevert(
            TreasuryMultisigErrors.TreasuryMultisig__NotASignerOnThisProposal.selector
        );
        msig.revokeSignature(id);
    }

    function test_RevokeSignature_PreventExecutionAfterRevoke() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        vm.prank(s2); msig.signProposal(id); // 2 sigs — meets threshold
        vm.prank(s2); msig.revokeSignature(id); // revoke → back to 1

        vm.prank(s3);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__NotEnoughSignatures.selector);
        msig.executeProposal(id);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // EXECUTE PROPOSAL
    // ══════════════════════════════════════════════════════════════════════════

    function test_Execute_TransfersTokens() public {
        uint256 amount = 5_000e6;
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, amount);
        vm.prank(s2); msig.signProposal(id); // meets required = 2

        uint256 balBefore = token.balanceOf(recipient);
        vm.prank(s3); msig.executeProposal(id);

        assertEq(token.balanceOf(recipient), balBefore + amount);
    }

    function test_Execute_MarksProposalExecuted() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        vm.prank(s2); msig.signProposal(id);
        vm.prank(s3); msig.executeProposal(id);

        (, , , bool executed,) = msig.getProposalDetails(id);
        assertTrue(executed);
    }

    function test_Execute_RevertIfAlreadyExecuted() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        vm.prank(s2); msig.signProposal(id);
        vm.prank(s3); msig.executeProposal(id);

        vm.prank(s3);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__ProposalAlreadyExecuted.selector);
        msig.executeProposal(id);
    }

    function test_Execute_RevertNotEnoughSignatures() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        // only s1's auto-sign = 1, required = 2
        vm.prank(s2);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__NotEnoughSignatures.selector);
        msig.executeProposal(id);
    }

    function test_Execute_RevertNonSigner() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        vm.prank(s2); msig.signProposal(id);
        vm.prank(outsider);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__NotASigner.selector);
        msig.executeProposal(id);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // SIGNER MANAGEMENT (via multisig proposals)
    // ══════════════════════════════════════════════════════════════════════════

    function test_AddSigner_ViaMultisig() public {
        address newSigner = makeAddr("newSigner");
        assertFalse(msig.isSignerPublic(newSigner));

        vm.prank(s1); uint256 id = msig.proposeAddSigner(newSigner);
        vm.prank(s2); msig.signProposal(id);
        vm.prank(s3); msig.executeProposal(id);

        assertTrue(msig.isSignerPublic(newSigner));
        assertEq(msig.getSigners().length, 4);
    }

    function test_AddSigner_RevertDuplicate() public {
        vm.prank(s1);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner.selector);
        msig.proposeAddSigner(s2); // already a signer
    }

    function test_RemoveSigner_ViaMultisig() public {
        vm.prank(s1); uint256 id = msig.proposeRemoveSigner(s3);
        vm.prank(s2); msig.signProposal(id);
        vm.prank(s1); msig.executeProposal(id);

        assertFalse(msig.isSignerPublic(s3));
        assertEq(msig.getSigners().length, 2);
    }

    function test_RemoveSigner_RevertNotASigner() public {
        vm.prank(s1);
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__NotASigner.selector);
        msig.proposeRemoveSigner(outsider);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CHANGE REQUIRED SIGNATURES
    // ══════════════════════════════════════════════════════════════════════════

    function test_ChangeThreshold_ViaMultisig() public {
        vm.prank(s1); uint256 id = msig.proposeChangeRequiredSignatures(3);
        vm.prank(s2); msig.signProposal(id);
        vm.prank(s3); msig.executeProposal(id);

        assertEq(msig.getRequiredSignatures(), 3);
    }

    function test_ChangeThreshold_RevertZero() public {
        vm.prank(s1);
        vm.expectRevert(
            TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures.selector
        );
        msig.proposeChangeRequiredSignatures(0);
    }

    function test_ChangeThreshold_RevertExceedsSignerCount() public {
        vm.prank(s1);
        vm.expectRevert(
            TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures.selector
        );
        msig.proposeChangeRequiredSignatures(10); // only 3 signers
    }

    // ══════════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════════

    function test_GetProposalDetails() public {
        vm.prank(s1); uint256 id = msig.proposeERC20Withdrawal(recipient, 1_000e6);
        (uint256 pid, address to, , bool executed, uint256 sigCount) = msig.getProposalDetails(id);
        assertEq(pid, 1);
        assertEq(to, address(token));
        assertFalse(executed);
        assertEq(sigCount, 1);
    }

    function test_GetAllProposals() public {
        vm.prank(s1); msig.proposeERC20Withdrawal(recipient, 1_000e6);
        vm.prank(s2); msig.proposeERC20Withdrawal(recipient, 2_000e6);

        assertEq(msig.getAllProposals().length, 2);
    }

    function test_GetProposalDetails_RevertInvalidId() public {
        vm.expectRevert(TreasuryMultisigErrors.TreasuryMultisig__InvalidProposalId.selector);
        msig.getProposalDetails(0);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // FULL END-TO-END FLOW
    // ══════════════════════════════════════════════════════════════════════════

    function test_E2E_ProposalLifecycle() public {
        uint256 withdrawAmount = 10_000e6;
        uint256 treasuryBefore = token.balanceOf(address(msig));

        // s1 proposes
        vm.prank(s1);
        uint256 id = msig.proposeERC20Withdrawal(recipient, withdrawAmount);
        assertEq(msig.getProposalCount(), 1);

        // s2 signs → reaches threshold
        vm.prank(s2);
        msig.signProposal(id);

        // s3 executes
        vm.prank(s3);
        msig.executeProposal(id);

        assertEq(token.balanceOf(recipient),       withdrawAmount);
        assertEq(token.balanceOf(address(msig)),   treasuryBefore - withdrawAmount);

        (, , , bool executed,) = msig.getProposalDetails(id);
        assertTrue(executed);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    function _threeSigners() private pure returns (address[] memory) {
        address[] memory s = new address[](3);
        s[0] = address(0x1111);
        s[1] = address(0x2222);
        s[2] = address(0x3333);
        return s;
    }
}
