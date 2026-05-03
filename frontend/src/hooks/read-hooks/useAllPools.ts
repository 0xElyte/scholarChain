import { useEffect, useState } from "react";
import useRunners from "../useRunners";
import { useFactoryContract } from "../useContracts";
import { fetchPoolDetails } from "./poolFetcher";

export interface PoolSummary {
  address: string;
  poolName: string;
  creator: string;
  state: string;
  submissionStart: number;
  submissionEnd: number;
  reviewEnd: number;
  totalDeposited: string;
  distributionAmount: string;
  criteriaMetadataCID: string;
  signers: string[];
  winners: string[];
}

export const useAllPools = () => {
  const [pools, setPools] = useState<PoolSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const factoryContract = useFactoryContract();
  const { readOnlyProvider } = useRunners();

  useEffect(() => {
    const fetchAllPools = async () => {
      try {
        setLoading(true);
        setError(null);

        if (!factoryContract || !readOnlyProvider) {
          setPools([]);
          setLoading(false);
          return;
        }

        // Get all pool addresses
        const poolAddresses: string[] = await factoryContract.getAllPools();

        if (poolAddresses.length === 0) {
          setPools([]);
          setLoading(false);
          return;
        }

        // Fetch details for each pool in parallel using the shared fetcher
        const poolPromises = poolAddresses.map(async (addr) => {
          try {
            const details = await fetchPoolDetails(addr, readOnlyProvider);
            return {
              address: details.poolAddress,
              poolName: details.poolName,
              creator: details.creator,
              state: details.state,
              submissionStart: details.submissionStart,
              submissionEnd: details.submissionEnd,
              reviewEnd: details.reviewEnd,
              totalDeposited: details.totalDeposited,
              distributionAmount: details.distributionAmount,
              criteriaMetadataCID: details.criteriaMetadataCID,
              signers: details.signers,
              winners: details.winners,
            };
          } catch (err) {
            console.error(`Failed to fetch pool ${addr}:`, err);
            return null;
          }
        });

        const results = await Promise.all(poolPromises);
        const validPools = results.filter((p) => p !== null) as PoolSummary[];
        setPools(validPools);
      } catch (err) {
        console.error("Failed to fetch all pools:", err);
        setError(err instanceof Error ? err.message : "Failed to fetch pools");
        setPools([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAllPools();
  }, [factoryContract, readOnlyProvider]);

  return { pools, loading, error };
};
