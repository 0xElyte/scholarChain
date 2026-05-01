// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev 6-decimal mock USDT for Sepolia testnet.
///      Mainnet deployments use Tether's real USDT — never this contract.
contract MockUSDT is ERC20 {
    constructor() ERC20("Scholar USD", "S-USDT") {
        _mint(msg.sender, 10_000_000 * 10 ** 6); // 10M S-USDT to deployer
    }

    function decimals() public pure override returns (uint8) { return 6; }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
