import { useEffect, useState } from "react";
import { Contract, JsonRpcProvider } from "ethers";
import { useFactoryContract } from "../useContracts";
import GrantPoolABI from "../../constants/GrantPoolABI.json";
import FactoryABI from "../../constants/FactoryABI.json";

// publicnode has no block-range restrictions (Alchemy free tier caps at 10 blocks)
const LOG_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const CHUNK = 49_000;

// Factory deployment block — no need to scan before this
const FACTORY_DEPLOY_BLOCK = 10_782_808;

const FACTORY_ADDRESS = (
  import.meta.env.VITE_FACTORY_ADDRESS ||
  "0x0Ac0cBF23279be96A31618B45A7EA65C603e0825"
).trim();

export const useTotalVotes = () => {
  const [totalVotes, setTotalVotes] = useState<string>("0");
  const factoryContract = useFactoryContract();

  useEffect(() => {
    if (!factoryContract) return;

    let cancelled = false;

    const fetchVotes = async () => {
      try {
        const logProvider = new JsonRpcProvider(LOG_RPC);
        const latest = await logProvider.getBlockNumber();

        // Step 1: Get all PoolCreated events from the factory to map
        // pool address → deployment block (avoids scanning from block 0 per pool)
        const factory = new Contract(FACTORY_ADDRESS, FactoryABI as any, logProvider);
        const poolCreatedEvents: Array<{ address: string; block: number }> = [];

        for (let from = FACTORY_DEPLOY_BLOCK; from <= latest; from += CHUNK) {
          if (cancelled) return;
          const to = Math.min(from + CHUNK - 1, latest);
          const events = await factory.queryFilter(factory.filters.PoolCreated(), from, to);
          for (const e of events) {
            poolCreatedEvents.push({
              address: (e as any).args.poolAddress as string,
              block: e.blockNumber,
            });
          }
        }

        if (!poolCreatedEvents.length) {
          if (!cancelled) setTotalVotes("0");
          return;
        }

        // Step 2: For each pool, count VoteCast events starting from its deploy block
        let total = 0;

        for (const { address: poolAddress, block: deployBlock } of poolCreatedEvents) {
          if (cancelled) return;
          try {
            const pc = new Contract(poolAddress, GrantPoolABI as any, logProvider);
            for (let from = deployBlock; from <= latest; from += CHUNK) {
              if (cancelled) return;
              const to = Math.min(from + CHUNK - 1, latest);
              const events = await pc.queryFilter(pc.filters.VoteCast(), from, to);
              total += events.length;
            }
          } catch {
            // skip pools that fail
          }
        }

        if (!cancelled) setTotalVotes(total.toString());
      } catch {
        if (!cancelled) setTotalVotes("0");
      }
    };

    fetchVotes();
    return () => { cancelled = true; };
  }, [factoryContract]);

  return totalVotes;
};
