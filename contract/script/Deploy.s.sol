// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import {TreasuryMultisig} from "../src/TreasuryMultisig.sol";
import {ScholarChainSBT} from "../src/ScholarChainSBT.sol";
import {ScholarChainFactory} from "../src/ScholarChainFactory.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";

error Deploy__InvalidRequiredSignatures();
error Deploy__DuplicateSigner();
error Deploy__MainnetRequiresUSDTAddress();

/// @notice Deploys all ScholarChain contracts in the correct dependency order.
///
/// Required env vars (all networks):
///   PRIVATE_KEY          — deployer private key
///   TREASURY_SIGNER_1/2/3 — multisig signers (become protocol admins too)
///   REQUIRED_SIGS        — number of required signatures (e.g. 2)
///
/// Mainnet only:
///   USDT_ADDRESS         — real Tether USDT address (auto-deployed as MockUSDT on testnets)
///
/// Governance pattern:
///   TreasuryMultisig holds DEFAULT_ADMIN_ROLE on Factory and SBT.
///   Any protocol admin action (pause, setTreasury, grantRole) requires 2-of-3 signer
///   approval via proposeArbitraryCall() + signProposal() + executeProposal().
///
/// Deployment order:
///   1. MockUSDT (testnet) or validate USDT_ADDRESS (mainnet)
///   2. TreasuryMultisig
///   3. ScholarChainSBT
///   4. ScholarChainFactory
///   5. Grant factory DEFAULT_ADMIN_ROLE on SBT (so it can authorise pools as minters)
///   6. Transfer DEFAULT_ADMIN_ROLE to TEAM_MULTISIG on factory and SBT
///   7. Deployer renounces its own admin
contract Deploy is Script {

    uint256 constant TREASURY_FEE_BPS = 1000; // 10%
    uint256 constant MAINNET_CHAIN_ID  = 1;

    function run() external {
        uint256 deployerKey  = vm.envUint("PRIVATE_KEY");
        address deployer     = vm.addr(deployerKey);
        uint256 requiredSigs = vm.envUint("REQUIRED_SIGS");

        address[] memory treasurySigners = new address[](3);
        treasurySigners[0] = vm.envAddress("TREASURY_SIGNER_1");
        treasurySigners[1] = vm.envAddress("TREASURY_SIGNER_2");
        treasurySigners[2] = vm.envAddress("TREASURY_SIGNER_3");

        // Read USDT_ADDRESS with a safe default so we can give a clear error message
        address usdtEnv = vm.envOr("USDT_ADDRESS", address(0));

        _validateDeploymentConfig(requiredSigs, treasurySigners);

        // Mainnet requires a real USDT address — catch this before broadcasting
        if (block.chainid == MAINNET_CHAIN_ID && usdtEnv == address(0)) {
            revert Deploy__MainnetRequiresUSDTAddress();
        }

        vm.startBroadcast(deployerKey);

        // 1. Resolve USDT
        //    - Mainnet:  USDT_ADDRESS required
        //    - Testnet:  use USDT_ADDRESS if set, otherwise deploy a fresh MockUSDT
        address usdtAddress;
        if (block.chainid == MAINNET_CHAIN_ID) {
            usdtAddress = usdtEnv;
            console.log("USDT (mainnet)    :", usdtAddress);
        } else if (usdtEnv != address(0)) {
            usdtAddress = usdtEnv;
            console.log("MockUSDT (reused) :", usdtAddress);
        } else {
            usdtAddress = address(new MockUSDT());
            console.log("MockUSDT (new)    :", usdtAddress);
        }

        // 2. Deploy TreasuryMultisig
        TreasuryMultisig treasury = new TreasuryMultisig(treasurySigners, requiredSigs, usdtAddress);
        console.log("TreasuryMultisig  :", address(treasury));

        // 3. Deploy ScholarChainSBT
        ScholarChainSBT sbt = new ScholarChainSBT("ScholarChain Grant Award", "SCGA");
        console.log("ScholarChainSBT   :", address(sbt));

        // 4. Deploy ScholarChainFactory
        ScholarChainFactory factory = new ScholarChainFactory(address(treasury), address(sbt), TREASURY_FEE_BPS);
        console.log("ScholarChainFactory:", address(factory));

        // 5. Grant factory DEFAULT_ADMIN_ROLE on SBT so it can authorise pools as minters
        IAccessControl(address(sbt)).grantRole(bytes32(0), address(factory));
        console.log("Factory granted DEFAULT_ADMIN_ROLE on SBT");

        // 6. Transfer protocol admin to TreasuryMultisig — it becomes the protocol governor.
        //    Any future admin action (pause, setTreasury, grantRole) requires 2-of-3 signer
        //    approval through proposeArbitraryCall() + signProposal() + executeProposal().
        IAccessControl(address(factory)).grantRole(bytes32(0), address(treasury));
        IAccessControl(address(sbt)).grantRole(bytes32(0), address(treasury));
        console.log("Admin transferred to TreasuryMultisig:", address(treasury));

        // 7. Deployer renounces its own admin — TreasuryMultisig is now the sole admin
        IAccessControl(address(factory)).renounceRole(bytes32(0), deployer);
        IAccessControl(address(sbt)).renounceRole(bytes32(0), deployer);
        console.log("Deployer admin revoked");

        vm.stopBroadcast();

        console.log("\n=== Deployment Complete ===");
        console.log("Chain ID           :", block.chainid);
        console.log("USDT               :", usdtAddress);
        console.log("TreasuryMultisig   :", address(treasury));
        console.log("ScholarChainSBT    :", address(sbt));
        console.log("ScholarChainFactory:", address(factory));
        console.log("Admin (multisig)   :", address(treasury));
    }

    function _validateDeploymentConfig(
        uint256 requiredSigs,
        address[] memory treasurySigners
    ) internal pure {
        if (requiredSigs == 0 || requiredSigs > treasurySigners.length) {
            revert Deploy__InvalidRequiredSignatures();
        }
        for (uint256 i = 0; i < treasurySigners.length; i++) {
            if (treasurySigners[i] == address(0)) revert Deploy__InvalidRequiredSignatures();
            for (uint256 j = i + 1; j < treasurySigners.length; j++) {
                if (treasurySigners[i] == treasurySigners[j]) revert Deploy__DuplicateSigner();
            }
        }
    }
}
