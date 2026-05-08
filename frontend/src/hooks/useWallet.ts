import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider } from "ethers";
import type { WalletState } from "../types";

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (!window.ethereum) return;

    let mounted = true;

    const syncAccounts = async () => {
      try {
        const accounts = (await window.ethereum?.request({
          method: "eth_accounts",
        })) as string[];
        if (!mounted) return;
        setAddress(accounts[0] ?? null);
      } catch {
        if (!mounted) return;
        setAddress(null);
      }
    };

    const handleAccountsChanged = (accounts: unknown) => {
      if (!mounted) return;
      const next = Array.isArray(accounts) ? (accounts[0] as string | undefined) : undefined;
      setAddress(next ?? null);
    };

    void syncAccounts();
    window.ethereum.on("accountsChanged", handleAccountsChanged);

    return () => {
      mounted = false;
      window.ethereum?.removeListener("accountsChanged", handleAccountsChanged);
    };
  }, []);

  const wallet = useMemo<WalletState>(
    () => ({
      address,
      isConnected: Boolean(address),
      isConnecting,
      balance: "0.00",
    }),
    [address, isConnecting],
  );

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error("MetaMask is not installed.");
    }

    setIsConnecting(true);
    try {
      const provider = new BrowserProvider(window.ethereum);
      const accounts = (await provider.send("eth_requestAccounts", [])) as string[];
      setAddress(accounts[0] ?? null);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    setAddress(null);
  }, []);

  const shortAddress = wallet.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : null;

  return { wallet, connect, disconnect, shortAddress };
}
