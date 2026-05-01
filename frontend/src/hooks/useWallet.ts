import { useState, useCallback } from "react";
import type { WalletState } from "../types";

const MOCK_ADDRESS = "0xAbC1234567890dEf1234567890AbCdEf12345678";

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    balance: "0.00",
  });

  const connect = useCallback(async () => {
    setWallet((w) => ({ ...w, isConnecting: true }));
    // Simulate wallet connection delay
    await new Promise((r) => setTimeout(r, 900));
    setWallet({
      address: MOCK_ADDRESS,
      isConnected: true,
      isConnecting: false,
      balance: "1,240.50",
    });
  }, []);

  const disconnect = useCallback(() => {
    setWallet({
      address: null,
      isConnected: false,
      isConnecting: false,
      balance: "0.00",
    });
  }, []);

  const shortAddress = wallet.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : null;

  return { wallet, connect, disconnect, shortAddress };
}
