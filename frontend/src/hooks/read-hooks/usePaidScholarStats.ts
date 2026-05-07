import { Contract } from "ethers";
import { useEffect, useState } from "react";
import GrantPoolABI from "../../constants/GrantPoolABI.json";
import { useFactoryContract } from "../useContracts";
import useRunners from "../useRunners";

type PaidScholarStats = {
  totalPaidScholars: string;
  totalPaidAmount: string;
};

export const usePaidScholarStats = (): PaidScholarStats => {
  const [totalPaidScholars, setTotalPaidScholars] = useState<string>("0");
  const [totalPaidAmount, setTotalPaidAmount] = useState<string>("0");
  const factoryContract = useFactoryContract();
  const { readOnlyProvider } = useRunners();

  const getPaidScholarStats = async () => {
    try {
      if (!factoryContract || !readOnlyProvider) {
        setTotalPaidScholars("0");
        setTotalPaidAmount("0");
        return;
      }

      const poolAddresses = await factoryContract.getAllPools();

      const poolStats = await Promise.all(
        poolAddresses.map(async (poolAddress: string) => {
          try {
            const poolContract = new Contract(
              poolAddress,
              GrantPoolABI,
              readOnlyProvider,
            );

            const [winners, distributionAmount] = await Promise.all([
              poolContract.getWinners(),
              poolContract.distributionAmount(),
            ]);

            if (!winners.length) {
              return { paidScholars: 0n, paidAmount: 0n };
            }

            const claimStatuses = await Promise.all(
              winners.map((winner: string) => poolContract.hasClaimed(winner)),
            );

            const claimedCount = claimStatuses.reduce(
              (count: bigint, hasClaimed: boolean) =>
                count + (hasClaimed ? 1n : 0n),
              0n,
            );

            const paidAmount =
              claimedCount * BigInt(distributionAmount.toString());

            return {
              paidScholars: claimedCount,
              paidAmount,
            };
          } catch (error) {
            console.log(
              `Failed to fetch paid scholar stats from pool ${poolAddress}:`,
              error,
            );
            return { paidScholars: 0n, paidAmount: 0n };
          }
        }),
      );

      const totals = poolStats.reduce(
        (accumulator, poolStatsItem) => ({
          paidScholars: accumulator.paidScholars + poolStatsItem.paidScholars,
          paidAmount: accumulator.paidAmount + poolStatsItem.paidAmount,
        }),
        { paidScholars: 0n, paidAmount: 0n },
      );

      setTotalPaidScholars(totals.paidScholars.toString());
      setTotalPaidAmount(totals.paidAmount.toString());
    } catch (error) {
      console.error("Failed to fetch paid scholar stats:", error);
      setTotalPaidScholars("0");
      setTotalPaidAmount("0");
    }
  };

  useEffect(() => {
    getPaidScholarStats();
  }, [factoryContract, readOnlyProvider]);

  return { totalPaidScholars, totalPaidAmount };
};
