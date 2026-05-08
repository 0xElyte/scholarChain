import { useAppKitAccount, useAppKitProvider } from "@reown/appkit/react";
import { BrowserProvider } from "ethers";
import type { Eip1193Provider, JsonRpcSigner } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { jsonRpcProvider } from "../constants/provider";

const useRunners = () => {
  const [signer, setSigner] = useState<JsonRpcSigner>();
  const { walletProvider } = useAppKitProvider<Eip1193Provider>("eip155");
  const { address, isConnected } = useAppKitAccount({ namespace: "eip155" });

  const provider = useMemo(
    () => (walletProvider ? new BrowserProvider(walletProvider) : null),
    [walletProvider],
  );

  useEffect(() => {
    if (!provider || !address || !isConnected) {
      setSigner(undefined);
      return;
    }

    let cancelled = false;

    void provider
      .getSigner(address)
      .then((newSigner) => {
        if (!cancelled) {
          setSigner(newSigner);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSigner(undefined);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [provider, address, isConnected]);

  return { provider, signer, readOnlyProvider: jsonRpcProvider };
};

export default useRunners;
