import { useEffect, useState } from "react";
import { MOCK_PROPOSALS } from "../../data/mockData";

export const useTotalVotes = () => {
  const [totalVotes, setTotalVotes] = useState<string>("0");

  useEffect(() => {
    try {
      const count = MOCK_PROPOSALS.reduce(
        (sum, proposal) => sum + proposal.approvalCount,
        0,
      ).toString();
      setTotalVotes(count);
    } catch (error) {
      console.error("Failed to fetch total votes:", error);
      setTotalVotes("0");
    }
  }, []);

  return totalVotes;
};
