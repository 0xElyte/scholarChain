import { Contract, getAddress } from "ethers";
import GrantPoolABI from "../../constants/GrantPoolABI.json";
import { bytes32ToCid } from "../../utils/ipfs";
import type { PoolState } from "../../types";

export interface PoolDetailsData {
  poolName: string;
  creator: string;
  poolAddress: string;
  usdtTokenAddress: string;
  state: PoolState;
  submissionStart: number;
  submissionEnd: number;
  reviewEnd: number;
  criteriaMetadataCID: string;
  totalDeposited: string;
  distributionAmount: string;
  distributionEntered: boolean;
  isCancelled: boolean;
  claimedCount: number;
  signers: string[];
  winners: string[];
  proposalCount: number;
  fieldDefinitions: Array<{
    label: string;
    fieldType: number;
    required: boolean;
  }>;
}

export async function fetchPoolDetails(
  poolAddress: string,
  provider: any,
): Promise<PoolDetailsData> {
  const resolved = getAddress(poolAddress);
  const poolContract = new Contract(resolved, GrantPoolABI, provider);
  // Use the compact `getPoolSummary` to fetch main fields in one call
  const [
    summary,
    signers,
    winners,
    fieldDefinitions,
    criteriaMetadataCID,
    usdtTokenAddress,
  ] = await Promise.all([
    poolContract.getPoolSummary(),
    poolContract.getSigners(),
    poolContract.getWinners(),
    poolContract.getFieldDefinitions(),
    poolContract.criteriaMetadataCID(),
    poolContract.usdt?.() || poolContract.usdtTokenAddress?.(),
  ]);

  const name = summary.poolName;
  const creator = summary.creator;
  const STATE_MAP: Record<number, PoolState> = {
    0: "PENDING",
    1: "ACTIVE",
    2: "REVIEW",
    3: "DISTRIBUTING",
    4: "CLOSED",
    5: "CANCELLED",
  };

  const state: PoolState = STATE_MAP[Number(summary.state)] ?? "CLOSED";
  const submissionStart = summary.submissionStart;
  const submissionEnd = summary.submissionEnd;
  const reviewEnd = summary.reviewEnd;
  const totalDeposited = summary.totalDeposited;
  const distributionAmount = summary.distributionAmount;
  const proposalCount = summary.proposalCount;
  const distributionEntered = summary.distributionEntered;
  const isCancelled = summary.isCancelled;
  const claimedCount = summary.claimedCount;

  return {
    poolName: name,
    creator,
    poolAddress: resolved,
    usdtTokenAddress: usdtTokenAddress || "",
    state,
    submissionStart: Number(submissionStart),
    submissionEnd: Number(submissionEnd),
    reviewEnd: Number(reviewEnd),
    criteriaMetadataCID: bytes32ToCid(criteriaMetadataCID as string),
    totalDeposited: totalDeposited.toString(),
    distributionAmount: distributionAmount.toString(),
    proposalCount: Number(proposalCount ?? 0),
    distributionEntered,
    isCancelled,
    claimedCount: Number(claimedCount ?? 0),
    signers,
    winners,
    fieldDefinitions: fieldDefinitions.map((f: any) => ({
      label: f.label,
      fieldType: Number(f.fieldType),
      required: f.required,
    })),
  };
}
