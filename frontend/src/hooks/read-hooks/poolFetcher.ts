import { Contract, getAddress } from "ethers";
import GrantPoolABI from "../../constants/GrantPoolABI.json";

export interface PoolDetailsData {
  poolName: string;
  creator: string;
  poolAddress: string;
  state: string;
  submissionStart: number;
  submissionEnd: number;
  reviewEnd: number;
  criteriaMetadataCID: string;
  totalDeposited: string;
  distributionAmount: string;
  distributionEntered: boolean;
  isCancelled: boolean;
  signers: string[];
  winners: string[];
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

  const [
    name,
    creator,
    state,
    submissionStart,
    submissionEnd,
    reviewEnd,
    criteriaMetadataCID,
    totalDeposited,
    distributionAmount,
    distributionEntered,
    isCancelled,
    signers,
    winners,
    fieldDefinitions,
  ] = await Promise.all([
    poolContract.poolName(),
    poolContract.creator(),
    poolContract.currentState(),
    poolContract.submissionStart(),
    poolContract.submissionEnd(),
    poolContract.reviewEnd(),
    poolContract.criteriaMetadataCID(),
    poolContract.totalDeposited(),
    poolContract.distributionAmount(),
    poolContract.distributionEntered(),
    poolContract.isCancelled(),
    poolContract.getSigners(),
    poolContract.getWinners(),
    poolContract.getFieldDefinitions(),
  ]);

  return {
    poolName: name,
    creator,
    poolAddress: resolved,
    state,
    submissionStart: Number(submissionStart),
    submissionEnd: Number(submissionEnd),
    reviewEnd: Number(reviewEnd),
    criteriaMetadataCID,
    totalDeposited: totalDeposited.toString(),
    distributionAmount: distributionAmount.toString(),
    distributionEntered,
    isCancelled,
    signers,
    winners,
    fieldDefinitions: fieldDefinitions.map((f: any) => ({
      label: f.label,
      fieldType: f.fieldType,
      required: f.required,
    })),
  };
}
