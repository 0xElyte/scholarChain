import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, JsonRpcProvider, Contract, toUtf8String } from "ethers";
import { ABI } from "../data/ABI.js";
import type { GrantPool, ChainProposal, FieldDefinition, PoolState } from "../types";
import { FieldType } from "../types";

const SEPOLIA_RPC =
  (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";

const STATE_MAP: PoolState[] = [
  "PENDING", "ACTIVE", "REVIEW", "DISTRIBUTING", "CLOSED", "CANCELLED",
];

const FIELD_TYPE_MAP = [FieldType.TEXT, FieldType.URL, FieldType.DOCUMENT];

/** Decode an on-chain bytes32 to a human-readable string (strips null bytes). */
export function bytes32ToString(hex: string): string {
  try {
    const bytes = new Uint8Array(
      hex.replace(/^0x/, "").match(/.{2}/g)!.map((b) => parseInt(b, 16)),
    );
    const end = bytes.indexOf(0);
    return toUtf8String(bytes.slice(0, end === -1 ? bytes.length : end));
  } catch {
    return hex;
  }
}

/** Encode a CIDv0 (Qm...) string as bytes32 using the raw 32-byte SHA-256 hash. */
export function cidToBytes32(cid: string): string {
  if (cid.startsWith("0x") && cid.length === 66) return cid; // already bytes32

  // For arbitrary strings ≤ 32 bytes — same encoding as Solidity bytes32("...")
  const enc = new TextEncoder().encode(cid);
  const buf = new Uint8Array(32);
  buf.set(enc.slice(0, 32));
  return "0x" + Array.from(buf).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface PoolDetail extends GrantPool {
  quorum: number;
  proposals: ChainProposal[];
  myProposal: ChainProposal | null;
  myIsSigner: boolean;
  myIsWinner: boolean;
  myHasClaimed: boolean;
  myDonation: string;   // formatted USDT
}

function getProvider(): BrowserProvider | JsonRpcProvider {
  if (window.ethereum) return new BrowserProvider(window.ethereum);
  return new JsonRpcProvider(SEPOLIA_RPC);
}

export function usePoolDetail(poolAddress: string | undefined, walletAddress?: string | null) {
  const [detail,  setDetail]  = useState<PoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!poolAddress) return;
    setLoading(true);
    setError(null);
    try {
      const provider = getProvider();
      const pc = new Contract(poolAddress, ABI.GrantPool, provider);

      // Batch all read-only calls that don't depend on wallet
      const [
        summary,
        cidBytes32,
        signersArr,
        winnersArr,
        fieldDefsRaw,
        quorumRaw,
      ] = await Promise.all([
        pc.getPoolSummary(),
        pc.criteriaMetadataCID(),
        pc.getSigners(),
        pc.getWinners(),
        pc.getFieldDefinitions(),
        pc.quorumThreshold(),
      ]);

      // Fetch proposals via event log
      const proposalEvents = await pc.queryFilter(
        pc.filters.ProposalSubmitted(),
        0,
      );
      const benefactors = [
        ...new Set(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          proposalEvents.map((e: any) => e.args.benefactor as string),
        ),
      ];

      // Fetch proposal details in parallel
      const proposalData = await Promise.all(
        benefactors.map(async (addr) => {
          const [prop, appCount, win, claimed, hasVoted] = await Promise.all([
            pc.getProposal(addr),
            pc.approvalCount(addr),
            pc.isWinner(addr),
            pc.hasClaimed(addr),
            walletAddress
              ? (pc.hasVoted(walletAddress, addr) as Promise<boolean>).catch(() => false)
              : Promise.resolve(false),
          ]);
          return {
            benefactor:      addr,
            documentCID:     bytes32ToString(prop.documentCID as string),
            payoutAddress:   prop.payoutAddress as string,
            submittedAt:     Number(prop.submittedAt),
            approvalCount:   Number(appCount),
            isWinner:        win  as boolean,
            hasClaimed:      claimed as boolean,
            hasVotedOnThis:  hasVoted,
          } satisfies ChainProposal;
        }),
      );

      // Wallet-specific reads
      let myIsSigner    = false;
      let myIsWinner    = false;
      let myHasClaimed  = false;
      let myDonation    = "0";
      let myProposal: ChainProposal | null = null;

      if (walletAddress) {
        const [isSig, isWin, isClaimed, donation] = await Promise.all([
          (pc.isSigner(walletAddress)  as Promise<boolean>).catch(() => false),
          (pc.isWinner(walletAddress)  as Promise<boolean>).catch(() => false),
          (pc.hasClaimed(walletAddress) as Promise<boolean>).catch(() => false),
          (pc.donations(walletAddress) as Promise<bigint>).catch(() => 0n),
        ]);
        myIsSigner   = isSig;
        myIsWinner   = isWin;
        myHasClaimed = isClaimed;
        myDonation   = (Number(donation) / 1e6).toFixed(2);
        myProposal   = proposalData.find(
          (p) => p.benefactor.toLowerCase() === walletAddress.toLowerCase(),
        ) ?? null;
      }

      // Map field definitions
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fieldDefinitions: FieldDefinition[] = (fieldDefsRaw as any[]).map((f) => ({
        fieldType: FIELD_TYPE_MAP[Number(f.fieldType)] ?? FieldType.TEXT,
        label:     f.label as string,
        required:  f.required as boolean,
      }));

      const state: PoolState = STATE_MAP[Number(summary.state)] ?? "CLOSED";

      const poolDetail: PoolDetail = {
        address:             poolAddress,
        poolName:            summary.poolName   as string,
        state,
        creator:             summary.creator    as string,
        treasury:            "",
        totalDeposited:      (summary.totalDeposited     as bigint).toString(),
        distributionAmount:  (summary.distributionAmount as bigint).toString(),
        submissionStart:     Number(summary.submissionStart),
        submissionEnd:       Number(summary.submissionEnd),
        reviewEnd:           Number(summary.reviewEnd),
        signers:             signersArr  as string[],
        winners:             winnersArr  as string[],
        fieldDefinitions,
        isCancelled:         summary.isCancelled         as boolean,
        distributionEntered: summary.distributionEntered as boolean,
        createdAt:           Number(summary.submissionStart),
        signerCount:         Number(summary.signerCount),
        winnersCount:        Number(summary.winnersCount),
        proposalCount:       Number(summary.proposalCount),
        criteriaMetadataCID: bytes32ToString(cidBytes32 as string),
        quorum:              Number(quorumRaw),
        proposals:           proposalData,
        myProposal,
        myIsSigner,
        myIsWinner,
        myHasClaimed,
        myDonation,
      };

      setDetail(poolDetail);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      console.error("usePoolDetail error:", err);
    } finally {
      setLoading(false);
    }
  }, [poolAddress, walletAddress]);

  useEffect(() => { load(); }, [load]);

  return { detail, loading, error, refetch: load };
}
