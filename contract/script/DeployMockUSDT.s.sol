// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/mocks/MockUSDT.sol";

contract DeployMockUSDT is Script {
    function run() external {
        vm.startBroadcast(vm.envUint("PRIVATE_KEY"));
        MockUSDT usdt = new MockUSDT();
        vm.stopBroadcast();

        console.log("Scholar USD:", address(usdt));
        console.log("Paste this into USDT_ADDRESS in .env");
    }
}
