import { useState, useCallback, useEffect } from "react";
import { BrowserProvider, Contract, formatUnits } from "ethers";
import type { WalletState } from "../types";
import { CONTRACT_ADDRESSES } from "../data/contracts";
import { ABI } from "../data/ABI.js";

const SEPOLIA_CHAIN_ID = "0xaa36a7"; // 11155111

async function fetchUsdtBalance(address: string, provider: BrowserProvider): Promise<string> {
  try {
    const usdt = new Contract(CONTRACT_ADDRESSES.MockUSDT, ABI.MockUsdt, provider);
    const raw: bigint = await usdt.balanceOf(address);
    return parseFloat(formatUnits(raw, 6)).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  } catch {
    return "0.00";
  }
}

async function ensureSepolia(): Promise<boolean> {
  if (!window.ethereum) return false;
  try {
    const chainId = await window.ethereum.request({ method: "eth_chainId" }) as string;
    if (chainId === SEPOLIA_CHAIN_ID) return true;
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID }],
    });
    return true;
  } catch {
    return false;
  }
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    balance: "0.00",
  });

  // Restore session on mount (if already connected)
  useEffect(() => {
    if (!window.ethereum) return;
    window.ethereum.request({ method: "eth_accounts" }).then(async (accounts) => {
      const list = accounts as string[];
      if (list.length > 0) {
        const address = list[0];
        const provider = new BrowserProvider(window.ethereum!);
        const balance = await fetchUsdtBalance(address, provider);
        setWallet({ address, isConnected: true, isConnecting: false, balance });
      }
    }).catch(() => {});
  }, []);

  // Listen for account / chain changes
  useEffect(() => {
    if (!window.ethereum) return;

    const onAccountsChanged = async (accounts: unknown) => {
      const list = accounts as string[];
      if (list.length === 0) {
        setWallet({ address: null, isConnected: false, isConnecting: false, balance: "0.00" });
      } else {
        const address = list[0];
        const provider = new BrowserProvider(window.ethereum!);
        const balance = await fetchUsdtBalance(address, provider);
        setWallet({ address, isConnected: true, isConnecting: false, balance });
      }
    };

    const onChainChanged = () => window.location.reload();

    window.ethereum.on("accountsChanged", onAccountsChanged);
    window.ethereum.on("chainChanged", onChainChanged);
    return () => {
      window.ethereum?.removeListener("accountsChanged", onAccountsChanged);
      window.ethereum?.removeListener("chainChanged", onChainChanged);
    };
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("MetaMask not detected. Please install MetaMask to continue.");
      return;
    }
    setWallet((w) => ({ ...w, isConnecting: true }));
    try {
      const onCorrectChain = await ensureSepolia();
      if (!onCorrectChain) {
        setWallet((w) => ({ ...w, isConnecting: false }));
        alert("Please switch to the Sepolia network in MetaMask.");
        return;
      }
      const provider = new BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []) as string[];
      const address = accounts[0];
      const balance = await fetchUsdtBalance(address, provider);
      setWallet({ address, isConnected: true, isConnecting: false, balance });
    } catch (err: unknown) {
      setWallet((w) => ({ ...w, isConnecting: false }));
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        console.error("Wallet connection failed:", err);
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet({ address: null, isConnected: false, isConnecting: false, balance: "0.00" });
  }, []);

  const shortAddress = wallet.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : null;

  return { wallet, connect, disconnect, shortAddress };
}

