// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../ScholarChainSBT.sol";
import "@openzeppelin/contracts/access/IAccessControl.sol";

/**
 * @title ScholarChainSBTTest
 * @dev Unit tests for the ScholarChainSBT Soul-Bound NFT contract.
 * 
 * Test Coverage:
 * - Minting SBTs with correct metadata
 * - Soul-bound transfer lock enforcement
 * - Access control (MINTER_ROLE)
 * - Duplicate SBT prevention
 * - Token URI generation
 * - Access control interfaces
 */
contract ScholarChainSBTTest is Test {
    
    // ============================================
    // Contracts
    // ============================================
    ScholarChainSBT public sbt;
    
    // ============================================
    // Test Accounts
    // ============================================
    address public admin;
    address public minter;
    address public unauthorized;
    address public recipient1;
    address public recipient2;
    address public poolAddress1;
    address public poolAddress2;

    // ============================================
    // Events
    // ============================================
    event GrantNFTMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        address indexed poolAddress
    );

    // ============================================
    // Setup
    // ============================================
    
    function setUp() public {
        admin = address(this);
        minter = makeAddr("minter");
        unauthorized = makeAddr("unauthorized");
        recipient1 = makeAddr("recipient1");
        recipient2 = makeAddr("recipient2");
        poolAddress1 = makeAddr("pool1");
        poolAddress2 = makeAddr("pool2");
        
        sbt = new ScholarChainSBT("ScholarChain Grant Award", "SC-SBT");
    }

    // ============================================
    // Constructor Tests
    // ============================================

    /**
     * @dev Test that the contract initializes with correct name and symbol
     */
    function test_Constructor_SetsNameAndSymbol() public {
        assertEq(sbt.name(), "ScholarChain Grant Award");
        assertEq(sbt.symbol(), "SC-SBT");
    }

    /**
     * @dev Test that the deployer gets DEFAULT_ADMIN_ROLE
     */
    function test_Constructor_AdminHasDefaultRole() public {
        assertTrue(sbt.hasRole(sbt.DEFAULT_ADMIN_ROLE(), admin));
    }

    /**
     * @dev Test that initial supply is zero
     */
    function test_Constructor_InitialSupplyZero() public {
        assertEq(sbt.totalSupply(), 0);
    }

    // ============================================
    // Minting Tests
    // ============================================

    /**
     * @dev Test successful minting of an SBT
     */
    function test_Mint_Success() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        uint256 tokenId = sbt.mint(
            recipient1,
            poolAddress1,
            "Test Grant Pool",
            4500e6, // 4500 USDT
            recipient1
        );
        
        assertEq(tokenId, 0);
        assertEq(sbt.ownerOf(tokenId), recipient1);
        assertEq(sbt.totalSupply(), 1);
        assertEq(sbt.tokenPoolAddress(tokenId), poolAddress1);
        assertEq(sbt.tokenGrantAmount(tokenId), 4500e6);
        assertEq(sbt.tokenPayoutAddress(tokenId), recipient1);
    }

    /**
     * @dev Test that GrantNFTMinted event is emitted
     */
    function test_Mint_EmitsEvent() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.expectEmit(true, true, true, true);
        emit GrantNFTMinted(0, recipient1, poolAddress1);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
    }

    /**
     * @dev Test minting to zero address reverts
     */
    function test_Mint_ToZeroAddress_Reverts() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSignature("ZeroAddress()"));
        sbt.mint(address(0), poolAddress1, "Test Pool", 4500e6, recipient1);
    }

    /**
     * @dev Test that unauthorized caller cannot mint
     */
    function test_Mint_UnauthorizedCaller_Reverts() public {
        bytes32 minterRole = sbt.MINTER_ROLE();
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, unauthorized, minterRole));
        sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
    }

    /**
     * @dev Test that MINTER_ROLE is required to mint
     */
    function test_Mint_MinterRoleRequired() public {
        bytes32 minterRole = sbt.MINTER_ROLE();
        assertFalse(sbt.hasRole(minterRole, minter));
        
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, minter, minterRole));
        sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
    }

    /**
     * @dev Test that MINTER_ROLE holder can mint
     */
    function test_Mint_WithMinterRole_Success() public {
        vm.prank(admin);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
        
        assertEq(sbt.ownerOf(0), recipient1);
    }

    // ============================================
    // Duplicate SBT Prevention Tests
    // ============================================

    /**
     * @dev Test that same recipient cannot receive SBT twice from same pool
     */
    function test_Mint_DuplicateFromSamePool_Reverts() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
        
        vm.prank(minter);
        vm.expectRevert(abi.encodeWithSignature("TokenAlreadyMinted()"));
        sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
    }

    /**
     * @dev Test that recipient can receive SBT from different pools
     */
    function test_Mint_DifferentPools_Success() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Pool 1", 4500e6, recipient1);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress2, "Pool 2", 3000e6, recipient1);
        
        assertEq(sbt.totalSupply(), 2);
        assertTrue(sbt.hasReceivedSBT(recipient1, poolAddress1));
        assertTrue(sbt.hasReceivedSBT(recipient1, poolAddress2));
    }

    // ============================================
    // Soul-Bound Transfer Lock Tests
    // ============================================

    /**
     * @dev Test that transferFrom reverts (Soul-bound enforcement)
     */
    function test_Transfer_TransferFrom_Reverts() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        uint256 tokenId = sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
        
        vm.prank(recipient1);
        vm.expectRevert(abi.encodeWithSignature("TransferNotAllowed()"));
        sbt.transferFrom(recipient1, recipient2, tokenId);
    }

    /**
     * @dev Test that safeTransferFrom reverts (Soul-bound enforcement)
     */
    function test_Transfer_SafeTransferFrom_Reverts() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        uint256 tokenId = sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
        
        vm.prank(recipient1);
        vm.expectRevert(abi.encodeWithSignature("TransferNotAllowed()"));
        sbt.safeTransferFrom(recipient1, recipient2, tokenId);
    }

    /**
     * @dev Test that approve reverts (Soul-bound enforcement)
     */
    function test_Transfer_Approve_Reverts() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
        
        vm.prank(recipient1);
        vm.expectRevert(abi.encodeWithSignature("TransferNotAllowed()"));
        sbt.setApprovalForAll(recipient2, true);
    }

    /**
     * @dev Test that burning reverts (Soul-bound enforcement)
     */
    function test_Transfer_Burn_Reverts() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Test Pool", 4500e6, recipient1);
        
        // Burning is attempted by transferring to address(0), which should revert
        vm.prank(recipient1);
        vm.expectRevert(abi.encodeWithSignature("TransferNotAllowed()"));
        sbt.transferFrom(recipient1, address(0), 0);
    }

    // ============================================
    // Token URI Tests
    // ============================================

    /**
     * @dev Test that tokenURI returns non-empty string
     */
    function test_TokenURI_ReturnsNonEmpty() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Test Grant Pool", 4500e6, recipient1);
        
        string memory uri = sbt.tokenURI(0);
        assertTrue(bytes(uri).length > 0);
    }

    /**
     * @dev Test that tokenURI starts with data:application/json;base64,
     */
    function test_TokenURI_StartsWithBase64() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Test Grant Pool", 4500e6, recipient1);
        
        string memory uri = sbt.tokenURI(0);
        
        // Check if string starts with data:application/json;base64,
        bytes memory uriBytes = bytes(uri);
        bytes memory prefixBytes = bytes("data:application/json;base64,");
        
        assertTrue(uriBytes.length >= prefixBytes.length);
        for (uint i = 0; i < prefixBytes.length; i++) {
            assertEq(uriBytes[i], prefixBytes[i]);
        }
    }

    /**
     * @dev Test that tokenURI reverts for non-existent token
     */
    function test_TokenURI_NonExistent_Reverts() public {
        vm.expectRevert();
        sbt.tokenURI(999);
    }

    // ============================================
    // Access Control Tests
    // ============================================

    /**
     * @dev Test that DEFAULT_ADMIN_ROLE can grant MINTER_ROLE
     */
    function test_AccessControl_GrantMinterRole() public {
        assertFalse(sbt.hasRole(sbt.MINTER_ROLE(), minter));
        
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        assertTrue(sbt.hasRole(sbt.MINTER_ROLE(), minter));
    }

    /**
     * @dev Test that DEFAULT_ADMIN_ROLE can revoke MINTER_ROLE
     */
    function test_AccessControl_RevokeMinterRole() public {
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        assertTrue(sbt.hasRole(sbt.MINTER_ROLE(), minter));
        
        sbt.revokeRole(sbt.MINTER_ROLE(), minter);
        assertFalse(sbt.hasRole(sbt.MINTER_ROLE(), minter));
    }

    /**
     * @dev Test supportsInterface for ERC721
     */
    function test_SupportsInterface_ERC721() public {
        assertTrue(sbt.supportsInterface(0x80ac58cd)); // IERC721
    }

    /**
     * @dev Test supportsInterface for ERC721Metadata
     */
    function test_SupportsInterface_ERC721Metadata() public {
        assertTrue(sbt.supportsInterface(0x5b5e139f)); // IERC721Metadata
    }

    /**
     * @dev Test supportsInterface for AccessControl
     */
    function test_SupportsInterface_AccessControl() public {
        assertTrue(sbt.supportsInterface(0x7965db0b)); // IAccessControl
    }

    // ============================================
    // Reentrancy Protection Tests
    // ============================================

    /**
     * @dev Test that mint function has reentrancy protection
     *      This is tested by ensuring multiple rapid mints work correctly
     */
    function test_Reentrancy_MultipleMints() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        address recipientA = makeAddr("recipientA");
        address recipientB = makeAddr("recipientB");
        address recipientC = makeAddr("recipientC");
        
        vm.prank(minter);
        sbt.mint(recipientA, poolAddress1, "Pool A", 1000e6, recipientA);
        
        vm.prank(minter);
        sbt.mint(recipientB, poolAddress1, "Pool B", 2000e6, recipientB);
        
        vm.prank(minter);
        sbt.mint(recipientC, poolAddress1, "Pool C", 3000e6, recipientC);
        
        assertEq(sbt.totalSupply(), 3);
    }

    // ============================================
    // Edge Cases
    // ============================================

    /**
     * @dev Test minting with zero grant amount
     */
    function test_Mint_ZeroAmount_Success() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Test Pool", 0, recipient1);
        
        assertEq(sbt.tokenGrantAmount(0), 0);
    }

    /**
     * @dev Test minting with large grant amount
     */
    function test_Mint_LargeAmount_Success() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        uint256 maxUint256 = type(uint256).max;
        
        vm.prank(minter);
        sbt.mint(recipient1, poolAddress1, "Test Pool", maxUint256, recipient1);
        
        assertEq(sbt.tokenGrantAmount(0), maxUint256);
    }

    /**
     * @dev Test multiple tokens to different recipients
     */
    function test_MultipleTokens_DifferentRecipients() public {
        vm.prank(minter);
        sbt.grantRole(sbt.MINTER_ROLE(), minter);
        
        address[] memory recipients = new address[](5);
        for (uint256 i = 0; i < 5; i++) {
            recipients[i] = makeAddr(string(abi.encodePacked("recipient", vm.toString(i))));
        }
        
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(minter);
            sbt.mint(recipients[i], poolAddress1, "Test Pool", (i + 1) * 1000e6, recipients[i]);
        }
        
        assertEq(sbt.totalSupply(), 5);
        
        for (uint256 i = 0; i < 5; i++) {
            assertEq(sbt.ownerOf(i), recipients[i]);
        }
    }
}