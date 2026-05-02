import { createContext, useContext, type ReactNode } from "react";
import { useWallet } from "../hooks/useWallet";

type WalletContextValue = ReturnType<typeof useWallet>;

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const walletState = useWallet();

  return (
    <WalletContext.Provider value={walletState}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);

  if (!context) {
    throw new Error("useWalletContext must be used inside WalletProvider");
  }

  return context;
}
