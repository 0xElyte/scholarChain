import { useEffect, useState } from "react";
import { Contract, getAddress, Interface } from "ethers";
import { useWalletContext } from "../connection/WalletContext";
import { useAllPools } from "../hooks/read-hooks/useAllPools";
import { usePoolDetails } from "../hooks/read-hooks/usePoolDetails";
import useRunners from "../hooks/useRunners";
import GrantPoolABI from "../constants/GrantPoolABI.json";
import useProposalVotes from "../hooks/read-hooks/useProposalVotes";
import { customReasonMapper } from "../utils/errorHandler";
import { shortAddr } from "../utils/format";
import { bytes32ToCid, ipfsGatewayUrl } from "../utils/ipfs";
import { Modal } from "../components/Modal";

interface Proposal {
  benefactor: string;
  documentCID: string;
  payoutAddress: string;
  approvalCount: number;
  isWinner: boolean;
  hasVoted: boolean;
  hasRejected: boolean;
  title?: string;
  description?: string;
  applicantDocCID?: string;
  formFields?: Array<{ label: string; value: string }>;
  loading?: boolean;
}

interface ProposalMetadata {
  benefactorAddress?: string;
  benefactorDocumentCID?: string;
  fields?: Array<{
    label: string;
    fieldType: string;
    required: boolean;
    value: string;
  }>;
}

interface ProposalCardProps {
  proposal: Proposal;
  onVote: (benefactor: string, approve: boolean) => void;
  isPending: boolean;
  poolState: string;
  poolAddress: string;
  votesRefreshTick?: number;
}

const grantPoolInterface = new Interface(GrantPoolABI as any);

async function fetchProposalMetadata(cid: string): Promise<{
  title?: string;
  description?: string;
  applicantDocCID?: string;
  formFields?: Array<{ label: string; value: string }>;
}> {
  try {
    const url = ipfsGatewayUrl(cid);
    if (!url) return {};
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return {};
    const data: ProposalMetadata = await response.json();

    // Extract title (first field) and description (second field or summary)
    const title = data.fields?.[0]?.value?.substring(0, 100) || "";
    const description =
      data.fields?.[1]?.value?.substring(0, 200) ||
      data.fields?.[0]?.value?.substring(100, 300) ||
      "";

    // Extract all form fields (questions and answers)
    const formFields =
      data.fields?.map((field) => ({
        label: field.label,
        value: field.value,
      })) || [];

    return {
      title: title || undefined,
      description: description || undefined,
      applicantDocCID: data.benefactorDocumentCID || undefined,
      formFields: formFields.length > 0 ? formFields : undefined,
    };
  } catch (err) {
    console.debug("Failed to fetch proposal metadata:", err);
    return {};
  }
}

export function ReviewPage() {
  const { wallet } = useWalletContext();
  const { pools, loading: poolsLoading } = useAllPools();
  const { signer, readOnlyProvider } = useRunners();

  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [pendingVotes, setPendingVotes] = useState<Set<string>>(new Set());
  const [votesRefreshTick, setVotesRefreshTick] = useState<number>(0);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  const { poolData: selectedPoolDetails } = usePoolDetails(
    selectedPool ?? undefined,
  );

  const addr = wallet.address?.toLowerCase();
  const signerPools = pools.filter((p) =>
    p.signers?.some((s) => s.toLowerCase() === addr),
  );
  const selectedPoolData = signerPools.find((p) => p.address === selectedPool);
  const selectedPoolState =
    selectedPoolDetails?.state ?? selectedPoolData?.state ?? "";

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  }

  useEffect(() => {
    if (!selectedPool || !readOnlyProvider) {
      setProposals([]);
      return;
    }
    let cancelled = false;

    async function fetchProposals() {
      setLoadingProposals(true);
      setProposals([]);
      try {
        const pc = new Contract(
          getAddress(selectedPool!),
          GrantPoolABI,
          readOnlyProvider!,
        );

        // Get current block for safe querying
        const currentBlock = await readOnlyProvider!.getBlockNumber();
        // Use max 30k block range (Sepolia limit is 50k)
        const fromBlock = Math.max(0, currentBlock - 30000);

        console.log(
          `Querying events from block ${fromBlock} to ${currentBlock} for pool ${selectedPool}`,
        );

        const events = await pc.queryFilter(
          pc.filters.ProposalSubmitted(),
          fromBlock,
          currentBlock,
        );

        console.log(`Found ${events.length} ProposalSubmitted events`);

        const benefactors = [
          ...new Set(
            events
              .map((e: any) => e.args?.benefactor as string)
              .filter(Boolean),
          ),
        ].filter(Boolean);

        console.log(
          `Extracted ${benefactors.length} unique benefactors`,
          benefactors,
        );

        const results: (Proposal | null)[] = await Promise.all(
          benefactors.map(async (benefactor) => {
            try {
              const p = await pc.getProposal(benefactor);

              // Check if proposal exists
              if (!p.exists) {
                console.warn(
                  `Proposal for ${benefactor} has exists=false, skipping`,
                );
                return null;
              }

              const hasVoted = wallet.address
                ? await pc
                    .hasVoted(wallet.address, benefactor)
                    .catch(() => false)
                : false;
              const rawCid =
                typeof p.documentCID === "string" ? p.documentCID : "";
              const cid = rawCid.startsWith("0x")
                ? bytes32ToCid(rawCid)
                : rawCid;

              // Fetch proposal metadata from IPFS
              const { title, description, applicantDocCID, formFields } =
                await fetchProposalMetadata(cid);

              // Check if voted NO (rejected)
              const rejections = await pc.queryFilter(
                pc.filters.VoteCast(wallet.address || undefined, benefactor),
                fromBlock,
                currentBlock,
              );
              const hasRejected = rejections.some(
                (e: any) => e.args?.approved === false,
              );

              return {
                benefactor,
                documentCID: cid,
                payoutAddress: p.payoutAddress ?? "",
                approvalCount: Number(p.approvalCount ?? 0),
                isWinner: Boolean(p.isWinner),
                hasVoted: Boolean(hasVoted),
                hasRejected: Boolean(hasRejected),
                title,
                description,
                applicantDocCID,
                formFields,
              };
            } catch (err) {
              console.error(`Error processing benefactor ${benefactor}:`, err);
              return null;
            }
          }),
        );

        // Filter out nulls
        const validResults = results.filter((r): r is Proposal => r !== null);

        console.log(`Filtered to ${validResults.length} valid proposals`);

        if (!cancelled) setProposals(validResults);
      } catch (err) {
        console.error("Failed to load proposals:", err);
        if (!cancelled) setProposals([]);
      } finally {
        if (!cancelled) setLoadingProposals(false);
      }
    }

    void fetchProposals();
    return () => {
      cancelled = true;
    };
  }, [selectedPool, readOnlyProvider, wallet.address]);

  async function handleVote(benefactor: string, approve: boolean) {
    if (!signer || !selectedPool || selectedPoolState !== "ACTIVE") return;
    try {
      setPendingVotes((prev) => new Set([...prev, benefactor]));
      const pc = new Contract(getAddress(selectedPool), GrantPoolABI, signer);
      // Double-check on-chain that the connected signer hasn't already voted for this benefactor.
      try {
        const signerAddr = (await signer.getAddress()).toLowerCase();
        const already = await pc.hasVoted(signerAddr, getAddress(benefactor));
        if (already) {
          showToast("You already voted on this proposal", false);
          return;
        }
      } catch (checkErr) {
        // If the read fails, continue — contract may not implement hasVoted reliably for this caller.
        console.debug(
          "hasVoted check failed, continuing to attempt vote:",
          checkErr,
        );
      }

      const tx = await pc.vote(getAddress(benefactor), approve);
      await tx.wait();

      setProposals((prev) =>
        prev.map((p) =>
          p.benefactor.toLowerCase() === benefactor.toLowerCase()
            ? {
                ...p,
                hasVoted: approve ? true : p.hasVoted,
                hasRejected: !approve ? true : p.hasRejected,
                approvalCount: approve ? p.approvalCount + 1 : p.approvalCount,
              }
            : p,
        ),
      );
      showToast(approve ? "Vote cast successfully" : "Rejection recorded");
    } catch (err) {
      // Try to extract revert payload and decode with the contract ABI, then map to friendly message
      const candidateData = [
        (err as { data?: unknown }).data,
        (err as { info?: { error?: { data?: unknown } } }).info?.error?.data,
        (err as { error?: { data?: unknown } }).error?.data,
      ].find((value): value is string => typeof value === "string");

      if (candidateData) {
        try {
          const decoded = grantPoolInterface.parseError(candidateData);
          showToast(customReasonMapper(decoded as any), false);
        } catch {
          const msg =
            (err as any)?.error?.message ||
            (err as any)?.message ||
            String(err);
          showToast(
            msg.includes("revert") ? "Transaction would revert" : msg,
            false,
          );
        }
      } else {
        const msg =
          (err as any)?.error?.message || (err as any)?.message || String(err);
        if ((err as any)?.code === "CALL_EXCEPTION" || msg.includes("revert")) {
          showToast(
            "Transaction would revert (maybe you already voted)",
            false,
          );
        } else {
          showToast(msg, false);
        }
      }
    } finally {
      setPendingVotes((prev) => {
        const next = new Set(prev);
        next.delete(benefactor);
        return next;
      });
      // Trigger votes refresh so hooks re-query immediately after the tx is mined
      setVotesRefreshTick((t) => t + 1);
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium border ${
            toast.ok
              ? "bg-emerald-100 text-emerald-800 border-emerald-200"
              : "bg-red-100 text-red-800 border-red-200"
          }`}
        >
          {toast.ok ? "✓" : "✕"} {toast.text}
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Page header */}
        <div className="mb-8">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">
            Signer Workspace
          </p>
          {selectedPoolData && (
            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              Reviewing: {selectedPoolData.poolName}
            </h1>
          )}
          <p className="text-sm text-slate-600">
            {selectedPoolData
              ? "Evaluate applications for your pool. Ensure proposals meet the technical standards defined in the criteria."
              : "Select a pool to review applications"}
          </p>
        </div>

        <div className="grid lg:grid-cols-[280px_1fr] gap-6 items-start">
          {/* ── Pool selector sidebar ── */}
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">
              Assigned Pools
            </p>
            {poolsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-16 rounded-xl bg-slate-100 animate-pulse"
                  />
                ))}
              </div>
            ) : signerPools.length === 0 ? (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-5 text-center">
                <p className="text-2xl mb-2">🔍</p>
                <p className="text-sm font-semibold text-slate-700 mb-1">
                  No pools assigned
                </p>
                <p className="text-xs text-slate-500">
                  You are not a designated reviewer.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {signerPools.map((pool) => (
                  <button
                    key={pool.address}
                    onClick={() => setSelectedPool(pool.address)}
                    className={`w-full text-left rounded-xl p-4 border transition-all cursor-pointer ${
                      selectedPool === pool.address
                        ? "bg-[#07182b] text-white border-[#07182b] shadow-lg"
                        : "bg-white text-slate-700 border-slate-200 hover:border-teal-400 hover:bg-teal-50/60"
                    }`}
                  >
                    <p className="text-sm font-semibold truncate">
                      {pool.poolName}
                    </p>
                    <div
                      className={`flex items-center gap-2 mt-1 text-xs ${
                        selectedPool === pool.address
                          ? "text-teal-200"
                          : "text-slate-500"
                      }`}
                    >
                      <span className="capitalize">{pool.state}</span>
                      <span>·</span>
                      <span>{pool.proposalCount} pending</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Proposals grid ── */}
          <div>
            {!selectedPool ? (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-3">👈</p>
                <p className="text-sm font-semibold text-slate-700">
                  Select a pool to view and review proposals
                </p>
              </div>
            ) : loadingProposals ? (
              <div className="grid gap-4 md:grid-cols-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-64 rounded-2xl bg-slate-100 animate-pulse"
                  />
                ))}
              </div>
            ) : proposals.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-16 text-center">
                <p className="text-4xl mb-3">📭</p>
                <p className="text-sm font-semibold text-slate-700">
                  No proposals submitted yet
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Applicants submit during the active phase.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.benefactor}
                    proposal={proposal}
                    onVote={handleVote}
                    isPending={pendingVotes.has(proposal.benefactor)}
                    poolState={selectedPoolState}
                    poolAddress={selectedPool!}
                    votesRefreshTick={votesRefreshTick}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProposalCard(props: ProposalCardProps) {
  const {
    proposal,
    onVote,
    isPending,
    poolState,
    poolAddress,
    votesRefreshTick,
  } = props;
  const gatewayUrl = proposal.applicantDocCID
    ? ipfsGatewayUrl(proposal.applicantDocCID)
    : null;
  const [docModal, setDocModal] = useState(false);

  const {
    approvals,
    rejections,
    totalVotes,
    voters,
    signerCount,
    hasVoted: userHasVoted,
  } = useProposalVotes(poolAddress, proposal.benefactor, votesRefreshTick);

  const canVote = poolState === "ACTIVE" && !proposal.isWinner && !userHasVoted;

  const isPoolActive = poolState === "ACTIVE";
  const disableReason = isPending
    ? "Transaction pending"
    : !isPoolActive
      ? "Voting is only available during ACTIVE pool state"
      : proposal.isWinner
        ? "This proposal has already been selected"
        : userHasVoted
          ? "You already reviewed this proposal"
          : "";

  // Determine status badge
  let statusLabel = "IN REVIEW";
  let statusColor = "amber";
  if (proposal.isWinner) {
    statusLabel = "APPROVED WINNER";
    statusColor = "purple";
  } else if (
    approvals >= Math.ceil((signerCount * 70) / 100) &&
    signerCount > 0
  ) {
    statusLabel = "QUORUM REACHED";
    statusColor = "emerald";
  } else if (rejections > 0 && approvals === 0 && totalVotes > 0) {
    statusLabel = "NOT SELECTED";
    statusColor = "red";
  } else if (userHasVoted) {
    statusLabel = "YOU VOTED";
    statusColor = "blue";
  }

  const statusPalette = {
    emerald: "bg-emerald-900/70 text-emerald-300 border border-emerald-700",
    red: "bg-red-900/60 text-red-300 border border-red-700",
    amber: "bg-amber-900/60 text-amber-300 border border-amber-700",
    purple:
      "bg-gradient-to-r from-purple-700 to-violet-500 text-white border border-purple-600",
    blue: "bg-sky-900/60 text-sky-300 border border-sky-700",
  } as const;

  const statusBgColor =
    statusPalette[statusColor as keyof typeof statusPalette] ||
    "bg-slate-100 text-slate-700 border border-slate-200";

  return (
    <div className="rounded-2xl border border-slate-800 bg-[#071826] p-6 shadow-lg hover:shadow-2xl transition-shadow backdrop-blur-md">
      {/* Header: Address + Status Badge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
            Applicant Wallet
          </p>
          <p className="text-sm font-mono font-bold text-teal-300">
            {shortAddr(proposal.benefactor)}
          </p>
        </div>
        <div
          className={`px-3 py-1 rounded-lg text-xs font-semibold ${statusBgColor}`}
        >
          {statusLabel}
        </div>
      </div>

      {/* Form Fields (Questions & Answers) */}
      {proposal.formFields && proposal.formFields.length > 0 && (
        <div className="mb-4 space-y-3 pb-4 border-b border-slate-700">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Answers
          </p>
          {proposal.formFields.map((field, idx) => (
            <div key={idx} className="text-sm">
              <p className="text-xs font-semibold text-slate-300 mb-1">
                Q: {field.label}
              </p>
              <p className="text-xs text-slate-100 bg-slate-800/40 p-2 rounded border border-slate-700">
                {field.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Quorum / progress */}
      <div className="mb-4 pb-4 border-b border-slate-700 pt-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-slate-400">Approvals</p>
            <p className="text-lg font-semibold text-white">
              {approvals} / {signerCount || 0}
            </p>
          </div>
          <div className="text-right text-xs text-slate-400">
            <p>
              Quorum Needed:{" "}
              <span className="font-semibold text-white">
                {Math.ceil((signerCount * 70) / 100) || 0}
              </span>
            </p>
            <p>
              Remaining:{" "}
              <span className="font-semibold text-white">
                {Math.max(0, Math.ceil((signerCount * 70) / 100) - approvals)}
              </span>
            </p>
          </div>
        </div>

        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${signerCount > 0 ? Math.min(100, Math.round((approvals / signerCount) * 100)) : 0}%`,
              background: "linear-gradient(90deg,#06b6d4,#7c3aed)",
              boxShadow: "0 6px 18px rgba(124,58,237,0.24)",
            }}
          />
        </div>
      </div>

      {/* Reviewer indicators and actions */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          {Array.from({ length: signerCount || 5 }).map((_, i) => {
            const voted = voters[i]?.approved ?? false;
            return (
              <div
                key={i}
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  voted
                    ? "bg-emerald-400 text-black"
                    : "bg-slate-700 text-slate-300"
                }`}
                title={voters[i]?.voter || "Pending"}
              >
                {voted ? "✔" : "○"}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3">
          <div title={!canVote || isPending ? disableReason : undefined}>
            <button
              onClick={() => onVote(proposal.benefactor, true)}
              disabled={!canVote || isPending}
              aria-disabled={!canVote || isPending}
              className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                canVote
                  ? "bg-gradient-to-r from-teal-400 to-cyan-400 text-black shadow-lg hover:scale-105"
                  : "bg-slate-700 text-slate-300 cursor-not-allowed"
              }`}
            >
              {isPending ? "Sending..." : "Approve"}
            </button>
          </div>
        </div>
      </div>

      {/* View Doc button */}
      {gatewayUrl && (
        <div className="mb-4">
          <button
            onClick={() => setDocModal(true)}
            className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            📄 View Full Proposal
          </button>
        </div>
      )}

      <Modal
        open={docModal}
        onClose={() => setDocModal(false)}
        title="Full Proposal"
      >
        <div className="space-y-4">
          <iframe
            src={gatewayUrl ?? ""}
            title="Proposal document"
            className="w-full h-[70vh] rounded-xl border border-slate-200 bg-white"
          />
        </div>
      </Modal>
    </div>
  );
}