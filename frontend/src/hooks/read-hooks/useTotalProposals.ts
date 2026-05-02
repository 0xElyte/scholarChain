import { useEffect, useState } from "react";
import { MOCK_PROPOSALS } from "../../data/mockData";

export const useTotalProposals = () => {
  const [totalProposals, setTotalProposals] = useState<string>("0");

  useEffect(() => {
    try {
      const count = MOCK_PROPOSALS.length.toString();
      setTotalProposals(count);
    } catch (error) {
      console.error("Failed to fetch total proposals:", error);
      setTotalProposals("0");
    }
  }, []);

  return totalProposals;
};
