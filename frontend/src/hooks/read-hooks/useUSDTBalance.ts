import { useEffect, useState } from "react";
import { ethers } from "ethers";
import useRunners from "../useRunners";

const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
];

export const useUSDTBalance = (
  usdtTokenAddress: string | undefined,
  userAddress: string | undefined,
) => {
  const [balance, setBalance] = useState<string>("0");
  const [rawBalance, setRawBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState(false);
  const { readOnlyProvider } = useRunners();

  useEffect(() => {
    if (!usdtTokenAddress || !userAddress || !readOnlyProvider) {
      setBalance("0");
      setRawBalance(0n);
      return;
    }

    const fetchBalance = async () => {
      try {
        setLoading(true);
        const tokenContract = new ethers.Contract(
          usdtTokenAddress,
          ERC20_ABI,
          readOnlyProvider,
        );
        const [rawBalance, decimals] = await Promise.all([
          tokenContract.balanceOf(userAddress),
          tokenContract.decimals(),
        ]);

        const formatted = ethers.formatUnits(rawBalance, decimals);
        setRawBalance(BigInt(rawBalance.toString()));
        setBalance(formatted);
      } catch (err) {
        console.error("Failed to fetch USDT balance:", err);
        setBalance("0");
        setRawBalance(0n);
      } finally {
        setLoading(false);
      }
    };

    fetchBalance();
  }, [usdtTokenAddress, userAddress, readOnlyProvider]);

  return {
    balance: balance.split(".")[0] + "." + balance.split(".")[1]?.slice(0, 2),
    rawBalance,
    loading,
  };
};

export default useUSDTBalance;
