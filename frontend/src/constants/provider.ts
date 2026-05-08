import { JsonRpcProvider } from "ethers";

const RPC_URL =
  (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ??
  (import.meta.env.VITE_LISK_SEPOLIA_TESTNET_RPC_URL as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";

export const jsonRpcProvider = new JsonRpcProvider(RPC_URL);
