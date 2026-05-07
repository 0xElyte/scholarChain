import { useCallback, useMemo } from "react";
import {
  useAppKit,
  useAppKitAccount,
  useDisconnect,
} from "@reown/appkit/react";
import type { WalletState } from "../types";

export function useWallet() {
  const { open } = useAppKit();
  const { disconnect: disconnectAppKit } = useDisconnect();
  const { address, isConnected, status } = useAppKitAccount();

  const wallet = useMemo<WalletState>(
    () => ({
      address: address ?? null,
      isConnected,
      isConnecting: status === "connecting" || status === "reconnecting",
      balance: "0.00",
    }),
    [address, isConnected, status],
  );

  const connect = useCallback(async () => {
    await open();
  }, [open]);

  const disconnect = useCallback(async () => {
    await disconnectAppKit();
  }, [disconnectAppKit]);

  const shortAddress = wallet.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : null;

  return { wallet, connect, disconnect, shortAddress };
}
