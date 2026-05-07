import { useEffect, useState } from "react";
import { Contract, getAddress } from "ethers";
import useRunners from "../useRunners";
import { useFactoryContract } from "../useContracts";
import GrantPoolABI from "../../constants/GrantPoolABI.json";
import type { PoolState } from "../../types";
import type { GrantPool } from "../../types";

export interface PoolSummary extends Omit<GrantPool, "state"> {
  state: PoolState;
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

        // Get all pool summaries from factory (includes counts)
        const summaries: any[] = await factoryContract.getAllPoolSummaries();

        if (summaries.length === 0) {
          setPools([]);
          setLoading(false);
          return;
        }

        // Factory summaries include signerCount, but not signer addresses.
        // Fetch signers directly from each pool to support reviewer-specific UI.
        const signersByPool = await Promise.all(
          summaries.map(async (s: any) => {
            try {
              const poolContract = new Contract(
                getAddress(s.poolAddress),
                GrantPoolABI,
                readOnlyProvider,
              );
              const signers = await poolContract.getSigners();
              return signers || [];
            } catch {
              return [];
            }
          }),
        );

        // State enum mapping
        const STATE_MAP: Record<number, PoolState> = {
          0: "PENDING",
          1: "ACTIVE",
          2: "REVIEW",
          3: "DISTRIBUTING",
          4: "CLOSED",
          5: "CANCELLED",
        };

        // Map summaries to PoolSummary interface
        const mappedPools: PoolSummary[] = summaries.map(
          (s: any, i: number) => ({
            address: s.poolAddress,
            poolName: s.poolName,
            creator: s.creator,
            state: STATE_MAP[Number(s.state)] || "CLOSED",
            submissionStart: Number(s.submissionStart),
            submissionEnd: Number(s.submissionEnd),
            reviewEnd: Number(s.reviewEnd),
            totalDeposited: s.totalDeposited.toString(),
            distributionAmount: s.distributionAmount.toString(),
            criteriaMetadataCID: "",
            signers: signersByPool[i] || [],
            winners: s.winners || [],
            treasury: "",
            signerCount: Number(s.signerCount),
            winnersCount: Number(s.winnersCount),
            proposalCount: Number(s.proposalCount),
            isCancelled: s.isCancelled || false,
            distributionEntered: s.distributionEntered || false,
            createdAt: Number(s.submissionStart),
            fieldDefinitions: [],
          }),
        );

        setPools(mappedPools);
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
