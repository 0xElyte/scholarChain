import { useState } from "react";
import { getAddress } from "ethers";
import type { FieldDefinition } from "../../types";
import { FieldType } from "../../types";
import { cidToBytes32 } from "../../utils/ipfs";
import { useFactoryContract } from "../useContracts";

export interface PoolDeploymentParams {
  poolName: string;
  criteriaMetadataCID: string;
  submissionStart: Date;
  submissionEnd: Date;
  reviewDuration: number; // in days
  signers: string[];
  usdtTokenAddress: string;
  fields: FieldDefinition[];
}

interface DeploymentState {
  isLoading: boolean;
  progress: string;
  error: string | null;
  createdPoolAddress: string | null;
}

const FIELD_TYPE_TO_SOLIDITY: Record<FieldType, number> = {
  [FieldType.TEXT]: 0,
  [FieldType.URL]: 1,
  [FieldType.DOCUMENT]: 2,
};

export function useDeployPool() {
  const factoryContract = useFactoryContract(true);
  const [state, setState] = useState<DeploymentState>({
    isLoading: false,
    progress: "",
    error: null,
    createdPoolAddress: null,
  });

  const deploy = async (params: PoolDeploymentParams): Promise<string> => {
    if (!factoryContract) {
      const err = "Factory contract is not available in this environment.";
      setState((s) => ({ ...s, error: err }));
      throw new Error(err);
    }

    setState({
      isLoading: true,
      progress: "",
      error: null,
      createdPoolAddress: null,
    });

    try {
      if (!params.criteriaMetadataCID.trim()) {
        throw new Error("Upload the criteria PDF before deploying the pool.");
      }

      // Step 1: Convert CID to bytes32
      setState((s) => ({ ...s, progress: "Processing IPFS reference..." }));
      const criteriaMetadataCID = cidToBytes32(params.criteriaMetadataCID);
      console.log("[useDeployPool] Converted to bytes32:", criteriaMetadataCID);

      // Step 2: Prepare contract parameters
      setState((s) => ({ ...s, progress: "Preparing pool parameters..." }));

      const submissionStart = BigInt(
        Math.floor(params.submissionStart.getTime() / 1000),
      );
      const submissionEnd = BigInt(
        Math.floor(params.submissionEnd.getTime() / 1000),
      );
      const reviewDuration = BigInt(params.reviewDuration * 86400); // Convert days to seconds

      const initialSigners = params.signers
        .map((signer) => signer.trim())
        .filter(Boolean)
        .map((signer) => getAddress(signer));

      const usdtTokenAddress = getAddress(params.usdtTokenAddress.trim());

      const fieldDefinitions = params.fields.map((field) => ({
        fieldType: FIELD_TYPE_TO_SOLIDITY[field.fieldType],
        label: field.label.trim(),
        required: field.required,
      }));

      // Step 3: Send transaction
      setState((s) => ({
        ...s,
        progress: "Sending transaction to blockchain...",
      }));
      console.log("[useDeployPool] Sending createPool transaction...");

      const tx = await factoryContract.createPool({
        poolName: params.poolName.trim(),
        criteriaMetadataCID,
        submissionStart,
        submissionEnd,
        reviewDuration,
        initialSigners,
        usdtTokenAddress,
        fieldDefinitions,
      });

      console.log("[useDeployPool] Transaction sent:", tx.hash);
      setState((s) => ({
        ...s,
        progress: `Waiting for confirmation (${tx.hash})...`,
      }));

      // Step 4: Wait for receipt
      const receipt = await tx.wait();
      console.log(
        "[useDeployPool] Transaction confirmed at block:",
        receipt?.blockNumber,
      );
      setState((s) => ({
        ...s,
        progress: "Transaction confirmed. Parsing pool address...",
      }));

      // Step 5: Extract pool address from event log
      const createdLog = receipt?.logs.find(
        (log: { topics: string[]; data: string }) => {
          try {
            return (
              factoryContract.interface.parseLog({
                topics: log.topics,
                data: log.data,
              })?.name === "PoolCreated"
            );
          } catch {
            return false;
          }
        },
      );

      let poolAddress: string | null = null;
      if (createdLog) {
        const parsed = factoryContract.interface.parseLog({
          topics: createdLog.topics,
          data: createdLog.data,
        });
        poolAddress = (parsed?.args?.poolAddress as string | undefined) ?? null;
        console.log("[useDeployPool] Pool created at:", poolAddress);
      }

      if (!poolAddress) {
        throw new Error("Pool address not found in transaction receipt.");
      }

      setState((s) => ({
        ...s,
        isLoading: false,
        progress: "Pool deployed successfully!",
        createdPoolAddress: poolAddress,
      }));

      return poolAddress;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Pool deployment failed.";
      console.error("[useDeployPool] Deployment error:", err);
      setState({
        isLoading: false,
        progress: "",
        error: message,
        createdPoolAddress: null,
      });
      throw err;
    }
  };

  const reset = () => {
    setState({
      isLoading: false,
      progress: "",
      error: null,
      createdPoolAddress: null,
    });
  };

  return {
    ...state,
    deploy,
    reset,
  };
}
