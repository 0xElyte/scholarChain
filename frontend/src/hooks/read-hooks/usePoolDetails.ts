import { useEffect, useState } from "react";
import { isAddress } from "ethers";
import useRunners from "../useRunners";
import { fetchPoolDetails } from "./poolFetcher";
import type { PoolDetailsData } from "./poolFetcher";

export const usePoolDetails = (poolAddress: string | undefined) => {
  const [poolData, setPoolData] = useState<PoolDetailsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { readOnlyProvider } = useRunners();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!poolAddress || !isAddress(poolAddress) || !readOnlyProvider) {
          setPoolData(null);
          setLoading(false);
          return;
        }

        const data = await fetchPoolDetails(poolAddress, readOnlyProvider);
        setPoolData(data);
      } catch (err) {
        console.error("Failed to fetch pool details:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch pool details",
        );
        setPoolData(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [poolAddress, readOnlyProvider]);

  return { poolData, loading, error };
};
