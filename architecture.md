# SCHOLARCHAIN
Decentralized Philanthropic Grant Protocol


## TECHNICAL ARCHITECTURE DOCUMENT
Version 1.0  |  April 2025

CONFIDENTIAL — INTERNAL USE ONLY
Smart Contract Engineering Team

---

## 1. Project Overview

ScholarChain is a fully on-chain, decentralised grant distribution protocol built on EVM-compatible networks. It enables philanthropists and donors to create transparent, criteria-driven grant pools funded with USDT. Benefactors submit proposals that are reviewed and voted on by designated signers, and winners automatically receive funds along with a permanent Soul-Bound NFT (SBT) as proof of the grant award.

### 1.1 Core Protocol Goals

- Permissionless grant pool creation by any donor
- Multi-donor contributions to a single pool with proportional accounting
- Transparent, quorum-based voting by designated signers
- Automated, pull-based fund distribution to verified benefactors
- Immutable on-chain proof of grant receipt via Soul-Bound NFTs
- 10% protocol treasury fee on all distributed pools
- Emergency pause capability by the default admin

### 1.2 Technology Stack

| Component | Technology |
|-----------|------------|
| Blockchain | EVM-Compatible (e.g. Ethereum / Polygon) |
| Smart Contract Language | Solidity ^0.8.24 |
| Access Control | OpenZeppelin AccessControl |
| Token Standard | ERC-20 (USDT via SafeERC20) |
| NFT Standard | ERC-721 Soul-Bound (transfer-locked) |
| Document Storage | IPFS / Sonata (CIDv0 as bytes32) |
| Contract Pattern | Factory + Pool + SBT (non-upgradeable) |
| Treasury | Multisig Smart Contract Wallet |

---

## 2. System Architecture

### 2.1 Contract Overview

| Contract | Role | Deployed By |
|----------|------|-------------|
| ScholarChainFactory | Deploys grant pools; holds protocol config (treasury address, fee %) | Protocol deployer (DEFAULT_ADMIN_ROLE) |
| GrantPool | Manages donations, proposals, voting, fund distribution | Factory (on createPool call) |
| ScholarChainSBT | Global ERC-721 soul-bound NFT; minted per winner per pool | Protocol deployer |
| Treasury Multisig | Receives 10% protocol fee; externally managed | Protocol team |

### 2.2 High-Level Architecture Diagram

```
[Donor] ──createPool()──► [ScholarChainFactory] ──deploys──► [GrantPool]

[Donor(s)] ──donate()──────────────────────────────────────────────►

[PoolCreator] ──addSigner() / editCriteria() / topUp() / cancel()──►

[Benefactor] ──submitProposal(ipfsCID)──────────────────────────────►

[Signer] ──vote(benefactorAddr, approve)────────────────────────────►

[Winner] ◄──claimGrant()────────────────────────────────────────────

[ScholarChainSBT] ◄──mintSBT()──────────────────────────────────────

[Treasury] ◄──10% fee transfer──────────────────────────────────────
```

### 2.3 Pool Lifecycle States

| State | Description | Who Triggers |
|-------|-------------|--------------|
| PENDING | Pool created, submission start time not yet reached. Donations accepted. | Automatic (time-based) |
| ACTIVE | Submission window open. Donations accepted, proposals accepted, signers vote. | Automatic (time-based) |
| REVIEW | Submission closed. Review phase in progress. No new proposals or votes. | Automatic (time-based) |
| DISTRIBUTING | Review phase elapsed. Winners may claim funds. Treasury fee sent. | First claim or manual trigger |
| CLOSED | All claims processed or forfeited. No further actions permitted. | Protocol (post-distribution) |
| CANCELLED | Creator cancelled before ACTIVE phase began. Donors refunded. | Pool creator |

**Important: State Transitions**

States are derived from block.timestamp comparisons against stored timestamps — there is no mutable state variable for pool phase. This eliminates a class of state manipulation bugs. The CANCELLED state is the only exception and is stored as a boolean flag.

---

## 3. Contract Specifications

### 3.1 ScholarChainFactory

The factory is the protocol's entry point. It deploys GrantPool instances and manages global configuration such as the treasury address and SBT contract reference.

#### 3.1.1 State Variables

| Variable | Type | Description |
|----------|------|-------------|
| sbtContract | address | Address of the deployed ScholarChainSBT contract |
| treasury | address | Multisig treasury address — receives 10% protocol fee |
| TREASURY_FEE_BPS | uint256 constant | 1000 (10% in basis points, immutable) |
| allPools | address[] | Registry of all deployed GrantPool addresses |
| poolsByCreator | mapping(address => address[]) | Pools grouped by creator address |

#### 3.1.2 Functions

| Function | Access | Description |
|----------|--------|-------------|
| createPool(params) | Public | Deploys a new GrantPool. Emits PoolCreated. |
| setTreasury(address) | DEFAULT_ADMIN_ROLE | Updates the treasury multisig address. |
| setSBTContract(address) | DEFAULT_ADMIN_ROLE | Updates the SBT contract reference. |
| getAllPools() | View | Returns full array of deployed pool addresses. |
| getPoolsByCreator(address) | View | Returns pools created by a given address. |
| pause() / unpause() | DEFAULT_ADMIN_ROLE | Emergency pause across new pool creation. |

#### 3.1.3 CreatePool Parameters

| Parameter | Type | Validation |
|-----------|------|------------|
| poolName | string | Non-empty |
| criteriaMetadataCID | bytes32 | Non-zero |
| submissionStart | uint256 | Must be > block.timestamp |
| submissionEnd | uint256 | Must be > submissionStart + 1 day |
| reviewDuration | uint256 | Must be >= 1 day (86400 seconds) |
| initialSigners | address[] | Must have >= 3 unique, non-zero addresses |
| usdtTokenAddress | address | Non-zero, checked for ERC20 interface |

### 3.2 GrantPool

The GrantPool contract is the core of the protocol. Each instance manages a single grant round — handling donations, proposals, voting, fund distribution, and triggering SBT minting.

#### 3.2.1 Key State Variables

| Variable | Type | Description |
|----------|------|-------------|
| poolName | string | Human-readable name of the grant pool |
| criteriaMetadataCID | bytes32 | IPFS CID of the criteria document (updatable pre-submission) |
| creator | address | Address of the pool creator (has creator privileges) |
| submissionStart | uint256 | UNIX timestamp: when submission opens |
| submissionEnd | uint256 | UNIX timestamp: when submission closes |
| reviewEnd | uint256 | submissionEnd + reviewDuration |
| isCancelled | bool | True if creator cancelled the pool |
| signerLockedAt | uint256 | Timestamp when signer list was locked (= submissionStart) |
| totalDeposited | uint256 | Cumulative USDT donated (excluding refunds) |
| donations | mapping(address => uint256) | Per-donor USDT contribution tracking |
| donors | address[] | List of unique donor addresses for refund iteration |
| proposals | mapping(address => Proposal) | Benefactor address → Proposal struct |
| votes | mapping(address => mapping(address => bool)) | signer → benefactor → hasVoted |
| approvalCount | mapping(address => uint256) | Benefactor approval vote count |
| winners | address[] | Addresses that reached 70% quorum |
| isWinner | mapping(address => bool) | Quick lookup for winner status |
| hasClaimed | mapping(address => bool) | Tracks pull-payment claims |
| distributionAmount | uint256 | Per-winner share (set at distribution phase entry) |
| signers | address[] | List of signer addresses (locked at submissionStart) |
| isSigner | mapping(address => bool) | Quick lookup for signer status |

#### 3.2.2 Proposal Struct

```solidity
struct Proposal {
    bytes32  documentCID;        // IPFS CID of supporting documents
    address  payoutAddress;      // Address to receive grant funds
    uint256  submittedAt;        // Block timestamp of submission
    bool     exists;             // Guard against double-submission
}
```

#### 3.2.3 Access Roles (OpenZeppelin AccessControl)

| Role | Holder | Privileges |
|------|--------|------------|
| DEFAULT_ADMIN_ROLE | Factory deployer (EOA or multisig) | Pause/unpause; update treasury & SBT; grant/revoke roles globally |
| SIGNER_ROLE (pool-level) | Designated signers per pool | Cast votes on benefactor proposals within the pool |
| Creator (address stored) | Pool creator | topUpPool, editCriteria, addSigner (pre-lock), cancelPool |

**Note on SIGNER_ROLE**

SIGNER_ROLE is granted and checked at the GrantPool level using OpenZeppelin's AccessControl. Each pool maintains its own role registry. The DEFAULT_ADMIN_ROLE at the factory level does NOT automatically confer SIGNER_ROLE on any pool.

#### 3.2.4 Core Functions

**Donation Functions**

| Function | State Required | Description |
|----------|----------------|-------------|
| donate(uint256 amount) | PENDING or ACTIVE | Transfer USDT from donor to pool. Records donor share. Emits DonationReceived. |
| topUpPool(uint256 amount) | PENDING or ACTIVE, caller = creator | Creator top-up. Treated identically to donate() for accounting purposes. |

**Pool Management Functions (Creator Only)**

| Function | State Required | Description |
|----------|----------------|-------------|
| editCriteria(bytes32 newCID) | PENDING (before submissionStart) | Replaces criteriaMetadataCID. Emits CriteriaUpdated. |
| addSigner(address signer) | Before submissionStart (signer lock) | Grants SIGNER_ROLE to address. Appends to signers[]. Emits SignerAdded. |
| cancelPool() | PENDING only (before submissionStart) | Sets isCancelled = true. Emits PoolCancelled. Triggers proportional donor refunds. |

**Cancellation Constraint**

A pool can ONLY be cancelled while in PENDING state (i.e. before submissionStart). Once submission has opened, the pool cannot be cancelled — this protects benefactors who have already submitted proposals in good faith.

**Proposal Functions**

| Function | State Required | Description |
|----------|----------------|-------------|
| submitProposal(bytes32 docCID, address payoutAddr) | ACTIVE | Benefactor submits proposal. One per address. Stores Proposal struct. Emits ProposalSubmitted. |

**Voting Functions**

| Function | State Required | Description |
|----------|----------------|-------------|
| vote(address benefactor, bool approve) | ACTIVE | Signer casts a vote. One vote per signer per benefactor. Cannot be changed. If approve=true and quorum reached, benefactor added to winners[]. Emits VoteCast, BenefactorApproved (if quorum). |

**Quorum Logic**

```
quorumThreshold = ceil(signers.length * 70 / 100)
```

Once approvalCount[benefactor] >= quorumThreshold, the benefactor is immediately added to winners[] and isWinner[benefactor] = true. No further votes are processed for that benefactor.

**Distribution Functions**

| Function | State Required | Description |
|----------|----------------|-------------|
| enterDistributionPhase() | REVIEW elapsed, not yet entered | Callable by anyone. Transfers 10% fee to treasury. Sets distributionAmount = remainingFunds / winners.length. If winners.length == 0, distributes 90% back to donors proportionally and sends 10% to treasury. Emits DistributionPhaseEntered. |
| claimGrant() | DISTRIBUTING, caller = winner, not yet claimed | Pull payment. Transfers distributionAmount in USDT to winner's payoutAddress. Triggers SBT mint. Emits GrantClaimed. |
| claimRefund() | CANCELLED | Donor reclaims their proportional donation. Emits RefundClaimed. |

### 3.3 ScholarChainSBT

A single globally-deployed ERC-721 contract that issues Soul-Bound (non-transferable) NFTs to grant winners. The token URI is generated fully on-chain using Base64-encoded JSON.

#### 3.3.1 Soul-Bound Enforcement

**Transfer Lock**

ScholarChainSBT overrides _beforeTokenTransfer() to revert on any transfer where from != address(0). This means tokens can be minted but never transferred or burned. The override applies to all transfer paths including safeTransferFrom, transferFrom, and approve.

#### 3.3.2 On-Chain Token Metadata

The tokenURI() function returns a Base64-encoded JSON data URI. No external URI dependency. Metadata is immutable and permanently stored on-chain.

| Metadata Field | Source | Description |
|----------------|--------|-------------|
| name | poolName + ' Grant Award' | Human-readable NFT title |
| description | Static string | Protocol description text |
| pool_address | address(grantPool) | Address of the originating GrantPool |
| grant_name | poolName | Name of the grant pool |
| grant_amount | distributionAmount (USDT, 6 decimals) | USDT amount awarded |
| winner_wallet | payoutAddress | Recipient wallet address |
| awarded_at | block.timestamp | Unix timestamp of mint |

#### 3.3.3 Minting Access

Only addresses holding MINTER_ROLE can call mint(). The MINTER_ROLE is granted exclusively to deployed GrantPool contracts by the factory at deployment time.

---

## 4. Team Task Allocation

The following task breakdown assigns clear ownership to each of the six engineers. Each engineer owns their contract module end-to-end: implementation, events, access control, and unit tests.

| ID | Engineer | Primary Module | Key Deliverable |
|----|----------|----------------|-----------------|
| TM-01 | Engineer 1 | Factory & Protocol Config | ScholarChainFactory.sol |
| TM-02 | Engineer 2 | Donation, Pool Management & Cancellation | GrantPool.sol |
| TM-03 | Engineer 3 | Proposal Submission & IPFS Integration | submitProposal(bytes32 docCID, address payoutAddr) |
| TM-04 | Engineer 4 | Voting Engine & Quorum Logic | vote(address benefactor, bool approve) |
| TM-05 | Engineer 5 | Fund Distribution & Treasury | enterDistributionPhase() |
| TM-06 | Engineer 6 | Soul-Bound NFT & Security / QA | ScholarChainSBT.sol |

### TM-06 — Engineer 6 — Soul-Bound NFT & Security / QA

1. ScholarChainSBT.sol — ERC-721 with _beforeTokenTransfer transfer lock override
2. MINTER_ROLE access control — granted to GrantPool contracts only
3. On-chain tokenURI() — Base64-encoded JSON with pool_address, grant_name, grant_amount, winner_wallet, awarded_at
4. mint(address to, address poolAddr, string poolName, uint256 amount, address payoutAddr) function
5. Full security audit checklist: reentrancy, integer overflow, access control, SafeERC20, timestamp manipulation
6. Slither / Mythril static analysis integration in CI pipeline
7. Integration test suite: full end-to-end pool lifecycle (create → donate → propose → vote → distribute → claim → SBT)
8. Emergency pause integration test across Factory and GrantPool
9. Gas benchmarking report for all public functions
10. Deployment checklist and mainnet readiness review

---

## 5. Security Considerations

### 5.1 Reentrancy Protection

- ReentrancyGuard (OpenZeppelin) applied to: claimGrant(), claimRefund(), enterDistributionPhase(), donate()
- All state mutations (hasClaimed, totalDeposited) occur BEFORE external token transfers (Checks-Effects-Interactions pattern)
- SBT mint is called AFTER the token transfer in claimGrant() to avoid reentrancy via ERC721 callbacks

### 5.2 Token Safety (USDT)

- All ERC-20 interactions use SafeERC20.safeTransfer() and SafeERC20.safeTransferFrom()
- USDT has no return value on transfer — SafeERC20 handles this without revert
- No approval assumptions; pool pulls exact amounts approved by donors

### 5.3 Access Control

- OpenZeppelin AccessControl used for SIGNER_ROLE and DEFAULT_ADMIN_ROLE
- Creator privileges stored as address — not a role — to scope actions to the deploying donor only
- Signer list is permanently locked at submissionStart; no additions possible after this point
- Factory-level DEFAULT_ADMIN_ROLE should be held by a multisig, not an EOA

### 5.4 Timestamp Considerations

- All durations enforced with minimum bounds (>= 1 day) to mitigate miner timestamp manipulation impact
- submissionStart must be > block.timestamp at creation time to prevent immediate submission period abuse
- No economic outcome changes within any 15-second window — timestamps are safe for this use case

### 5.5 Integer Arithmetic

- Solidity ^0.8.x built-in overflow/underflow protection
- Quorum: computed as (signers.length * 70 + 99) / 100 for ceiling division without floating point
- Distribution: remainingFunds / winners.length — dust remainder stays in contract until pool CLOSED, then swept to treasury

### 5.6 Emergency Pause

- OpenZeppelin Pausable applied to Factory (blocks new pool creation) and GrantPool (blocks donations, proposals, votes, claims)
- Pause is callable only by DEFAULT_ADMIN_ROLE
- Pausing does NOT affect already-distributed funds or completed claims

---

## 6. Event Reference

All state-changing operations emit events. Indexed parameters enable efficient off-chain filtering for the frontend and signer review dashboard.

### 6.1 ScholarChainFactory Events

| Event | Indexed Parameters | Description |
|-------|-------------------|-------------|
| PoolCreated | poolAddress, creator | Emitted when a new GrantPool is deployed |
| TreasuryUpdated | oldTreasury, newTreasury | Treasury address changed |
| SBTContractUpdated | newSBT | SBT contract reference changed |

### 6.2 GrantPool Events

| Event | Indexed Parameters | Description |
|-------|-------------------|-------------|
| DonationReceived | donor, amount | USDT donation recorded |
| CriteriaUpdated | newCID | Criteria metadata CID replaced |
| SignerAdded | signer | New signer granted SIGNER_ROLE |
| PoolCancelled | — | Pool cancelled by creator |
| ProposalSubmitted | benefactor, documentCID | Benefactor proposal stored |
| VoteCast | signer, benefactor, approved | Signer vote recorded |
| BenefactorApproved | benefactor | Benefactor reached 70% quorum |
| DistributionPhaseEntered | totalWinners, perWinnerAmount | Review phase elapsed, distribution ready |
| ProtocolFeeTransferred | treasury, amount | 10% fee sent to treasury |
| GrantClaimed | winner, payoutAddress, amount | Winner pulled their grant funds |
| RefundClaimed | donor, amount | Donor reclaimed funds from cancelled pool |
| PoolClosed | — | Pool entered final CLOSED state |

### 6.3 ScholarChainSBT Events

| Event | Indexed Parameters | Description |
|-------|-------------------|-------------|
| GrantNFTMinted | tokenId, recipient, poolAddress | SBT minted to grant winner |

---

## 7. Gas Optimisation Notes

- bytes32 for IPFS CIDs instead of string — saves ~20,000 gas per storage write
- mapping(address => bool) for isWinner and isSigner — O(1) lookup, avoids array iteration in hot paths
- mapping(address => mapping(address => bool)) for votes — accepted trade-off over bitmap for code clarity
- Pull payment pattern (claimGrant) — eliminates gas bomb risk of looping over winners[] in one transaction
- Quorum check on every approve vote using cached signers.length — no re-count loops
- distributionAmount calculated once in enterDistributionPhase() — not recalculated per claim
- Avoid storing redundant data — payoutAddress stored in Proposal struct, re-read at claim time
- Custom errors (error Unauthorized(); error InvalidState();) instead of require strings — saves ~50 gas per revert

---

## 8. Deployment Sequence

Contracts must be deployed in the following order to satisfy constructor dependencies:

1. Deploy the Treasury Multisig wallet (e.g. Gnosis Safe). Note the deployed address.
2. Deploy ScholarChainSBT.sol. Note the deployed address.
3. Deploy ScholarChainFactory.sol, passing: treasuryAddress, sbtContractAddress as constructor args.
4. Call factory.setSBTContract(sbtAddress) if not set in constructor.
5. Grant MINTER_ROLE on ScholarChainSBT to the factory, or have the factory grant it to each deployed pool on createPool().
6. Transfer DEFAULT_ADMIN_ROLE on the factory to the team multisig. Renounce EOA admin.
7. Verify all contracts on Etherscan / the target block explorer.
8. Run the full integration test suite against the deployed contracts on testnet before mainnet.

**Deployment Checklist**

- [ ] Treasury multisig has >= 2/3 signers confirmed
- [ ] DEFAULT_ADMIN_ROLE held by multisig, not EOA
- [ ] MINTER_ROLE on SBT granted to factory
- [ ] All contracts verified on block explorer
- [ ] Slither/Mythril analysis clean
- [ ] Full integration test suite passing on testnet
- [ ] Gas benchmarks reviewed and within acceptable limits

---

## 9. Appendix — Full Pool Lifecycle Example

| Step | Action |
|------|--------|
| 1. Create Pool | Donor calls factory.createPool() with poolName='CS Grant 2025', 3 signers, submissionStart=T+2days, submissionEnd=T+9days, reviewDuration=3days |
| 2. Donations | Donor A donates 5,000 USDT. Donor B donates 3,000 USDT. Creator tops up 2,000 USDT. totalDeposited = 10,000 USDT |
| 3. Add Signer | Creator calls addSigner() to add a 4th signer before submissionStart |
| 4. Submission Opens | block.timestamp >= submissionStart. Signer list locked. 3 benefactors submit proposals with IPFS document CIDs |
| 5. Voting | 4 signers review IPFS docs. Quorum = ceil(4 * 0.7) = 3. Benefactor A gets 3 approvals → added to winners[]. Benefactor B gets 2 approvals → does not reach quorum. Benefactor C gets 4 approvals → added to winners[] |
| 6. Review Phase | submissionEnd reached. No new proposals/votes. Review phase runs for 3 days |
| 7. Distribution | Anyone calls enterDistributionPhase(). Treasury receives 1,000 USDT (10%). 2 winners share 9,000 USDT → 4,500 USDT each |
| 8. Claims | Winner A calls claimGrant() → receives 4,500 USDT + SBT minted. Winner C calls claimGrant() → receives 4,500 USDT + SBT minted |
| 9. Pool Closed | All claims processed. Pool enters CLOSED state. No further actions permitted |

---

*ScholarChain — Decentralised Philanthropy on-chain*
*Technical Architecture Document v1.0 | April 2025*