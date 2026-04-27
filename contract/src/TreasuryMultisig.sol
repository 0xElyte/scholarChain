// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { TreasuryMultisigErrors, TreasuryMultisigEvents, TreasuryMultisigStructs } from "./Types/TreasuryMultisigTypes.sol";

contract TreasuryMultisig is ReentrancyGuard {
    using SafeERC20 for IERC20;

    address private scholarChainFactoryAddress;
    address[] private signers;
    uint256 private requiredSignatures;
    IERC20 private immutable token;

    mapping (address => bool) private isSigner;
    mapping (uint256 => TreasuryMultisigStructs.Proposal) private proposals;
    uint256 private proposalCount = 0;

    constructor(address[] memory _signers, uint256 _requiredSignatures, address _token) {
        if (_requiredSignatures == 0 || _requiredSignatures > _signers.length)  revert TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures();

        signers = _signers;
        requiredSignatures = _requiredSignatures;
        token = IERC20(_token);

        for (uint256 i = 0; i < _signers.length; i++) {
            if (_signers[i] == address(0)) revert TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner();
            isSigner[_signers[i]] = true;
            emit TreasuryMultisigEvents.SignerAdded(_signers[i]);
        }
    }

    modifier onlySigner() {
        if (!isSigner[msg.sender])  revert TreasuryMultisigErrors.TreasuryMultisig__NotASigner();
        _;
    }

    modifier onlySelf() {
        if (msg.sender != address(this)) revert TreasuryMultisigErrors.TreasuryMultisig__NotSelf();
        _;
    }

    modifier validProposalId(uint256 _proposalId) {
        if (_proposalId == 0 || _proposalId > proposalCount)  revert TreasuryMultisigErrors.TreasuryMultisig__InvalidProposalId();
        _;
    }

    modifier proposalNotExecuted(uint256 _proposalId) {
        if (proposals[_proposalId].executed)  revert TreasuryMultisigErrors.TreasuryMultisig__ProposalAlreadyExecuted();
        _;
    }

    modifier hasNotSigned(uint256 _proposalId) {
        if (proposals[_proposalId].signedSigners[msg.sender])    revert TreasuryMultisigErrors.TreasuryMultisig__AlreadySigned();
        _;
    }

    function _addSigner(address _signer) private {
        if (_signer == address(0) || isSigner[_signer]) revert TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner();
        isSigner[_signer] = true;
        signers.push(_signer);
        emit TreasuryMultisigEvents.SignerAdded(_signer);
    }

    function _removeSigner(address _signer) private {
        if (!isSigner[_signer]) revert TreasuryMultisigErrors.TreasuryMultisig__SignerNotFound();
        isSigner[_signer] = false;

        for (uint256 i = 0; i < signers.length; i++) {
            if (signers[i] == _signer) {
                signers[i] = signers[signers.length - 1];
                signers.pop();
                break;
            }
        }

        emit TreasuryMultisigEvents.SignerRemoved(_signer);
    }

    function _changeRequiredSignatures(uint256 _newThreshold) private {
        if (_newThreshold == 0 || _newThreshold > signers.length) {
            revert TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures();
        }

        requiredSignatures = _newThreshold;
        emit TreasuryMultisigEvents.RequiredSignaturesChanged(_newThreshold);
    }

    function externalAddSigner(address _signer) external onlySelf {
        _addSigner(_signer);
    }

    function externalRemoveSigner(address _signer) external onlySelf {
        _removeSigner(_signer);
    }

    function externalChangeRequiredSignatures(uint256 _newThreshold) external onlySelf {
        _changeRequiredSignatures(_newThreshold);
    }

    function propose(address _to, uint256 _value, bytes memory _data) private {
        proposalCount++;
        
        TreasuryMultisigStructs.Proposal storage proposal = proposals[proposalCount];
        proposal.by = msg.sender;
        proposal.to = _to;
        proposal.value = _value;
        proposal.data = _data;
        proposal.executed = false;
        proposal.signatureCount = 0;

        emit TreasuryMultisigEvents.ProposalCreated(proposalCount, msg.sender, _to, _value, _data);
    }

    function signProposal(uint256 _proposalId)
        external
        onlySigner
        validProposalId(_proposalId)
        proposalNotExecuted(_proposalId)
        hasNotSigned(_proposalId)
    {
        TreasuryMultisigStructs.Proposal storage proposal = proposals[_proposalId];

        if (proposal.by == msg.sender)  revert TreasuryMultisigErrors.TreasuryMultisig__ProposerCannotSign();

        proposal.signedSigners[msg.sender] = true;
        proposal.signatureCount++;
        proposal.signers.push(msg.sender);

        emit TreasuryMultisigEvents.ProposalSigned(_proposalId, msg.sender);
    }

    function revokeSignature(uint256 _proposalId)
        external
        onlySigner
        validProposalId(_proposalId)
        proposalNotExecuted(_proposalId)
    {
        TreasuryMultisigStructs.Proposal storage proposal = proposals[_proposalId];

        if (!proposal.signedSigners[msg.sender]) {
            revert TreasuryMultisigErrors.TreasuryMultisig__NotASignerOnThisProposal();
        }

        proposal.signedSigners[msg.sender] = false;
        proposal.signatureCount--;

        for (uint256 i = 0; i < proposal.signers.length; i++) {
            if (proposal.signers[i] == msg.sender) {
                proposal.signers[i] = proposal.signers[proposal.signers.length - 1];
                proposal.signers.pop();
                break;
            }
        }

        emit TreasuryMultisigEvents.ProposalSignatureRevoked(_proposalId, msg.sender);
    }

    function executeProposal(uint256 _proposalId)
        external
        nonReentrant
        onlySigner
        validProposalId(_proposalId)
        proposalNotExecuted(_proposalId)
    {
        TreasuryMultisigStructs.Proposal storage proposal = proposals[_proposalId];

        if (proposal.signatureCount < requiredSignatures) revert TreasuryMultisigErrors.TreasuryMultisig__NotEnoughSignatures();

        proposal.executed = true;

        (bool success, ) = proposal.to.call(proposal.data);

        if (!success) revert TreasuryMultisigErrors.TreasuryMultisig__ProposalExecutionFailed();

        if (proposal.value > 0) {
            token.safeTransfer(proposal.to, proposal.value);
        }

        emit TreasuryMultisigEvents.ProposalExecuted(_proposalId);
    }

    function proposeAddSigner(address _newSigner) external onlySigner returns (uint256) {
        if (_newSigner == address(0) || isSigner[_newSigner]) revert TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner();
        
        bytes memory data = abi.encodeCall(this.externalAddSigner, (_newSigner));
        propose(address(this), 0, data);
        return proposalCount;
    }

    function proposeRemoveSigner(address _signerToRemove) external onlySigner returns (uint256) {
        if (_signerToRemove == address(0) || !isSigner[_signerToRemove]) revert TreasuryMultisigErrors.TreasuryMultisig__NotASigner();

        bytes memory data = abi.encodeCall(this.externalRemoveSigner, (_signerToRemove));
        propose(address(this), 0, data);
        return proposalCount;
    }

    function proposeERC20Withdrawal(address _recipient, uint256 _amount) external onlySigner returns (uint256) {
        if (_recipient == address(0) || _amount == 0) revert TreasuryMultisigErrors.TreasuryMultisig__InvalidParameters();

        bytes memory data = abi.encodeCall(IERC20.transfer, (_recipient, _amount));
        propose(address(token), 0, data);
        return proposalCount;
    }

    function proposeChangeRequiredSignatures(uint256 _newThreshold) external onlySigner returns (uint256) {
        if (_newThreshold == 0 || _newThreshold > signers.length) revert TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures();

        bytes memory data = abi.encodeCall(this.externalChangeRequiredSignatures, (_newThreshold));
        propose(address(this), 0, data);
        return proposalCount;
    }

    function getProposalDetails(uint256 _proposalId) external view validProposalId(_proposalId) returns (address to, uint256 value, bytes memory data, bool executed, uint256 signatureCount) {
        TreasuryMultisigStructs.Proposal storage proposal = proposals[_proposalId];
        return (proposal.to, proposal.value, proposal.data, proposal.executed, proposal.signatureCount);
    }

    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    function isSignerPublic(address _addr) external view returns (bool) {
        return isSigner[_addr];
    }

    function getRequiredSignatures() external view returns (uint256) {
        return requiredSignatures;
    }

    function getTokenAddress() external view returns (address) {
        return address(token);
    }
}