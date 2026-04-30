// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {MultiSig} from "./MultiSig.sol";

import { IERC20MultiSig } from "./Interfaces/IERC20MultiSig.sol";

import {
    TreasuryMultisigErrors
} from "./Types/TreasuryMultisigTypes.sol";

abstract contract ERC20MultiSig is MultiSig, IERC20MultiSig {
    IERC20 private immutable token;

    constructor(
        address[] memory _signers,
        uint256 _requiredSignatures,
        address _token
    ) MultiSig(_signers, _requiredSignatures) {
        if (_token == address(0))
            revert TreasuryMultisigErrors.TreasuryMultisig__InvalidParameters();
        token = IERC20(_token);
    }

    function proposeERC20Withdrawal(
        address _recipient,
        uint256 _amount
    ) external virtual onlySigner returns (uint256) {
        if (_recipient == address(0) || _amount == 0)
            revert TreasuryMultisigErrors.TreasuryMultisig__InvalidParameters();

        bytes memory data = abi.encodeCall(
            IERC20.transfer,
            (_recipient, _amount)
        );
        proposeAndSign(address(token), data);

        return getProposalCount();
    }

    function getTokenAddress() external view virtual returns (address) {
        return address(token);
    }
}
