import { useEffect, useState } from "react";
import { Contract } from "ethers";
import { useFactoryContract } from "../useContracts";
import useRunners from "../useRunners";
import GrantPoolABI from "../../constants/GrantPoolABI.json";

export const useTotalVotes = () => {
  const [totalVotes, setTotalVotes] = useState<string>("0");
  const factoryContract = useFactoryContract();
  const { readOnlyProvider } = useRunners();

  useEffect(() => {
    let cancelled = false;

    const fetchVotes = async () => {
      try {
        if (!factoryContract || !readOnlyProvider) {
          console.warn("Missing factoryContract or readOnlyProvider");
          if (!cancelled) setTotalVotes("0");
          return;
        }

        // Get all pool addresses from factory contract
        const poolAddresses: string[] = await factoryContract.getAllPools();
        console.log(
          `[useTotalVotes] Found ${poolAddresses.length} pools from factory:`,
          poolAddresses,
        );

        if (poolAddresses.length === 0) {
          console.warn("[useTotalVotes] No pools found from factory");
          if (!cancelled) setTotalVotes("0");
          return;
        }

        const currentBlock = await readOnlyProvider.getBlockNumber();
        console.log(`[useTotalVotes] Current block: ${currentBlock}`);

        const chunkSize = 25000;
        let total = 0n;
        const votesByPool: Record<string, number> = {};

        // Query votes from each pool contract
        for (const poolAddress of poolAddresses) {
          try {
            console.log(
              `[useTotalVotes] Fetching votes from pool: ${poolAddress}`,
            );

            const pc = new Contract(
              poolAddress,
              GrantPoolABI,
              readOnlyProvider,
            );

            // Verify pool is valid by trying to read pool state
            try {
              const poolState = await pc.getPoolSummary();
              console.log(
                `[useTotalVotes] Pool ${poolAddress} state:`,
                poolState.state,
              );
            } catch (stateErr) {
              console.warn(
                `[useTotalVotes] Could not read pool state for ${poolAddress}:`,
                stateErr,
              );
            }

            // Count every vote cast in the pool. The landing page metric is a
            // reviewer activity total, not a deduped per-voter summary.
            let poolVoteCount = 0;

            // Query VoteCast events in chunks.
            for (
              let fromBlock = 0;
              fromBlock <= currentBlock;
              fromBlock += chunkSize
            ) {
              const toBlock = Math.min(fromBlock + chunkSize - 1, currentBlock);

              try {
                const voteEvents = await pc.queryFilter(
                  pc.filters.VoteCast(),
                  fromBlock,
                  toBlock,
                );

                // Log vote details for validation
                if (voteEvents.length > 0) {
                  console.log(
                    `[useTotalVotes] Pool ${poolAddress} blocks ${fromBlock}-${toBlock}: ${voteEvents.length} votes`,
                  );
                }

                poolVoteCount += voteEvents.length;
              } catch (chunkErr) {
                console.warn(
                  `[useTotalVotes] Error querying blocks ${fromBlock}-${toBlock} for pool ${poolAddress}:`,
                  chunkErr,
                );
              }
            }

            votesByPool[poolAddress] = poolVoteCount;
            total += BigInt(poolVoteCount);

            console.log(
              `[useTotalVotes] Pool ${poolAddress} deduped votes: ${poolVoteCount}`,
            );
          } catch (e) {
            console.error(
              `[useTotalVotes] Failed to read votes from pool ${poolAddress}:`,
              e,
            );
          }
        }

        console.log(
          "[useTotalVotes] Final vote count by pool:",
          votesByPool,
          "Total:",
          total.toString(),
        );

        if (!cancelled) setTotalVotes(total.toString());
      } catch (err) {
        console.error("[useTotalVotes] Failed to fetch total votes:", err);
        if (!cancelled) setTotalVotes("0");
      }
    };

    fetchVotes();
    return () => {
      cancelled = true;
    };
  }, [factoryContract, readOnlyProvider]);

  return totalVotes;
};
