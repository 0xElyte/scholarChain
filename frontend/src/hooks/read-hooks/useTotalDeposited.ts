import { useEffect, useState } from "react";
import { useFactoryContract } from "../useContracts";
import { Contract } from "ethers";
import GrantPoolABI from "../../constants/GrantPoolABI.json";
import useRunners from "../useRunners";

export const useTotalDeposited = () => {
  const [totalDeposit, setTotalDeposit] = useState<string>("");
  const factoryContract = useFactoryContract();
  const { readOnlyProvider } = useRunners();

  const getTotalDeposit = async () => {
    try {

      // Get all pool addresses from factory
      const poolAddresses = await factoryContract.getAllPools();

      // Fetch totalDeposited from each pool and sum them
      let totalSum = 0n;
      
      for (const poolAddress of poolAddresses) {
        try {
          const poolContract = new Contract(
            poolAddress,
            GrantPoolABI,
            readOnlyProvider
          );
          const deposit = await poolContract.totalDeposited();
          totalSum += BigInt(deposit.toString());
        } catch (error) {
          console.log(`Failed to fetch deposit from pool ${poolAddress}:`, error);
        }
      }

      setTotalDeposit(totalSum.toString());
    } catch (error) {
      console.error("Failed to fetch total deposit across all pools:", error);
      setTotalDeposit("0");
    }
  };

  useEffect(() => {
    getTotalDeposit();
  }, [factoryContract, readOnlyProvider]);

  return totalDeposit;
};
