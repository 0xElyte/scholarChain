import { BrowserProvider } from "ethers";
import type { Eip1193Provider } from "ethers";
import type { JsonRpcSigner } from "ethers";
import { useEffect, useMemo, useState } from "react";
import { useWalletContext } from "../connection/WalletContext";
import { jsonRpcProvider } from "../constants/provider";

const useRunners = () => {
    const [signer, setSigner] = useState<JsonRpcSigner>();
    const { wallet } = useWalletContext();
    const walletProvider = window.ethereum as Eip1193Provider | undefined;
    const address = wallet.address;

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
