// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import {ScholarChainFactory} from "../src/ScholarChainFactory.sol";
import {GrantPool} from "../src/GrantPool.sol";
import {FieldType, FieldDefinition} from "../src/Types/GrantPoolTypes.sol";
import {MockERC20, MockSBT, Fixtures} from "./Helpers.sol";

import {
    Factory__ZeroAddress, Factory__NotAContract, Factory__EmptyPoolName,
    Factory__ZeroCID, Factory__SubmissionStartInPast, Factory__SubmissionWindowTooShort,
    Factory__ReviewDurationTooShort, Factory__TooFewSigners, Factory__TooManySigners,
    Factory__DuplicateOrZeroSigner, Factory__InvalidFeeBps,
    Factory__EmptyFieldDefinitions, Factory__TooManyFields
} from "../src/ScholarChainFactory.sol";

// ─────────────────────────────────────────────────────────────────────────────
// ScholarChainFactory Test Suite
// Tests pool creation, parameter validation, admin functions, and pause logic.
// ─────────────────────────────────────────────────────────────────────────────
contract ScholarChainFactoryTest is Test {

    ScholarChainFactory public factory;
    MockERC20           public usdt;
    MockSBT             public sbt;

    address public admin    = address(this);
    address public treasury = makeAddr("treasury");
    address public creator  = makeAddr("creator");

    address[] public signers;

    uint256 constant T0     = 1_000_000;
    uint256 constant FEE    = 1000;

    // mirrors Factory events
    event PoolCreated(address indexed poolAddress, address indexed creator, string poolName);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event SBTContractUpdated(address indexed newSBT);

    function setUp() public {
        vm.warp(T0);
        usdt = new MockERC20();
        sbt  = new MockSBT();

        factory = new ScholarChainFactory(treasury, address(sbt), FEE);

        signers = new address[](3);
        for (uint256 i = 0; i < 3; i++) {
            signers[i] = makeAddr(string(abi.encodePacked("signer", vm.toString(i))));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    function _params() internal view returns (ScholarChainFactory.CreatePoolParams memory) {
        return ScholarChainFactory.CreatePoolParams({
            poolName:             "Test Pool",
            criteriaMetadataCID:  bytes32("QmCID"),
            submissionStart:      block.timestamp + 1 days,
            submissionEnd:        block.timestamp + 8 days,
            reviewDuration:       7 days,
            initialSigners:       signers,
            usdtTokenAddress:     address(usdt),
            fieldDefinitions:     Fixtures.twoFields()
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ══════════════════════════════════════════════════════════════════════════

    function test_Constructor_StoresState() public {
        assertEq(factory.treasury(),         treasury);
        assertEq(factory.sbtContract(),      address(sbt));
        assertEq(factory.TREASURY_FEE_BPS(), FEE);
        assertTrue(factory.hasRole(factory.DEFAULT_ADMIN_ROLE(), admin));
    }

    function test_Constructor_RevertZeroTreasury() public {
        vm.expectRevert(Factory__ZeroAddress.selector);
        new ScholarChainFactory(address(0), address(sbt), FEE);
    }

    function test_Constructor_RevertZeroSBT() public {
        vm.expectRevert(Factory__NotAContract.selector);
        new ScholarChainFactory(treasury, address(0), FEE);
    }

    function test_Constructor_RevertSBTNotContract() public {
        address eoa = makeAddr("eoa");
        vm.expectRevert(Factory__NotAContract.selector);
        new ScholarChainFactory(treasury, eoa, FEE);
    }

    function test_Constructor_RevertZeroFee() public {
        vm.expectRevert(Factory__InvalidFeeBps.selector);
        new ScholarChainFactory(treasury, address(sbt), 0);
    }

    function test_Constructor_RevertFeeTooHigh() public {
        vm.expectRevert(Factory__InvalidFeeBps.selector);
        new ScholarChainFactory(treasury, address(sbt), 10_001);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // CREATE POOL
    // ══════════════════════════════════════════════════════════════════════════

    function test_CreatePool_DeploysPool() public {
        vm.expectEmit(false, true, false, true);
        emit PoolCreated(address(0), creator, "Test Pool");

        vm.prank(creator);
        address poolAddr = factory.createPool(_params());

        assertTrue(poolAddr != address(0));
        assertTrue(poolAddr.code.length > 0);
    }

    function test_CreatePool_PoolHasCorrectParams() public {
        vm.prank(creator);
        address poolAddr = factory.createPool(_params());
        GrantPool pool = GrantPool(poolAddr);

        assertEq(pool.poolName(),         "Test Pool");
        assertEq(pool.creator(),           creator);
        assertEq(address(pool.usdt()),     address(usdt));
        assertEq(pool.treasury(),          treasury);
        assertEq(pool.TREASURY_FEE_BPS(), FEE);
    }

    function test_CreatePool_TrackedInAllPools() public {
        vm.prank(creator);
        address poolAddr = factory.createPool(_params());

        address[] memory all = factory.getAllPools();
        assertEq(all.length, 1);
        assertEq(all[0], poolAddr);
    }

    function test_CreatePool_TrackedByCreator() public {
        vm.prank(creator);
        address poolAddr = factory.createPool(_params());

        address[] memory byCreator = factory.getPoolsByCreator(creator);
        assertEq(byCreator.length, 1);
        assertEq(byCreator[0], poolAddr);
    }

    function test_CreatePool_MultiplePools() public {
        vm.prank(creator); factory.createPool(_params());
        vm.prank(creator); factory.createPool(_params());

        assertEq(factory.getAllPools().length, 2);
        assertEq(factory.getPoolsByCreator(creator).length, 2);
    }

    // ── Param Validation ──────────────────────────────────────────────────────

    function test_CreatePool_RevertEmptyName() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.poolName = "";
        vm.prank(creator);
        vm.expectRevert(Factory__EmptyPoolName.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertZeroCID() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.criteriaMetadataCID = bytes32(0);
        vm.prank(creator);
        vm.expectRevert(Factory__ZeroCID.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertStartInPast() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.submissionStart = block.timestamp - 1;
        vm.prank(creator);
        vm.expectRevert(Factory__SubmissionStartInPast.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertWindowTooShort() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.submissionEnd = p.submissionStart + 12 hours;
        vm.prank(creator);
        vm.expectRevert(Factory__SubmissionWindowTooShort.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertReviewTooShort() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.reviewDuration = 12 hours;
        vm.prank(creator);
        vm.expectRevert(Factory__ReviewDurationTooShort.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertTooFewSigners() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        address[] memory few = new address[](2);
        few[0] = makeAddr("s1"); few[1] = makeAddr("s2");
        p.initialSigners = few;
        vm.prank(creator);
        vm.expectRevert(Factory__TooFewSigners.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertTooManySigners() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        address[] memory many = new address[](21);
        for (uint256 i = 0; i < 21; i++) many[i] = makeAddr(vm.toString(i));
        p.initialSigners = many;
        vm.prank(creator);
        vm.expectRevert(Factory__TooManySigners.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertDuplicateSigner() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.initialSigners[1] = p.initialSigners[0]; // duplicate
        vm.prank(creator);
        vm.expectRevert(Factory__DuplicateOrZeroSigner.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertZeroSignerAddress() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.initialSigners[0] = address(0);
        vm.prank(creator);
        vm.expectRevert(Factory__DuplicateOrZeroSigner.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertUSDTZeroAddress() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.usdtTokenAddress = address(0);
        vm.prank(creator);
        vm.expectRevert(Factory__ZeroAddress.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertUSDTNotContract() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.usdtTokenAddress = makeAddr("eoa"); // EOA, no code
        vm.prank(creator);
        vm.expectRevert(Factory__NotAContract.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertEmptyFieldDefinitions() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        p.fieldDefinitions = new FieldDefinition[](0);
        vm.prank(creator);
        vm.expectRevert(Factory__EmptyFieldDefinitions.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertTooManyFields() public {
        ScholarChainFactory.CreatePoolParams memory p = _params();
        FieldDefinition[] memory big = new FieldDefinition[](11);
        for (uint256 i = 0; i < 11; i++) big[i] = FieldDefinition(FieldType.TEXT, "field", true);
        p.fieldDefinitions = big;
        vm.prank(creator);
        vm.expectRevert(Factory__TooManyFields.selector);
        factory.createPool(p);
    }

    function test_CreatePool_RevertWhenPaused() public {
        factory.pause();
        vm.prank(creator);
        vm.expectRevert();
        factory.createPool(_params());
    }

    // ══════════════════════════════════════════════════════════════════════════
    // ADMIN FUNCTIONS
    // ══════════════════════════════════════════════════════════════════════════

    function test_SetTreasury_UpdatesAddress() public {
        address newTreasury = makeAddr("newTreasury");
        vm.expectEmit(true, true, false, false);
        emit TreasuryUpdated(treasury, newTreasury);
        factory.setTreasury(newTreasury);
        assertEq(factory.treasury(), newTreasury);
    }

    function test_SetTreasury_RevertZeroAddress() public {
        vm.expectRevert(Factory__ZeroAddress.selector);
        factory.setTreasury(address(0));
    }

    function test_SetTreasury_RevertNonAdmin() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.setTreasury(makeAddr("x"));
    }

    function test_SetSBTContract_UpdatesAddress() public {
        MockSBT newSbt = new MockSBT();
        vm.expectEmit(true, false, false, false);
        emit SBTContractUpdated(address(newSbt));
        factory.setSBTContract(address(newSbt));
        assertEq(factory.sbtContract(), address(newSbt));
    }

    function test_SetSBTContract_RevertNotContract() public {
        vm.expectRevert(Factory__NotAContract.selector);
        factory.setSBTContract(makeAddr("eoa"));
    }

    function test_SetSBTContract_RevertNonAdmin() public {
        MockSBT newSbt = new MockSBT();
        vm.prank(creator);
        vm.expectRevert();
        factory.setSBTContract(address(newSbt));
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PAUSE / UNPAUSE
    // ══════════════════════════════════════════════════════════════════════════

    function test_Pause_OnlyAdmin() public {
        vm.prank(creator);
        vm.expectRevert();
        factory.pause();
    }

    function test_PauseUnpause_AdminCanToggle() public {
        factory.pause();
        factory.unpause();
        vm.prank(creator);
        address poolAddr = factory.createPool(_params());
        assertTrue(poolAddr != address(0));
    }
}
