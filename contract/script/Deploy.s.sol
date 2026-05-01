// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {TreasuryMultisig} from "../src/TreasuryMultisig.sol";
import {ScholarChainSBT} from "../src/ScholarChainSBT.sol";
import {ScholarChainFactory} from "../src/ScholarChainFactory.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";

error Deploy__ZeroAddress();
error Deploy__InvalidRequiredSignatures();
error Deploy__DuplicateSigner();

/// @notice Deploys all ScholarChain contracts in the correct dependency order.
///
/// Required env vars:
///   PRIVATE_KEY          — deployer private key
///   USDT_ADDRESS         — USDT ERC-20 on the target network
///   TREASURY_SIGNER_1    — multisig signer 1
///   TREASURY_SIGNER_2    — multisig signer 2
///   TREASURY_SIGNER_3    — multisig signer 3
///   REQUIRED_SIGS        — number of required signatures (e.g. 2)
///   TEAM_MULTISIG        — address to hand DEFAULT_ADMIN_ROLE to after deploy
///
/// Deployment order (per architecture doc Section 8):
///   1. TreasuryMultisig
///   2. ScholarChainSBT
///   3. ScholarChainFactory (treasury, sbt, feeBps=1000)
///   4. Grant factory DEFAULT_ADMIN_ROLE on SBT (so it can give MINTER_ROLE to pools)
///   5. Grant DEFAULT_ADMIN_ROLE on factory and SBT to team multisig
///   6. Renounce deployer admin; factory keeps SBT admin so it can authorize pools
contract Deploy is Script {

    uint256 constant TREASURY_FEE_BPS = 1000; // 10%

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer   = vm.addr(deployerKey);

        address usdtAddress    = vm.envAddress("USDT_ADDRESS");
        address teamMultisig   = vm.envAddress("TEAM_MULTISIG");
        uint256 requiredSigs   = vm.envUint("REQUIRED_SIGS");

        address[] memory treasurySigners = new address[](3);
        treasurySigners[0] = vm.envAddress("TREASURY_SIGNER_1");
        treasurySigners[1] = vm.envAddress("TREASURY_SIGNER_2");
        treasurySigners[2] = vm.envAddress("TREASURY_SIGNER_3");

        _validateDeploymentConfig(
            usdtAddress,
            teamMultisig,
            requiredSigs,
            treasurySigners
        );

        vm.startBroadcast(deployerKey);

        // 1. Deploy TreasuryMultisig (Femi's contract — receives 10% protocol fee)
        TreasuryMultisig treasuryMultisig = new TreasuryMultisig(
            treasurySigners,
            requiredSigs,
            usdtAddress
        );
        console.log("TreasuryMultisig :", address(treasuryMultisig));

        // 2. Deploy ScholarChainSBT (Omoboi's contract)
        ScholarChainSBT sbt = new ScholarChainSBT("ScholarChain Grant Award", "SCGA");
        console.log("ScholarChainSBT  :", address(sbt));

        // 3. Deploy ScholarChainFactory — passes feeBps=1000 as constructor param
        ScholarChainFactory factory = new ScholarChainFactory(
            address(treasuryMultisig),
            address(sbt),
            TREASURY_FEE_BPS
        );
        console.log("ScholarChainFactory:", address(factory));

        // 4. Grant factory DEFAULT_ADMIN_ROLE on SBT so createPool() can call
        //    sbt.grantRole(MINTER_ROLE, poolAddress) for each new pool
        IAccessControl(address(sbt)).grantRole(bytes32(0), address(factory));
        console.log("Factory granted DEFAULT_ADMIN_ROLE on SBT");

        // 5. Hand protocol admin to team multisig. The factory intentionally
        //    remains an SBT admin so it can authorize newly deployed pools.
        IAccessControl(address(factory)).grantRole(bytes32(0), teamMultisig);
        IAccessControl(address(sbt)).grantRole(bytes32(0), teamMultisig);
        console.log("DEFAULT_ADMIN_ROLE transferred to team multisig:", teamMultisig);

        // 6. Deployer gives up its own DEFAULT_ADMIN_ROLE.
        IAccessControl(address(factory)).renounceRole(bytes32(0), deployer);
        IAccessControl(address(sbt)).renounceRole(bytes32(0), deployer);
        console.log("Deployer admin revoked");

        vm.stopBroadcast();

        // Summary
        console.log("\n=== Deployment Complete ===");
        console.log("TreasuryMultisig :", address(treasuryMultisig));
        console.log("ScholarChainSBT  :", address(sbt));
        console.log("ScholarChainFactory:", address(factory));
        console.log("Admin             :", teamMultisig);
    }

    function _validateDeploymentConfig(
        address usdtAddress,
        address teamMultisig,
        uint256 requiredSigs,
        address[] memory treasurySigners
    ) internal pure {
        if (usdtAddress == address(0) || teamMultisig == address(0)) {
            revert Deploy__ZeroAddress();
        }
        if (requiredSigs == 0 || requiredSigs > treasurySigners.length) {
            revert Deploy__InvalidRequiredSignatures();
        }

        for (uint256 i = 0; i < treasurySigners.length; i++) {
            if (treasurySigners[i] == address(0)) revert Deploy__ZeroAddress();
            for (uint256 j = i + 1; j < treasurySigners.length; j++) {
                if (treasurySigners[i] == treasurySigners[j]) revert Deploy__DuplicateSigner();
            }
        }
    }
}
