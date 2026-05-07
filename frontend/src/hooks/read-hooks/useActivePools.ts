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

      // Prefer factory aggregate stats (single RPC), fallback to per-pool checks.
      try {
        const [, activePoolCount] = await factoryContract.getProtocolStats();
        setActivePools(activePoolCount.toString());
        return;
      } catch (error) {
        console.log(
          "getProtocolStats unavailable, falling back to pool scan:",
          error,
        );
      }

      const poolAddresses = await factoryContract.getAllPools();
      const activeStates = new Set([0, 1]); // PENDING, ACTIVE
      let totalActivePools = 0;

      for (const poolAddress of poolAddresses) {
        try {
          const poolContract = new Contract(
            poolAddress,
            GrantPoolABI,
            readOnlyProvider,
          );
          const state = Number(await poolContract.currentState());
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
