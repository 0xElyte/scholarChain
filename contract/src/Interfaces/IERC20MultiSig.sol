// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IMultiSig } from "./IMultiSig.sol";

interface IERC20MultiSig is IMultiSig {
    function proposeERC20Withdrawal(address _recipient, uint256 _amount) external returns (uint256);

    function getTokenAddress() external view returns (address);
}
