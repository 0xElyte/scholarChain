// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library TreasuryMultisigErrors {
    error TreasuryMultisig__InvalidNumberOfRequiredSignatures();
    error TreasuryMultisig__InvalidSigner();
    error TreasuryMultisig__SignerNotFound();
    error TreasuryMultisig__NotSelf();
    error TreasuryMultisig__InvalidParameters();
    error TreasuryMultisig__NotASigner();
    error TreasuryMultisig__ProposalAlreadyExecuted();
    error TreasuryMultisig__AlreadySigned();
    error TreasuryMultisig__InvalidProposalId();
    error TreasuryMultisig__NotEnoughSignatures();
    error TreasuryMultisig__NotASignerOnThisProposal();
    error TreasuryMultisig__ProposalExecutionFailed();
    error TreasuryMultisig__ProposerCannotSign();
}

library TreasuryMultisigEvents {
    event SignerAdded(address indexed signer);
    event SignerRemoved(address indexed signer);
    event RequiredSignaturesChanged(uint256 newThreshold);
    event ProposalCreated(uint256 indexed proposalId, address indexed proposer, address indexed to, bytes data);
    event ProposalSignatureRevoked(uint256 indexed proposalId, address indexed signer);
    event ProposalExecuted(uint256 indexed proposalId, address indexed target, bytes4 selector);
    event ProposalSigned(uint256 indexed proposalId, address indexed signer);
}

library TreasuryMultisigStructs {
    struct Proposal {
        uint256 id;
        address by;
        address to;
        bytes data;
        bool executed;
        uint256 signatureCount;
        mapping(address => bool) signedSigners;
        address[] signers;
    }

    struct ProposalView {
        uint256 id;
        address by;
        address to;
        bytes data;
        bool executed;
        uint256 signatureCount;
        address[] signers;
    }
}