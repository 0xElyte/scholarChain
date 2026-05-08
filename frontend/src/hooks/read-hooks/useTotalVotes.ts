import { useEffect, useState } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { useFactoryContract } from "../useContracts";
import GrantPoolABI from "../../constants/GrantPoolABI.json";

// Use publicnode for unrestricted eth_getLogs (Alchemy free tier caps at 10 blocks)
const LOG_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

export const useTotalVotes = () => {
  const [totalVotes, setTotalVotes] = useState<string>("0");
  const factoryContract = useFactoryContract();

  useEffect(() => {
    const fetchProposalEvents = async (
      pc: Contract,
      logProvider: JsonRpcProvider,
    ) => {
      const latest = await logProvider.getBlockNumber();
      const chunkSize = 49_000;
      const events: any[] = [];

      for (let fromBlock = 0; fromBlock <= latest; fromBlock += chunkSize) {
        const toBlock = Math.min(fromBlock + chunkSize - 1, latest);
        const batch = await pc.queryFilter(
          pc.filters.ProposalSubmitted(),
          fromBlock,
          toBlock,
        );
        events.push(...batch);
      }

      return events;
    };

    const fetchVotes = async () => {
      try {
        if (!factoryContract) {
          setTotalVotes("0");
          return;
        }

        const logProvider = new JsonRpcProvider(LOG_RPC);
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
            const pc = new Contract(poolAddress, GrantPoolABI, logProvider);
            const events = await fetchProposalEvents(pc, logProvider);
            const benefactors = [
              ...new Set(events.map((e: any) => e.args?.benefactor)),
            ];

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
                const count = await pc.approvalCount(b);
                total += BigInt(count.toString());
              } catch {
                // ignore per-proposal failures
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
  }, [factoryContract]);

  return totalVotes;
};
