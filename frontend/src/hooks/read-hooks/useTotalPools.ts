import { useEffect, useState } from "react";
import { useFactoryContract } from "../useContracts";

export const useTotalPools = () => {
  const [totalPools, setTotalPools] = useState<string>("0");
  const factoryContract = useFactoryContract();

  const getTotalPools = async () => {
    try {
      if (!factoryContract) {
        setTotalPools("0");
        return;
      }

      const poolAddresses = await factoryContract.getAllPools();
      setTotalPools(poolAddresses.length.toString());
    } catch (error) {
      console.error("Failed to fetch total pools:", error);
    }
  };

  useEffect(() => {
    getTotalPools();
  }, [factoryContract]);

  return totalPools;
};
