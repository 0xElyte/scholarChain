// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { TreasuryMultisigStructs } from "../Types/TreasuryMultisigTypes.sol";

interface IMultiSig {
    function externalAddSigner(address _signer) external;

    function externalRemoveSigner(address _signer) external;

    function externalChangeRequiredSignatures(uint256 _newThreshold) external;

    function signProposal(uint256 _proposalId) external;

    function revokeSignature(uint256 _proposalId) external;

    function executeProposal(uint256 _proposalId) external;

    function proposeAddSigner(address _newSigner) external returns (uint256);

    function proposeRemoveSigner(address _signerToRemove) external returns (uint256);

    function proposeChangeRequiredSignatures(uint256 _newThreshold) external returns (uint256);

    function getProposalDetails(uint256 _proposalId)
        external
        view
        returns (
            uint256 id,
            address to,
            bytes memory data,
            bool executed,
            uint256 signatureCount
        );

    function getProposalCount() external view returns (uint256);

    function getAllProposals() external view returns (TreasuryMultisigStructs.ProposalView[] memory);

    function getSigners() external view returns (address[] memory);

    function isSignerPublic(address _addr) external view returns (bool);

    function getRequiredSignatures() external view returns (uint256);
}
