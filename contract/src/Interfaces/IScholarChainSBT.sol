// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IScholarChainSBT
 * @dev Interface for the ScholarChain Soul-Bound Token contract.
 * 
 * This interface defines the core functionality for minting SBTs
 * to grant winners in the ScholarChain protocol.
 */
interface IScholarChainSBT {
    
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
    // Functions
    // ============================================

    /**
     * @dev Mints a Soul-Bound NFT to a grant winner.
     * @param to The address to mint the token to (grant winner)
     * @param poolAddr The address of the GrantPool that awarded the grant
     * @param poolName The name of the grant pool
     * @param amount The grant amount in USDT (6 decimals)
     * @param payoutAddr The address where the grant funds were sent
     * @return tokenId The ID of the minted token
     */
    function mint(
        address to,
        address poolAddr,
        string memory poolName,
        uint256 amount,
        address payoutAddr
    ) external returns (uint256);

    /**
     * @dev Returns the total number of tokens minted.
     * @return The total supply of SBTs
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the pool address associated with a token.
     * @param tokenId The ID of the token
     * @return The address of the GrantPool that awarded the grant
     */
    function tokenPoolAddress(uint256 tokenId) external view returns (address);

    /**
     * @dev Returns the grant amount associated with a token.
     * @param tokenId The ID of the token
     * @return The grant amount in USDT (6 decimals)
     */
    function tokenGrantAmount(uint256 tokenId) external view returns (uint256);

    /**
     * @dev Returns the payout address associated with a token.
     * @param tokenId The ID of the token
     * @return The address where the grant funds were sent
     */
    function tokenPayoutAddress(uint256 tokenId) external view returns (address);

    /**
     * @dev Checks if a recipient has already received an SBT from a specific pool.
     * @param recipient The address to check
     * @param poolAddr The pool address to check
     * @return True if the recipient has already received an SBT from this pool
     */
    function hasReceivedSBT(address recipient, address poolAddr) external view returns (bool);
}