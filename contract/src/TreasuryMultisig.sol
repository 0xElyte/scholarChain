// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {ERC20MultiSig} from "./ERC20MultiSig.sol";

contract TreasuryMultisig is ERC20MultiSig {
    constructor(
        address[] memory _signers,
        uint256 _requiredSignatures,
        address _token
    ) ERC20MultiSig(_signers, _requiredSignatures, _token) {
    }
}
