// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {
    ReentrancyGuard
} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {
    TreasuryMultisigErrors,
    TreasuryMultisigEvents,
    TreasuryMultisigStructs
} from "./Types/TreasuryMultisigTypes.sol";

import { IMultiSig } from "./Interfaces/IMultiSig.sol";

abstract contract MultiSig is ReentrancyGuard, IMultiSig {
    address[] internal signers;
    uint256 private requiredSignatures;

    mapping(address => bool) internal isSigner;
    mapping(uint256 => TreasuryMultisigStructs.Proposal) private proposals;
    uint256 internal proposalCount = 0;

    constructor(address[] memory _signers, uint256 _requiredSignatures) {
        if (_requiredSignatures == 0 || _requiredSignatures > _signers.length)
            revert TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures();

        signers = _signers;
        requiredSignatures = _requiredSignatures;

        for (uint256 i = 0; i < _signers.length; i++) {
            if (_signers[i] == address(0))
                revert TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner();
            if (isSigner[_signers[i]])
                revert TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner();
            isSigner[_signers[i]] = true;

            emit TreasuryMultisigEvents.SignerAdded(_signers[i]);
        }
    }

    modifier onlySigner() {
        if (!isSigner[msg.sender])
            revert TreasuryMultisigErrors.TreasuryMultisig__NotASigner();
        _;
    }

    modifier onlySelf() {
        if (msg.sender != address(this))
            revert TreasuryMultisigErrors.TreasuryMultisig__NotSelf();
        _;
    }

    modifier validProposalId(uint256 _proposalId) {
        if (_proposalId == 0 || _proposalId > proposalCount)
            revert TreasuryMultisigErrors.TreasuryMultisig__InvalidProposalId();
        _;
    }

    modifier proposalNotExecuted(uint256 _proposalId) {
        if (proposals[_proposalId].executed)
            revert TreasuryMultisigErrors.TreasuryMultisig__ProposalAlreadyExecuted();
        _;
    }

    modifier hasNotSigned(uint256 _proposalId) {
        if (proposals[_proposalId].signedSigners[msg.sender])
            revert TreasuryMultisigErrors.TreasuryMultisig__AlreadySigned();
        _;
    }

    function _addSigner(address _signer) internal virtual {
        if (_signer == address(0) || isSigner[_signer])
            revert TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner();
        isSigner[_signer] = true;
        signers.push(_signer);
        emit TreasuryMultisigEvents.SignerAdded(_signer);
    }

    function _removeSigner(address _signer) internal virtual {
        if (!isSigner[_signer])
            revert TreasuryMultisigErrors.TreasuryMultisig__SignerNotFound();
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

    function _changeRequiredSignatures(uint256 _newThreshold) internal virtual {
        if (_newThreshold == 0 || _newThreshold > signers.length) {
            revert TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures();
        }

        requiredSignatures = _newThreshold;
        emit TreasuryMultisigEvents.RequiredSignaturesChanged(_newThreshold);
    }

    function externalAddSigner(address _signer) external virtual onlySelf {
        _addSigner(_signer);
    }

    function externalRemoveSigner(address _signer) external virtual onlySelf {
        _removeSigner(_signer);
    }

    function externalChangeRequiredSignatures(
        uint256 _newThreshold
    ) external virtual onlySelf {
        _changeRequiredSignatures(_newThreshold);
    }

    function proposeAndSign(address _to, bytes memory _data) internal virtual {
        proposalCount++;

        TreasuryMultisigStructs.Proposal storage proposal = proposals[
            proposalCount
        ];

        proposal.id = proposalCount;
        proposal.by = msg.sender;
        proposal.to = _to;
        proposal.data = _data;
        proposal.executed = false;
        proposal.signatureCount = 0;

        emit TreasuryMultisigEvents.ProposalCreated(
            proposalCount,
            msg.sender,
            _to,
            _data
        );

        proposal.signedSigners[msg.sender] = true;
        proposal.signatureCount++;
        proposal.signers.push(msg.sender);

        emit TreasuryMultisigEvents.ProposalSigned(proposalCount, msg.sender);
    }

    function signProposal(
        uint256 _proposalId
    )
        external
        virtual
        onlySigner
        validProposalId(_proposalId)
        proposalNotExecuted(_proposalId)
        hasNotSigned(_proposalId)
    {
        TreasuryMultisigStructs.Proposal storage proposal = proposals[
            _proposalId
        ];

        if (proposal.by == msg.sender)
            revert TreasuryMultisigErrors.TreasuryMultisig__ProposerCannotSign();

        proposal.signedSigners[msg.sender] = true;
        proposal.signatureCount++;
        proposal.signers.push(msg.sender);

        emit TreasuryMultisigEvents.ProposalSigned(_proposalId, msg.sender);
    }

    function revokeSignature(
        uint256 _proposalId
    )
        external
        virtual
        onlySigner
        validProposalId(_proposalId)
        proposalNotExecuted(_proposalId)
    {
        TreasuryMultisigStructs.Proposal storage proposal = proposals[
            _proposalId
        ];

        if (!proposal.signedSigners[msg.sender]) {
            revert TreasuryMultisigErrors.TreasuryMultisig__NotASignerOnThisProposal();
        }

        proposal.signedSigners[msg.sender] = false;
        proposal.signatureCount--;

        for (uint256 i = 0; i < proposal.signers.length; i++) {
            if (proposal.signers[i] == msg.sender) {
                proposal.signers[i] = proposal.signers[
                    proposal.signers.length - 1
                ];
                proposal.signers.pop();
                break;
            }
        }

        emit TreasuryMultisigEvents.ProposalSignatureRevoked(
            _proposalId,
            msg.sender
        );
    }

    function executeProposal(
        uint256 _proposalId
    )
        public
        virtual
        nonReentrant
        onlySigner
        validProposalId(_proposalId)
        proposalNotExecuted(_proposalId)
    {
        TreasuryMultisigStructs.Proposal storage proposal = proposals[
            _proposalId
        ];

        if (proposal.signatureCount < requiredSignatures)
            revert TreasuryMultisigErrors.TreasuryMultisig__NotEnoughSignatures();

        proposal.executed = true;

        (bool success, bytes memory returnData) = proposal.to.call(proposal.data);

        if (!success)
            revert TreasuryMultisigErrors.TreasuryMultisig__ProposalExecutionFailed();

        if (returnData.length == 32) {
            bool result = abi.decode(returnData, (bool));
            if (!result)
                revert TreasuryMultisigErrors.TreasuryMultisig__ProposalExecutionFailed();
        }

        emit TreasuryMultisigEvents.ProposalExecuted(_proposalId);
    }

    function proposeAddSigner(
        address _newSigner
    ) external virtual onlySigner returns (uint256) {
        if (_newSigner == address(0) || isSigner[_newSigner])
            revert TreasuryMultisigErrors.TreasuryMultisig__InvalidSigner();

        bytes memory data = abi.encodeCall(
            this.externalAddSigner,
            (_newSigner)
        );
        proposeAndSign(address(this), data);
        return proposalCount;
    }

    function proposeRemoveSigner(
        address _signerToRemove
    ) external virtual onlySigner returns (uint256) {
        if (_signerToRemove == address(0) || !isSigner[_signerToRemove])
            revert TreasuryMultisigErrors.TreasuryMultisig__NotASigner();

        bytes memory data = abi.encodeCall(
            this.externalRemoveSigner,
            (_signerToRemove)
        );
        proposeAndSign(address(this), data);
        return proposalCount;
    }

    function proposeChangeRequiredSignatures(
        uint256 _newThreshold
    ) external virtual onlySigner returns (uint256) {
        if (_newThreshold == 0 || _newThreshold > signers.length)
            revert TreasuryMultisigErrors.TreasuryMultisig__InvalidNumberOfRequiredSignatures();

        bytes memory data = abi.encodeCall(
            this.externalChangeRequiredSignatures,
            (_newThreshold)
        );
        proposeAndSign(address(this), data);
        return proposalCount;
    }

    function getProposalDetails(
        uint256 _proposalId
    )
        external
        view
        virtual
        validProposalId(_proposalId)
        returns (
            uint256 id,
            address to,
            bytes memory data,
            bool executed,
            uint256 signatureCount
        )
    {
        TreasuryMultisigStructs.Proposal storage proposal = proposals[
            _proposalId
        ];
        return (
            proposal.id,
            proposal.to,
            proposal.data,
            proposal.executed,
            proposal.signatureCount
        );
    }

    function getProposalCount() public view virtual returns (uint256) {
        return proposalCount;
    }

    function getAllProposals() external view virtual returns (TreasuryMultisigStructs.ProposalView[] memory) {
        TreasuryMultisigStructs.ProposalView[] memory result = new TreasuryMultisigStructs.ProposalView[](proposalCount);

        for (uint256 i = 1; i <= proposalCount; i++) {
            TreasuryMultisigStructs.Proposal storage p = proposals[i];
            result[i - 1] = TreasuryMultisigStructs.ProposalView({
                id: p.id,
                by: p.by,
                to: p.to,
                data: p.data,
                executed: p.executed,
                signatureCount: p.signatureCount,
                signers: p.signers
            });
        }

        return result;
    }

    function getSigners() external view virtual returns (address[] memory) {
        return signers;
    }

    function isSignerPublic(address _addr) external view virtual returns (bool) {
        return isSigner[_addr];
    }

    function getRequiredSignatures() external view virtual returns (uint256) {
        return requiredSignatures;
    }
}
