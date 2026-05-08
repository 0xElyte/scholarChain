import { useEffect, useState } from "react";
import { Contract } from "ethers";
import useRunners from "../useRunners";
import { useWalletContext } from "../../connection/WalletContext";
import GrantPoolABI from "../../constants/GrantPoolABI.json";

export const useProposalVotes = (
  poolAddress?: string,
  benefactor?: string,
  refreshTick?: number,
) => {
  const [approvals, setApprovals] = useState<number>(0);
  const [rejections, setRejections] = useState<number>(0);
  const [voters, setVoters] = useState<
    Array<{ voter: string; approved: boolean; blockNumber?: number }>
  >([]);
  const [signerCount, setSignerCount] = useState<number>(0);
  const [hasVoted, setHasVoted] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const { readOnlyProvider } = useRunners();
  const { wallet } = useWalletContext();

  useEffect(() => {
    let cancelled = false;

    function readVoteArgs(log: unknown): {
      voter: string;
      approved: boolean;
      blockNumber: number;
    } | null {
      if (!log || typeof log !== "object") return null;

      const entry = log as {
        blockNumber?: number;
        args?: unknown;
      };

      const candidateArgs = entry.args as
        | {
            signer?: unknown;
            voter?: unknown;
            voterAddress?: unknown;
            approved?: unknown;
          }
        | undefined;

      if (!candidateArgs) return null;

      const rawVoter =
        candidateArgs.signer ?? candidateArgs.voter ?? candidateArgs.voterAddress;
      const voter = typeof rawVoter === "string" ? rawVoter.toLowerCase() : "";
      if (!voter) return null;

      return {
        voter,
        approved: Boolean(candidateArgs.approved),
        blockNumber: entry.blockNumber ?? 0,
      };
    }

    async function fetchVotes() {
      if (!poolAddress || !benefactor || !readOnlyProvider) {
        if (!cancelled) {
          setApprovals(0);
          setRejections(0);
          setVoters([]);
          setSignerCount(0);
          setHasVoted(false);
        }
        return;
      }

      setIsLoading(true);
      try {
        const pc = new Contract(poolAddress, GrantPoolABI, readOnlyProvider);

        const [summaryResult, approvalResult, walletVoteResult] =
          await Promise.allSettled([
            pc.getPoolSummary(),
            typeof pc.getApprovalCount === "function"
              ? pc.getApprovalCount(benefactor)
              : pc.approvalCount(benefactor),
            wallet.address
              ? pc.hasVoted(wallet.address, benefactor)
              : Promise.resolve(false),
          ]);

        if (!cancelled && summaryResult.status === "fulfilled") {
          setSignerCount(Number(summaryResult.value.signerCount ?? 0));
        }

        if (!cancelled && approvalResult.status === "fulfilled") {
          setApprovals(Number(approvalResult.value ?? 0));
        }

        if (!cancelled && walletVoteResult.status === "fulfilled") {
          setHasVoted(Boolean(walletVoteResult.value));
        }

        const currentBlock = await readOnlyProvider.getBlockNumber();
        const chunkSize = 25000;
        const voteLogs: Array<{
          voter: string;
          approved: boolean;
          blockNumber: number;
        }> = [];

        for (let fromBlock = 0; fromBlock <= currentBlock; fromBlock += chunkSize) {
          const toBlock = Math.min(fromBlock + chunkSize - 1, currentBlock);
          try {
            const events = await pc.queryFilter(
              pc.filters.VoteCast(null, benefactor),
              fromBlock,
              toBlock,
            );
            for (const eventLog of events) {
              const parsed = readVoteArgs(eventLog);
              if (!parsed) continue;
              voteLogs.push(parsed);
            }
          } catch (chunkErr) {
            console.debug("useProposalVotes: chunk query error", chunkErr);
          }
        }

        if (!cancelled) {
          const dedupedByVoter: Record<
            string,
            { approved: boolean; blockNumber: number }
          > = {};

          for (const item of voteLogs) {
            const existing = dedupedByVoter[item.voter];
            if (!existing || item.blockNumber >= existing.blockNumber) {
              dedupedByVoter[item.voter] = {
                approved: item.approved,
                blockNumber: item.blockNumber,
              };
            }
          }

          const deduped = Object.entries(dedupedByVoter).map(
            ([voter, info]) => ({ voter, approved: info.approved }),
          );

          setRejections(deduped.filter((d) => !d.approved).length);
          setVoters(deduped.map((d) => ({ voter: d.voter, approved: d.approved })));
        }
      } catch (err) {
        console.error("useProposalVotes: unexpected error", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void fetchVotes();

    // Subscribe to new blocks to refresh counts shortly after a vote is mined.
    const onBlock = async () => {
      if (cancelled) return;
      try {
        await fetchVotes();
      } catch {
        // ignore
      }
    };

    if (readOnlyProvider && typeof readOnlyProvider.on === "function") {
      readOnlyProvider.on("block", onBlock);
    }

    return () => {
      cancelled = true;
      try {
        if (readOnlyProvider && typeof readOnlyProvider.off === "function") {
          readOnlyProvider.off("block", onBlock);
        }
      } catch {}
    };
  // Keep dependency array fixed-size and stable to avoid React hook warnings.
  // We intentionally exclude `wallet.address` so the deps length stays constant.
  }, [poolAddress, benefactor, readOnlyProvider, refreshTick]);

  return {
    approvals,
    rejections,
    totalVotes: approvals + rejections,
    voters,
    signerCount,
    hasVoted,
    isLoading,
  };
};

export default useProposalVotes;
