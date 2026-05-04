import { useState, useCallback } from "react";
import { ethers, parseUnits } from "ethers";
import useRunners from "../useRunners";
import GrantPoolABI from "../../constants/GrantPoolABI.json";

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

type DonateResult = {
  tx?: any;
  error?: Error;
};

/**
 * useDonatePool
 * Sends a USDT donation to a pool contract.
 * Handles USDT approval if needed, then calls donate(amount) on the pool.
 */
export function useDonatePool() {
  const { provider, signer: runnerSigner } = useRunners();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const donate = useCallback(
    async (
      poolAddress: string,
      amountUnits: string,
      usdtTokenAddress: string,
      options?: { tokenDecimals?: number }
    ) => {
      setLoading(true);
      setError(null);
      setTxHash(null);

      try {
        if (!provider && !runnerSigner) throw new Error("No provider available");
        if (!usdtTokenAddress) throw new Error("USDT token address not available");

        let signer = runnerSigner as any | undefined;
        if (!signer) {
          signer = await provider!.getSigner();
        }

        const userAddress = await signer.getAddress?.() || signer.address;
        if (!userAddress) throw new Error("Cannot get user address");

        const decimals = options?.tokenDecimals ?? 6;
        const amount = parseUnits(amountUnits, decimals);

        // Step 1: Check and approve USDT if needed
        const usdtContract = new ethers.Contract(
          usdtTokenAddress,
          ERC20_ABI,
          signer
        );

        const allowance = await usdtContract.allowance(userAddress, poolAddress);
        
        if (allowance < amount) {
          console.log("[useDonatePool] Approving USDT...");
          const approveTx = await usdtContract.approve(poolAddress, amount);
          await approveTx.wait();
          console.log("[useDonatePool] USDT approved");
        }

        // Step 2: Call donate on pool
        console.log("[useDonatePool] Calling donate...", { poolAddress, amount: amount.toString() });
        const pool = new ethers.Contract(poolAddress, GrantPoolABI, signer);
        
        if (typeof pool.donate !== "function") {
          throw new Error("Pool contract does not have donate function");
        }

        const tx = await pool.donate(amount);
        setTxHash(tx.hash);

        await tx.wait();

        setLoading(false);
        return { tx } as DonateResult;
      } catch (err: any) {
        console.error("[useDonatePool] Error:", err);
        setError(err);
        setLoading(false);
        return { error: err } as DonateResult;
      }
    },
    [provider, runnerSigner]
  );

  return {
    donate,
    loading,
    error,
    txHash,
  };
}

export default useDonatePool;
