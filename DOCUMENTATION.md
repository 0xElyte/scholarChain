# ScholarChain Documentation

## 1. Project Overview

ScholarChain is a decentralized grant management protocol. It combines smart contracts and a web client to manage the full grant lifecycle on-chain:

1. A creator deploys a new grant pool.
2. Donors fund the pool with USDT.
3. Applicants submit proposals whose metadata is stored on IPFS.
4. Assigned reviewers vote on submissions.
5. Approved applicants become winners once quorum is reached.
6. The pool enters distribution, sends a 10% protocol fee to treasury, and lets winners claim their grants.
7. Each winner receives a Soul-Bound Token as a permanent proof of grant receipt.

The project is split into two workspaces:

- `contract/`: Solidity contracts, Foundry deployment scripts, and tests
- `frontend/`: Vite + React application for end users, reviewers, creators, donors, and treasury signers

## 2. Technology Stack

### Smart Contracts

- Solidity `^0.8.24`
- Foundry
- OpenZeppelin Contracts

### Frontend

- React `19`
- TypeScript
- Vite
- Ethers `v6`
- Reown AppKit
- Tailwind CSS `v4`

### Storage and Infrastructure

- IPFS for criteria and proposal metadata
- Pinata for file pinning
- Sepolia RPC for read and write access

## 3. Repository Structure

```text
contract/
  src/
    ScholarChainFactory.sol
    GrantPool.sol
    ScholarChainSBT.sol
    TreasuryMultisig.sol
    MultiSig.sol
    ERC20MultiSig.sol
    mocks/MockUSDT.sol
    Interfaces/
    Types/
  script/
    Deploy.s.sol
    DeployMockUSDT.s.sol
  test/
    GrantPool.t.sol
    ScholarChainFactory.t.sol
    ScholarChainSBT.t.sol
    TreasuryMultisig.t.sol
  foundry.toml

frontend/
  src/
    components/
    connection/
    constants/
    hooks/
    pages/
    utils/
  public/
  package.json
```

## 4. Smart Contract Architecture

### 4.1 ScholarChainFactory

File: [contract/src/ScholarChainFactory.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/src/ScholarChainFactory.sol)

Responsibility:

- Deploys new `GrantPool` contracts
- Stores the treasury address used by every pool
- Stores the SBT contract address used by every pool
- Tracks all created pools and pools created by each address
- Exposes aggregate protocol statistics for the frontend
- Grants each new pool the `MINTER_ROLE` needed to mint winner SBTs

Important rules:

- Treasury fee is fixed to `1000` basis points, which equals `10%`
- A pool must have at least `3` signers
- A pool can have at most `20` signers
- A pool must define at least `1` application field and at most `10`
- Submission start must be in the future
- Submission window must be longer than `1` day
- Review duration must be at least `1` day

Key frontend-facing view functions:

- `getAllPools()`
- `getPoolsByCreator(address)`
- `getTotalPoolCount()`
- `getAllPoolSummaries()`
- `getProtocolStats()`

### 4.2 GrantPool

File: [contract/src/GrantPool.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/src/GrantPool.sol)

Responsibility:

- Stores pool metadata and configuration
- Accepts USDT donations
- Accepts applicant submissions
- Records signer votes
- Selects winners based on quorum
- Handles distribution, claiming, refunds, and unclaimed fund recovery

#### Pool States

The pool state is derived from timestamps and flags, not stored as a mutable enum.

- `PENDING`: before submission start
- `ACTIVE`: submission window is open
- `REVIEW`: submission window is closed and review is still ongoing
- `DISTRIBUTING`: review ended and winners can claim
- `CLOSED`: all winner claims completed or zero-winner refunds settled
- `CANCELLED`: creator cancelled the pool before submissions opened

#### Main Behaviors

Donations:

- `donate(uint256)` accepts USDT from any donor during `PENDING` or `ACTIVE`
- `topUpPool(uint256)` lets the creator add more funds during the same period

Pool administration:

- `editCriteria(bytes32)` lets the creator update the criteria CID only in `PENDING`
- `addSigner(address)` lets the creator add reviewers before `submissionStart`
- `cancelPool()` lets the creator cancel only while the pool is still `PENDING`

Applications:

- `submitProposal(bytes32 docCID, address payoutAddr)` allows one proposal per benefactor during `ACTIVE`
- Each proposal stores the applicant document CID and payout wallet

Review:

- `vote(address benefactor, bool approve)` is restricted to signers
- Each signer can vote only once per applicant
- A winner is approved once they reach `ceil(signers * 70 / 100)`

Distribution:

- `enterDistributionPhase()` can be called by anyone after review ends
- 10% of `totalDeposited` is transferred to the treasury
- The remaining 90% is divided equally among winners
- If there are no winners, donors become eligible for proportional refunds from the remaining 90%

Claiming:

- `claimGrant()` transfers the winner share to the winner’s declared payout address
- After transfer, the pool mints a winner SBT through the SBT contract
- When the last claim finishes, remaining dust is swept to treasury

Refunds and recovery:

- `claimRefund()` lets donors recover funds if the pool is cancelled
- `claimRefund()` also supports the zero-winner path after distribution
- `recoverUnclaimedFunds()` lets an admin recover stuck funds after `90 days`

#### Frontend Helper Views

- `getSigners()`
- `getWinners()`
- `quorumThreshold()`
- `getProposal(address)`
- `getApprovalCount(address)`
- `hasVoted(address,address)`
- `getProposalCount()`
- `getClaimedCount()`
- `getFieldDefinitions()`
- `getPoolSummary()`

### 4.3 ScholarChainSBT

File: [contract/src/ScholarChainSBT.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/src/ScholarChainSBT.sol)

Responsibility:

- Mints non-transferable ERC-721 award tokens to grant winners
- Stores award metadata fully on-chain as a Base64 JSON data URI
- Prevents duplicate awards for the same recipient in the same pool

Important properties:

- Only accounts with `MINTER_ROLE` can mint
- Transfers are disabled
- Approvals are disabled
- The token records:
  - pool address
  - grant amount
  - payout address
  - award timestamp

### 4.4 TreasuryMultisig

Files:

- [contract/src/TreasuryMultisig.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/src/TreasuryMultisig.sol)
- [contract/src/ERC20MultiSig.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/src/ERC20MultiSig.sol)
- [contract/src/MultiSig.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/src/MultiSig.sol)

Responsibility:

- Controls protocol treasury funds
- Controls admin actions after deployment
- Requires multiple signatures before executing proposals

Supported proposal patterns include:

- ERC-20 withdrawal
- add signer
- remove signer
- change required signature threshold
- arbitrary admin or contract calls

## 5. Deployment Architecture

Deployment script:

- [contract/script/Deploy.s.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/script/Deploy.s.sol)

Deployment order:

1. Resolve USDT address
2. Deploy `TreasuryMultisig`
3. Deploy `ScholarChainSBT`
4. Deploy `ScholarChainFactory`
5. Grant factory admin access on the SBT contract
6. Transfer factory and SBT admin rights to treasury multisig
7. Renounce deployer admin rights

Result:

- Treasury multisig becomes the protocol governor
- Factory becomes able to authorize new pool contracts as SBT minters
- The deployer does not remain as persistent protocol admin

Mock token script:

- [contract/script/DeployMockUSDT.s.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/script/DeployMockUSDT.s.sol)

## 6. Frontend Architecture

### 6.1 Routing

File: [frontend/src/App.tsx](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/App.tsx)

Main routes:

- `/`: public landing page
- `/dashbar/dashboard`: wallet-protected dashboard
- `/dashbar/explore`: public pool explorer
- `/dashbar/create`: pool creation page
- `/dashbar/review`: wallet-protected signer review page
- `/dashbar/pool/:address`: pool detail page
- `/treasury`: treasury multisig administration page

### 6.2 Wallet Integration

Files:

- [frontend/src/connection/AppkitWrapper.tsx](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/connection/AppkitWrapper.tsx)
- [frontend/src/hooks/useWallet.ts](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/hooks/useWallet.ts)
- [frontend/src/hooks/useRunners.ts](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/hooks/useRunners.ts)

Behavior:

- Reown AppKit powers wallet connection
- Ethers powers signing and contract reads
- Sepolia is the configured network
- Missing `VITE_PROJECT_ID` disables wallet connection gracefully

### 6.3 Contract Access Layer

Files:

- [frontend/src/hooks/useContracts.ts](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/hooks/useContracts.ts)
- [frontend/src/constants/provider.ts](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/constants/provider.ts)

Behavior:

- Uses a JSON-RPC provider for read-only access
- Creates signer-backed contracts when wallet actions are needed
- Resolves factory address from environment variables, with a Sepolia fallback

### 6.4 Frontend Pages

Landing page:

- [frontend/src/pages/LandingPage.tsx](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/pages/LandingPage.tsx)
- Shows live protocol metrics
- Shows featured pool data
- Routes users into pool creation or exploration

Create pool page:

- [frontend/src/pages/CreatePoolPage.tsx](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/pages/CreatePoolPage.tsx)
- Uploads the criteria PDF to Pinata
- Converts the returned CID to `bytes32`
- Calls factory `createPool`
- Optionally sends an initial USDT donation after deployment

Review page:

- [frontend/src/pages/ReviewPage.tsx](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/pages/ReviewPage.tsx)
- Lists pools where the connected wallet is a signer
- Reads `ProposalSubmitted` events to discover applicants
- Fetches proposal metadata from IPFS
- Sends approve or reject votes on-chain

Treasury page:

- [frontend/src/pages/TreasuryPage.tsx](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/pages/TreasuryPage.tsx)
- Shows treasury stats and proposals
- Lets signers create withdrawal and admin proposals
- Supports signing and executing multisig actions

Pool explorer and detail views:

- `ExplorerPage.tsx`, `DashboardPage.tsx`, and `PoolDetailPage.tsx`
- Surface pool summaries, balances, timelines, proposals, and donation flows

## 7. IPFS and Pinata Flow

Files:

- [frontend/src/utils/ipfs.ts](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/utils/ipfs.ts)
- [frontend/src/utils/pinata.ts](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/src/utils/pinata.ts)

Flow:

1. The user uploads a PDF criteria document in the create pool page.
2. The frontend uploads the file to Pinata using `VITE_PINATA_JWT`.
3. Pinata returns a CIDv0 hash.
4. The frontend converts the CID to `bytes32` before sending it to the contract.
5. When data is read back from the chain, `bytes32` values are converted to CIDs again for gateway access.

Important detail:

- The app expects CIDv0 or a raw `0x` `bytes32` digest for contract storage.

## 8. Environment Configuration

### 8.1 Contract Environment

Template file:

- [contract/.env.example](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/.env.example)

Variables:

- `PRIVATE_KEY`: deployer private key
- `RPC_URL`: RPC endpoint for the target network
- `USDT_ADDRESS`: real or mock USDT address
- `TREASURY_SIGNER_1`
- `TREASURY_SIGNER_2`
- `TREASURY_SIGNER_3`
- `REQUIRED_SIGS`
- `TEAM_MULTISIG`
- `ETHERSCAN_API_KEY`

### 8.2 Frontend Environment

Template file:

- [frontend/.env.example](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/frontend/.env.example)

Variables used by source code:

- `VITE_PROJECT_ID`
- `VITE_SEPOLIA_RPC_URL`
- `VITE_FACTORY_CONTRACT_ADDRESS`
- `VITE_TREASURY_MULTISIG_ADDRESS`
- `VITE_SCHOLAR_CHAIN_SBT_ADDRESS`
- `VITE_MOCK_USDT_ADDRESS`
- `VITE_PINATA_JWT`
- `VITE_PINATA_GATEWAY`
- `VITE_BLOCK_EXPLORER_BASE`
- `VITE_APP_URL`
- `VITE_APP_ICON`

Note:

- The committed local frontend `.env` contains populated values. Replace exposed credentials before reuse.

## 9. Deployed Sepolia Addresses

These values appear in the current frontend configuration and frontend README:

- Treasury Multisig: `0x55dd331Fc1c894D7EC74C931A586aA05fE694d6A`
- ScholarChain SBT: `0xEBD33E6F07bE36e3A8c260Be4665d5e48cD1a20c`
- ScholarChain Factory: `0x0Ac0cBF23279be96A31618B45A7EA65C603e0825`
- Mock USDT: `0xf328F1b428748710687A0d275AF939eA100aA29c`

## 10. Local Development

### Contracts

```bash
cd contract
cp .env.example .env
forge build
forge test
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

### Production Build

```bash
cd frontend
npm run build
```

Build output is written to `frontend/dist`.

## 11. Test Coverage and Validation

Contract test files:

- [contract/test/GrantPool.t.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/test/GrantPool.t.sol)
- [contract/test/ScholarChainFactory.t.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/test/ScholarChainFactory.t.sol)
- [contract/test/ScholarChainSBT.t.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/test/ScholarChainSBT.t.sol)
- [contract/test/TreasuryMultisig.t.sol](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/contract/test/TreasuryMultisig.t.sol)

Verified in this workspace:

- `forge test`: `197/197` tests passed
- `npm run build`: frontend build artifacts were generated successfully in `frontend/dist`

Areas covered by tests include:

- factory validation and deployment behavior
- pool state transitions
- donations and creator top-ups
- proposal submission rules
- signer voting and quorum
- distribution math
- refunds and unclaimed fund recovery
- SBT minting and transfer restrictions
- multisig proposal, signing, execution, and signer management

## 12. Operational Notes

- The treasury fee is fixed to `10%`.
- Winner payout uses each applicant’s declared payout address, not necessarily the submitting wallet.
- Zero-winner pools refund only the post-fee remainder proportionally to donors.
- The review page discovers proposals from emitted events, so RPC log availability matters.
- The treasury page currently contains hardcoded Sepolia addresses in source for treasury and mock USDT views.
- Pool creation depends on a working Pinata JWT with file pinning permissions.

## 13. Recommended Cleanup Before Public Release

- Remove secrets from committed `.env` files
- Move all contract addresses into `.env.example` and consume them consistently from environment variables
- Add a root README badge or quick-start section if the project will be shared externally
- Add explicit backend-free architecture notes if this will be used for demos or judging

## 14. Summary

ScholarChain is a two-part Web3 application:

- a contract system for transparent grant funding, review, and payout
- a React frontend that exposes those flows to creators, donors, reviewers, and treasury signers

Its strongest implementation points are:

- strict contract validation at pool creation
- on-chain lifecycle enforcement
- multisig-controlled treasury governance
- permanent SBT award records
- a tested Foundry suite covering the main protocol behaviors
