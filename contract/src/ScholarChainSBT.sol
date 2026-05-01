// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
/**
 * @title ScholarChainSBT
 * @dev Soul-Bound NFT contract for ScholarChain grant winners.
 *      Tokens are non-transferable - they can only be minted, never transferred or burned.
 * 
 * Architecture Reference: Section 3.3
 */
contract ScholarChainSBT is ERC721, ERC721URIStorage, AccessControl, ReentrancyGuard {
    
    // ============================================
    // Roles
    // ============================================
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // ============================================
    // Custom Errors
    // ============================================
    error TransferNotAllowed();
    error ZeroAddress();
    error TokenAlreadyMinted();

    // ============================================
    // Events
    // ============================================
    /**
     * @dev Emitted when an SBT is minted to a grant winner.
     * @param tokenId The ID of the minted token
     * @param recipient The address receiving the SBT
     * @param poolAddress The address of the GrantPool that awarded the grant
     */
    event GrantNFTMinted(
        uint256 indexed tokenId,
        address indexed recipient,
        address indexed poolAddress
    );

    // ============================================
    // State Variables
    // ============================================
    uint256 private _nextTokenId;
    
    // Token ID to pool address mapping for metadata
    mapping(uint256 => address) public tokenPoolAddress;
    
    // Token ID to grant amount (USDT, 6 decimals)
    mapping(uint256 => uint256) public tokenGrantAmount;
    
    // Token ID to payout address (where funds were sent)
    mapping(uint256 => address) public tokenPayoutAddress;
    
    // Track if recipient already has a token from a specific pool (prevent duplicates)
    mapping(address => mapping(address => bool)) public hasReceivedSBT;

    // ============================================
    // Constructor
    // ============================================
    
    /**
     * @dev Initializes the SBT contract with a name and symbol.
     * @param name The name of the NFT collection
     * @param symbol The symbol of the NFT collection
     */
    constructor(string memory name, string memory symbol) 
        ERC721(name, symbol) 
    {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // ============================================
    // External Functions
    // ============================================

    /**
     * @dev Mints a Soul-Bound NFT to a grant winner.
     * @param to The address to mint the token to (grant winner)
     * @param poolAddr The address of the GrantPool that awarded the grant
     * @param poolName The name of the grant pool
     * @param amount The grant amount in USDT (6 decimals)
     * @param payoutAddr The address where the grant funds were sent
     * 
     * Requirements:
     * - Caller must have MINTER_ROLE
     * - Recipient cannot be zero address
     * - Recipient must not have already received an SBT from this pool
     * 
     * Emits a {GrantNFTMinted} event.
     */
    function mint(
        address to,
        address poolAddr,
        string memory poolName,
        uint256 amount,
        address payoutAddr
    ) 
        external 
        onlyRole(MINTER_ROLE) 
        nonReentrant 
        returns (uint256) 
    {
        if (to == address(0)) revert ZeroAddress();
        if (hasReceivedSBT[to][poolAddr]) revert TokenAlreadyMinted();

        uint256 tokenId = _nextTokenId++;
        
        _safeMint(to, tokenId);
        
        // Store additional data for metadata
        tokenPoolAddress[tokenId] = poolAddr;
        tokenGrantAmount[tokenId] = amount;
        tokenPayoutAddress[tokenId] = payoutAddr;
        
        // Mark as received to prevent duplicate SBTs from same pool
        hasReceivedSBT[to][poolAddr] = true;
        
        // Generate and set the token URI with on-chain metadata
        _setTokenURI(tokenId, _generateTokenURI(tokenId, poolName, poolAddr, amount, payoutAddr));
        
        emit GrantNFTMinted(tokenId, to, poolAddr);
        
        return tokenId;
    }

    /**
     * @dev Returns the total number of tokens minted.
     */
    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    // ============================================
    // Soul-Bound Transfer Lock Overrides
    // ============================================

    /**
     * @dev See {ERC721-transferFrom}.
     * @dev Overridden to disable transfers - Soul-Bound tokens cannot be transferred.
     */
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) public override(ERC721, IERC721) {
        revert TransferNotAllowed();
    }

    /**
     * @dev See {ERC721-safeTransferFrom}.
     * @dev Overridden to disable transfers - Soul-Bound tokens cannot be transferred.
     *      Note: The 3-arg version is not virtual in OZ v5, so we only override the 4-arg version.
     *      The 3-arg version internally calls this 4-arg version, so it will also revert.
     */
    function safeTransferFrom(
        address from,
        address to,
        uint256 tokenId,
        bytes memory data
    ) public override(ERC721, IERC721) {
        revert TransferNotAllowed();
    }

    /**
     * @dev See {ERC721-approve}.
     * @dev Overridden to disable approvals - Soul-Bound tokens cannot have operators.
     */
    function approve(address to, uint256 tokenId) public override(ERC721, IERC721) {
        revert TransferNotAllowed();
    }

    /**
     * @dev See {ERC721-setApprovalForAll}.
     * @dev Overridden to disable approvals - Soul-Bound tokens cannot have operators.
     */
    function setApprovalForAll(address operator, bool approved) public override(ERC721, IERC721) {
        revert TransferNotAllowed();
    }

    // ============================================
    // Internal Functions
    // ============================================

    /**
     * @dev Generates on-chain Base64-encoded JSON metadata.
     *      No external URI dependency - metadata is immutable and permanently stored on-chain.
     * 
     * Metadata fields (per architecture Section 3.3.2):
     * - name: poolName + ' Grant Award'
     * - description: Static protocol description
     * - pool_address: Address of originating GrantPool
     * - grant_name: Name of the grant pool
     * - grant_amount: USDT amount awarded (6 decimals)
     * - winner_wallet: Recipient wallet address
     * - awarded_at: Unix timestamp of mint
     */
    function _generateTokenURI(
        uint256 tokenId,
        string memory poolName,
        address poolAddr,
        uint256 amount,
        address payoutAddr
    )
        internal
        view
        returns (string memory)
    {
        string memory json = string(abi.encodePacked(
            _jsonHeader(poolName, poolAddr, amount),
            _jsonFooter(poolName, poolAddr, amount, payoutAddr)
        ));
        return string(abi.encodePacked("data:application/json;base64,", _base64Encode(bytes(json))));
    }

    function _jsonHeader(
        string memory poolName,
        address poolAddr,
        uint256 amount
    ) private pure returns (string memory) {
        return string(abi.encodePacked(
            '{"name":"', poolName, ' Grant Award",',
            '"description":"ScholarChain Grant Award - A permanent on-chain record of your grant receipt. This Soul-Bound Token represents the achievement of being selected as a grant winner in the ScholarChain decentralized philanthropy protocol.",',
            '"attributes":[',
                '{"trait_type":"Pool Address","value":"', _toHexString(poolAddr), '"},',
                '{"trait_type":"Grant Amount","value":', Strings.toString(amount), '},',
                '{"trait_type":"Token Standard","value":"ERC-721 Soul-Bound"},',
                '{"trait_type":"Protocol","value":"ScholarChain"}',
            '],'
        ));
    }

    function _jsonFooter(
        string memory poolName,
        address poolAddr,
        uint256 amount,
        address payoutAddr
    ) private view returns (string memory) {
        return string(abi.encodePacked(
            '"pool_address":"', _toHexString(poolAddr), '",',
            '"grant_name":"', poolName, '",',
            '"grant_amount":', Strings.toString(amount), ',',
            '"winner_wallet":"', _toHexString(payoutAddr), '",',
            '"awarded_at":', Strings.toString(block.timestamp),
            '}'
        ));
    }

    // ============================================
    // Utility Functions
    // ============================================

    /**
     * @dev Converts an address to its hex string representation.
     */
    function _toHexString(address addr) internal pure returns (string memory) {
        bytes memory buffer = new bytes(42);
        buffer[0] = '0';
        buffer[1] = 'x';
        
        bytes memory alphabet = "0123456789abcdef";
        
        uint256 addrInt = uint256(uint160(addr));
        
        for (uint256 i = 0; i < 20; i++) {
            buffer[2 + i * 2] = alphabet[uint8((addrInt >> (152 - i * 8 + 4))) & 0xf];
            buffer[3 + i * 2] = alphabet[uint8((addrInt >> (152 - i * 8))) & 0xf];
        }
        
        return string(buffer);
    }



    /**
     * @dev Simple Base64 encoding implementation.
     */
    function _base64Encode(bytes memory data) internal pure returns (string memory) {
        bytes memory alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        
        uint256 length = data.length;
        uint256 remainder = length % 3;
        // forge-lint: disable-next-line(divide-before-multiply)
        uint256 resultLength = ((length + 2) / 3) * 4; // ceil(length/3)*4 — standard base64 formula
        
        bytes memory result = new bytes(resultLength);
        uint256 resultIndex;
        
        for (uint256 i = 0; i < length - remainder; i += 3) {
            uint256 value = (uint256(uint8(data[i])) << 16) | 
                           (uint256(uint8(data[i + 1])) << 8) | 
                           uint8(data[i + 2]);
            
            result[resultIndex++] = alphabet[(value >> 18) & 0x3F];
            result[resultIndex++] = alphabet[(value >> 12) & 0x3F];
            result[resultIndex++] = alphabet[(value >> 6) & 0x3F];
            result[resultIndex++] = alphabet[value & 0x3F];
        }
        
        if (remainder == 1) {
            uint256 value = uint256(uint8(data[length - 1]));
            result[resultIndex++] = alphabet[(value >> 2) & 0x3F];
            result[resultIndex++] = alphabet[(value << 4) & 0x3F];
            result[resultIndex++] = '=';
            result[resultIndex++] = '=';
        } else if (remainder == 2) {
            uint256 value = (uint256(uint8(data[length - 2])) << 8) | uint8(data[length - 1]);
            result[resultIndex++] = alphabet[(value >> 10) & 0x3F];
            result[resultIndex++] = alphabet[(value >> 4) & 0x3F];
            result[resultIndex++] = alphabet[(value << 2) & 0x3F];
            result[resultIndex++] = '=';
        }
        
        return string(result);
    }

    // ============================================
    // Required Overrides
    // ============================================

    /**
     * @dev See {IERC165-supportsInterface}.
     */
    function supportsInterface(bytes4 interfaceId) 
        public 
        view 
        override(ERC721, ERC721URIStorage, AccessControl) 
        returns (bool) 
    {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @dev See {ERC721URIStorage-tokenURI}.
     */
    function tokenURI(uint256 tokenId) 
        public 
        view 
        override(ERC721, ERC721URIStorage) 
        returns (string memory) 
    {
        return super.tokenURI(tokenId);
    }
}