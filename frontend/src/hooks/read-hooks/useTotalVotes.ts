import { useEffect, useState } from "react";
import { useFactoryContract } from "../useContracts";
import useRunners from "../useRunners";
import GrantPoolABI from "../../constants/GrantPoolABI.json";

export const useTotalVotes = () => {
  const [totalVotes, setTotalVotes] = useState<string>("0");
  const factoryContract = useFactoryContract();
  const { readOnlyProvider } = useRunners();

  useEffect(() => {
    const fetchVotes = async () => {
      try {
        if (!factoryContract || !readOnlyProvider) {
          setTotalVotes("0");
          return;
        }

        const poolAddresses: string[] = await factoryContract.getAllPools();
        let total = 0n;

        for (const poolAddress of poolAddresses) {
          try {
            const pc = new (await import("ethers")).Contract(
              poolAddress,
              GrantPoolABI,
              readOnlyProvider,
            );
            // gather proposal benefactors from events
            const events = await pc.queryFilter(
              pc.filters.ProposalSubmitted(),
              0,
            );
            const benefactors = [
              ...new Set(events.map((e: any) => e.args?.benefactor)),
            ];

            for (const b of benefactors) {
              try {
                const count = await pc.approvalCount(b);
                total += BigInt(count.toString());
              } catch (e) {
                // ignore per-proposal failures
              }
            }
          } catch (e) {
            console.error(`Failed to read votes from pool ${poolAddress}:`, e);
          }
        }

        setTotalVotes(total.toString());
      } catch (err) {
        console.error("Failed to fetch total votes:", err);
        setTotalVotes("0");
      }
    };

    fetchVotes();
  }, [factoryContract, readOnlyProvider]);

  return totalVotes;
};
