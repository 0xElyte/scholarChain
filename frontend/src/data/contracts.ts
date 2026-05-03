// Deployed contract addresses on Sepolia testnet
export const CONTRACT_ADDRESSES = {
  TreasuryMultisig: "0x55dd331Fc1c894D7EC74C931A586aA05fE694d6A",
  ScholarChainSBT:  "0xEBD33E6F07bE36e3A8c260Be4665d5e48cD1a20c",
  ScholarChainFactory: "0x0Ac0cBF23279be96A31618B45A7EA65C603e0825",
  MockUSDT:         "0xf328F1b428748710687A0d275AF939eA100aA29c",
} as const;

export type ContractName = keyof typeof CONTRACT_ADDRESSES;
