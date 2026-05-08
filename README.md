# ScholarChain

ScholarChain is a decentralized grant funding platform built with Solidity, Foundry, React, TypeScript, and Ethers. It lets organizers create grant pools, accept USDT donations, collect applicant submissions through IPFS, review proposals with signer voting, distribute funds to winners, and record each award with a non-transferable Soul-Bound Token.

This repository contains two applications:

- `contract/`: Smart contracts, deployment scripts, and Foundry tests
- `frontend/`: Vite + React web application for pool creation, discovery, review, donation, and treasury administration

## Core Features

- Create grant pools with a name, timeline, criteria document CID, reviewer addresses, and dynamic application fields
- Accept USDT donations before and during the submission window
- Let applicants submit proposal metadata stored on IPFS
- Let designated signers review and vote on proposals on-chain
- Move approved pools into distribution, send a 10% protocol fee to treasury, and let winners claim grants
- Mint a Soul-Bound NFT to each grant recipient as a permanent on-chain award record
- Manage treasury withdrawals and admin actions through a multisig treasury contract

## Repository Structure

```text
.
├── contract
│   ├── src
│   ├── script
│   ├── test
│   └── foundry.toml
├── frontend
│   ├── src
│   ├── public
│   └── package.json
├── README.md
└── DOCUMENTATION.md
```

## Smart Contract Modules

- `ScholarChainFactory.sol`: Deploys and tracks grant pools
- `GrantPool.sol`: Handles donations, submissions, review, winner selection, claiming, refunds, and recovery
- `ScholarChainSBT.sol`: Mints non-transferable award NFTs for winners
- `TreasuryMultisig.sol`: Governs treasury actions and protocol administration
- `MockUSDT.sol`: Test token used for local and testnet flows

## Frontend Modules

- Landing page with live protocol metrics
- Pool explorer and pool detail pages
- Pool creation flow with PDF upload to Pinata
- Reviewer dashboard for proposal voting
- Treasury dashboard for multisig proposals and execution

## Current Network Configuration

The frontend is configured for Sepolia.

- Treasury Multisig: `0x55dd331Fc1c894D7EC74C931A586aA05fE694d6A`
- ScholarChain SBT: `0xEBD33E6F07bE36e3A8c260Be4665d5e48cD1a20c`
- ScholarChain Factory: `0x0Ac0cBF23279be96A31618B45A7EA65C603e0825`
- Mock USDT: `0xf328F1b428748710687A0d275AF939eA100aA29c`

## Setup

### Contract

```bash
cd contract
cp .env.example .env
forge build
forge test
```

Required deploy variables are defined in `contract/.env.example`.

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Frontend environment variables used by the app include:

- `VITE_PROJECT_ID`
- `VITE_SEPOLIA_RPC_URL`
- `VITE_FACTORY_CONTRACT_ADDRESS`
- `VITE_TREASURY_MULTISIG_ADDRESS`
- `VITE_SCHOLAR_CHAIN_SBT_ADDRESS`
- `VITE_MOCK_USDT_ADDRESS`
- `VITE_PINATA_JWT`
- `VITE_BLOCK_EXPLORER_BASE`

## Main Commands

```bash
# smart contracts
cd contract
forge build
forge test

# frontend
cd frontend
npm run dev
npm run build
npm run lint
```

## Verification Status

- `forge test`: Passed with `197/197` tests
- `npm run build`: Frontend production build generated `frontend/dist`

## Notes

- Pool creation requires a valid Pinata JWT because criteria PDFs are uploaded to IPFS from the frontend.
- The wallet connection layer uses Reown AppKit and is configured for Sepolia.
- The repository currently contains populated local `.env` files. Rotate any exposed secrets before using this project in a shared or production setting.

For full architecture, workflows, contract behavior, and deployment details, see [DOCUMENTATION.md](/home/mutmahinat/Desktop/WEB3BRIDGE/FINAL-PROJECT/DOCUMENTATION.md).
