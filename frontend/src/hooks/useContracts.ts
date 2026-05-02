import { useMemo } from "react";
import useRunners from "./useRunners";
import { Contract } from "ethers";
import GrantPoolABI from "../constants/GrantPoolABI.json";
import FactoryABI from "../constants/FactoryABI.json";
import { getAddress } from "ethers";

export const useGrantPoolContract = (withSigner = false) => {
  const { readOnlyProvider, signer } = useRunners();

  return useMemo(() => {
    if (withSigner) {
      if (!signer) return null;
      return new Contract(
        getAddress(import.meta.env.VITE_GRANT_POOL_CONTRACT_ADDRESS),
        GrantPoolABI,
        signer,
      );
    }
    return new Contract(
      getAddress(import.meta.env.VITE_GRANT_POOL_CONTRACT_ADDRESS),
      GrantPoolABI,
      readOnlyProvider,
    );
  }, [withSigner, signer, readOnlyProvider]);
};

export const useFactoryContract = (withSigner = false) => {
  const { readOnlyProvider, signer } = useRunners();

  return useMemo(() => {
    if (withSigner) {
      if (!signer) return null;
      return new Contract(
        getAddress(import.meta.env.VITE_FACTORY_CONTRACT_ADDRESS),
        FactoryABI,
        signer,
      );
    }
    return new Contract(
      getAddress(import.meta.env.VITE_FACTORY_CONTRACT_ADDRESS),
      FactoryABI,
      readOnlyProvider,
    );
  }, [withSigner, signer, readOnlyProvider]);
};
