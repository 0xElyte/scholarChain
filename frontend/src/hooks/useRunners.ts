import { useAppKitProvider, useAppKitAccount } from "@reown/appkit/react";
import { BrowserProvider, JsonRpcSigner } from "ethers";
import type { Eip1193Provider } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { jsonRpcProvider } from "../constants/provider";

const useRunners = () => {
    const [signer, setSigner] = useState<JsonRpcSigner>();
    const { walletProvider } = useAppKitProvider<Eip1193Provider>("eip155");
    const { address } = useAppKitAccount();

    const provider = useMemo(() => (walletProvider ? new BrowserProvider(walletProvider) : null), [walletProvider]);

    useEffect(() => {
        if (!provider || !address) {
            setSigner(undefined);
            return;
        }
        provider.getSigner().then((newSigner) => {
            if (!signer) return setSigner(newSigner);
            if (newSigner.address === signer.address) return;
            setSigner(newSigner);
        });
    }, [provider, signer, address]);

    return { provider, signer, readOnlyProvider: jsonRpcProvider };
};

export default useRunners;