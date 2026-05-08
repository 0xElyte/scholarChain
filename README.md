<div align="center">
  <h1>🎓 ScholarChain</h1>
  <p><b>A Decentralized Philanthropic Grant Protocol</b></p>
  <p><i>Transparent Philanthropy, Verifiable Impact.</i></p>
  
  [![Solidity](https://img.shields.io/badge/Solidity-^0.8.24-363636?style=for-the-badge&logo=solidity)](https://soliditylang.org/)
  [![Foundry](https://img.shields.io/badge/Foundry-100%25_Coverage-orange?style=for-the-badge)](https://getfoundry.sh/)
  [![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react)](https://react.dev/)
  [![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?style=for-the-badge&logo=vite)](https://vitejs.dev/)
</div>

---

## 📖 Overview

**ScholarChain** is a fully on-chain, decentralized grant distribution protocol built on Ethereum (Sepolia Testnet). It bridges the gap between philanthropists, reviewers, and beneficiaries by enabling trustless funding, verifiable achievements, and permanent on-chain recognition.

Traditional grant systems suffer from opaque fund distribution, delayed banking systems, and a lack of permanent credentials for beneficiaries. **ScholarChain** solves this by leveraging smart contracts to automate fund distribution and issuing **Soul-Bound Tokens (SBTs)** as an immutable "Proof of Grant" on the blockchain.

## ✨ Core Features

- **🛡️ Trustless Grant Pools:** Anyone can permissionlessly create a grant pool. Funds are locked in a smart contract and distributed automatically.
- **💰 Multi-Donor Support:** Accept USDT donations from multiple contributors before and during the submission window.
- **📝 Decentralized Submissions:** Applicants submit proposals whose metadata and PDF criteria are securely stored on **IPFS via Pinata**.
- **✅ Transparent Quorum Voting:** Designated signers evaluate proposals and vote on-chain. Approvals trigger automatic distribution.
- **🎓 Soul-Bound Tokens (SBTs):** Winners receive a non-transferable NFT with **100% on-chain metadata** (no external servers) representing their academic or philanthropic resume.
- **🏦 Treasury Multisig:** A decentralized DAO logic that manages a 10% protocol fee for sustainability.

## 🏗️ Repository Structure

This is a monorepo containing both the Web3 smart contracts and the user-facing web application.

```text
scholarChain/
├── contract/             # Solidity contracts, Foundry deployment scripts, and tests
│   ├── src/              # Protocol Smart Contracts (Factory, Pool, SBT, Treasury)
│   ├── script/           # Deployment scripts
│   ├── test/             # 197/197 Foundry Unit & Integration Tests
│   └── foundry.toml      # Foundry configuration
├── frontend/             # Vite + React application
│   ├── src/              # React components, hooks, and pages
│   ├── public/           # Static assets
│   ├── vercel.json       # Production deployment configuration
│   └── package.json      # Dependencies and scripts
├── README.md             # This document
└── DOCUMENTATION.md      # In-depth architectural documentation
```

## 🛠️ Technology Stack

### Smart Contracts
- **Solidity `^0.8.24`**: Core smart contract logic.
- **Foundry / Forge**: Lightning-fast testing and deployment framework.
- **OpenZeppelin Contracts**: Industry-standard security modules (`AccessControl`, `ReentrancyGuard`, `SafeERC20`).

### Frontend
- **React 19 & TypeScript**: Component-based UI architecture.
- **Vite**: Next-generation frontend tooling.
- **TailwindCSS v4**: Utility-first CSS styling.
- **Ethers.js & Reown AppKit**: Web3 provider and WalletConnect integration.
- **Pinata (IPFS)**: Decentralized file storage.

## 🔗 Current Network Configuration (Sepolia Testnet)

The protocol is currently deployed and active on the **Ethereum Sepolia Testnet**:

| Contract Module | Address |
|-----------------|---------|
| **ScholarChain Factory** | `0x0Ac0cBF23279be96A31618B45A7EA65C603e0825` |
| **ScholarChain SBT** | `0xEBD33E6F07bE36e3A8c260Be4665d5e48cD1a20c` |
| **Treasury Multisig** | `0x55dd331Fc1c894D7EC74C931A586aA05fE694d6A` |
| **Mock USDT Token** | `0xf328F1b428748710687A0d275AF939eA100aA29c` |

## 🚀 Quick Start Setup

### 1. Smart Contracts
To test and compile the smart contracts:
```bash
cd contract
cp .env.example .env
# Add your RPC URLs and Private Keys to .env
forge build
forge test
```

### 2. Frontend Application
To run the local development server:
```bash
cd frontend
cp .env.example .env
# Populate with your VITE_PROJECT_ID, VITE_PINATA_JWT, etc.
npm install
npm run dev
```

#### Required Environment Variables (`frontend/.env`)
- `VITE_PROJECT_ID`: Your Reown / WalletConnect Project ID.
- `VITE_PINATA_JWT`: Your Pinata API token for IPFS uploads.
- `VITE_SEPOLIA_RPC_URL`: Sepolia RPC endpoint.

## 🛡️ Security & Verification

- **100% Test Coverage:** `forge test` passes with all `197/197` test cases validating state transitions, mathematical rounding, and access control.
- **Checks-Effects-Interactions:** Strictly enforced across all contracts to prevent reentrancy attacks.
- **On-Chain Metadata:** SBTs rely on dynamically generated Base64-encoded JSON entirely within Solidity, eliminating IPFS link rot for award credentials.

## 🤝 Contributing

We welcome contributions! If you're interested in improving ScholarChain:
1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/AmazingFeature`).
3. Commit your changes (`git commit -m 'feat: Add some AmazingFeature'`).
4. Push to the branch (`git push origin feature/AmazingFeature`).
5. Open a Pull Request.

---
*For full architecture, workflows, contract behavior, and deployment details, please refer to our [DOCUMENTATION.md](./DOCUMENTATION.md).*
