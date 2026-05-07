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
    const fetchVotes = async () => {
      try {
        if (!factoryContract) {
          setTotalVotes("0");
          return;
        }

        const logProvider = new JsonRpcProvider(LOG_RPC);
        const poolAddresses: string[] = await factoryContract.getAllPools();
        let total = 0n;

        for (const poolAddress of poolAddresses) {
          try {
            const pc = new Contract(poolAddress, GrantPoolABI, logProvider);
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
              } catch {
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
  }, [factoryContract]);

  return totalVotes;
};
