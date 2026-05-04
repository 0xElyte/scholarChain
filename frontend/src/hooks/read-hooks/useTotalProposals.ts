import { useEffect, useState } from "react";
import { useFactoryContract } from "../useContracts";
import useRunners from "../useRunners";

export const useTotalProposals = () => {
  const [totalProposals, setTotalProposals] = useState<string>("0");
  const factoryContract = useFactoryContract();
  const { readOnlyProvider } = useRunners();

  useEffect(() => {
    const fetchTotal = async () => {
      try {
        if (!factoryContract || !readOnlyProvider) {
          setTotalProposals("0");
          return;
        }

        // Prefer getAllPoolSummaries which contains proposalCount
        const summaries: any[] = await factoryContract.getAllPoolSummaries();
        const total = summaries.reduce(
          (acc, s) => acc + Number(s.proposalCount ?? 0),
          0,
        );
        setTotalProposals(total.toString());
      } catch (err) {
        console.error("Failed to fetch total proposals:", err);
        setTotalProposals("0");
      }
    };

    fetchTotal();
  }, [factoryContract, readOnlyProvider]);

  return totalProposals;
};
