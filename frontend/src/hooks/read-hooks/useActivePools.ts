import { Contract } from "ethers";
import { useEffect, useState } from "react";
import GrantPoolABI from "../../constants/GrantPoolABI.json";
import { useFactoryContract } from "../useContracts";
import useRunners from "../useRunners";

export const useActivePools = () => {
  const [activePools, setActivePools] = useState<string>("0");
  const factoryContract = useFactoryContract();
  const { readOnlyProvider } = useRunners();

  const getActivePools = async () => {
    try {
      if (!factoryContract || !readOnlyProvider) {
        setActivePools("0");
        return;
      }

      const poolAddresses = await factoryContract.getAllPools();
      const activeStates = new Set(["ACTIVE", "PENDING"]);
      let totalActivePools = 0;

      for (const poolAddress of poolAddresses) {
        try {
          const poolContract = new Contract(
            poolAddress,
            GrantPoolABI,
            readOnlyProvider,
          );
          const state = String(await poolContract.currentState()).toUpperCase();
          if (activeStates.has(state)) {
            totalActivePools += 1;
          }
        } catch (error) {
          console.log(`Failed to fetch state from pool ${poolAddress}:`, error);
        }
      }

      setActivePools(totalActivePools.toString());
    } catch (error) {
      console.error("Failed to fetch active pools:", error);
    }
  };

  useEffect(() => {
    getActivePools();
  }, [factoryContract, readOnlyProvider]);

  return activePools;
};
