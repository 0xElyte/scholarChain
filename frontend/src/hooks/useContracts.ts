import { useMemo } from "react";
import useRunners from "./useRunners";
import { Contract, isAddress, getAddress } from "ethers";
import GrantPoolABI from "../constants/GrantPoolABI.json";
import FactoryABI from "../constants/FactoryABI.json";

function resolveAddress(address: string | undefined) {
  if (!address || !isAddress(address)) {
    return null;
  }

  return getAddress(address);
}

export const useGrantPoolContract = (withSigner = false) => {
  const { readOnlyProvider, signer } = useRunners();
  const contractAddress = resolveAddress(
    import.meta.env.VITE_GRANT_POOL_CONTRACT_ADDRESS,
  );

  return useMemo(() => {
    if (!contractAddress) {
      return null;
    }

    if (withSigner) {
      if (!signer) return null;
      return new Contract(contractAddress, GrantPoolABI, signer);
    }
    return new Contract(contractAddress, GrantPoolABI, readOnlyProvider);
  }, [withSigner, signer, readOnlyProvider, contractAddress]);
};

export const useFactoryContract = (withSigner = false) => {
  const { readOnlyProvider, signer } = useRunners();
  const contractAddress = resolveAddress(
    import.meta.env.VITE_FACTORY_CONTRACT_ADDRESS,
  );

  return useMemo(() => {
    if (!contractAddress) {
      return null;
    }

    if (withSigner) {
      if (!signer) return null;
      return new Contract(contractAddress, FactoryABI, signer);
    }
    return new Contract(contractAddress, FactoryABI, readOnlyProvider);
  }, [withSigner, signer, readOnlyProvider, contractAddress]);
};

// multicall not used; create via useRunners when needed
