import { useEffect, useState } from "react";
import { Contract, getAddress } from "ethers";
import { useWalletContext } from "../connection/WalletContext";
import { useAllPools } from "../hooks/read-hooks/useAllPools";
import useRunners from "../hooks/useRunners";
import GrantPoolABI from "../constants/GrantPoolABI.json";
import { shortAddr } from "../utils/format";
import { bytes32ToCid, ipfsGatewayUrl } from "../utils/ipfs";

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

async function fetchProposalMetadata(
  cid: string,
): Promise<{ title?: string; description?: string; applicantDocCID?: string }> {
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

    return {
      title: title || undefined,
      description: description || undefined,
      applicantDocCID: data.benefactorDocumentCID || undefined,
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
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  const addr = wallet.address?.toLowerCase();
  const signerPools = pools.filter((p) =>
    p.signers?.some((s) => s.toLowerCase() === addr),
  );
  const selectedPoolData = signerPools.find((p) => p.address === selectedPool);

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

        const results = await Promise.all(
          benefactors.map(async (benefactor): Promise<Proposal | null> => {
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
              const { title, description, applicantDocCID } =
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
    if (!signer || !selectedPool) return;
    try {
      setPendingVotes((prev) => new Set([...prev, benefactor]));
      const pc = new Contract(getAddress(selectedPool), GrantPoolABI, signer);
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
      showToast(
        err instanceof Error ? err.message : "Transaction failed",
        false,
      );
    } finally {
      setPendingVotes((prev) => {
        const next = new Set(prev);
        next.delete(benefactor);
        return next;
      });
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
                    poolState={selectedPoolData?.state ?? ""}
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

function ProposalCard({
  proposal,
  onVote,
  isPending,
  poolState,
}: {
  proposal: Proposal;
  onVote: (benefactor: string, approve: boolean) => void;
  isPending: boolean;
  poolState: string;
}) {
  const gatewayUrl = proposal.applicantDocCID
    ? ipfsGatewayUrl(proposal.applicantDocCID)
    : null;

  const canVote =
    poolState === "REVIEW" &&
    !proposal.hasVoted &&
    !proposal.hasRejected &&
    !proposal.isWinner;

  // Determine status badge
  let statusLabel = "Pending";
  let statusColor = "slate";
  if (proposal.isWinner) {
    statusLabel = "Approved";
    statusColor = "emerald";
  } else if (proposal.hasVoted && !proposal.hasRejected) {
    statusLabel = "Approved";
    statusColor = "emerald";
  } else if (proposal.hasRejected) {
    statusLabel = "Rejected";
    statusColor = "red";
  }

  const statusBgColor = {
    emerald: "bg-emerald-50 text-emerald-700 border border-emerald-200",
    red: "bg-red-50 text-red-700 border border-red-200",
    slate: "bg-slate-100 text-slate-700 border border-slate-200",
  }[statusColor];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow">
      {/* Header: Address + Status Badge */}
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">
            Applicant Wallet
          </p>
          <p className="text-sm font-mono font-bold text-teal-600">
            {shortAddr(proposal.benefactor)}
          </p>
        </div>
        <div
          className={`px-3 py-1 rounded-lg text-xs font-semibold ${statusBgColor}`}
        >
          {statusLabel}
        </div>
      </div>

      {/* Title */}
      {proposal.title && (
        <h3 className="text-base font-bold text-slate-900 mb-2 line-clamp-2">
          {proposal.title}
        </h3>
      )}

      {/* Description */}
      {proposal.description && (
        <p className="text-sm text-slate-600 mb-4 line-clamp-3">
          {proposal.description}
        </p>
      )}

      {/* Approval count */}
      <div className="mb-4 pb-4 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500">
          Approval votes:{" "}
          <span className="font-bold text-slate-700">
            {proposal.approvalCount}
          </span>
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {gatewayUrl && (
          <a
            href={gatewayUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors no-underline text-center"
          >
            📄 View Doc
          </a>
        )}

        {canVote ? (
          <>
            <button
              onClick={() => onVote(proposal.benefactor, true)}
              disabled={isPending}
              className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "…" : "Approve"}
            </button>
            <button
              onClick={() => onVote(proposal.benefactor, false)}
              disabled={isPending}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "…" : "✕"}
            </button>
          </>
        ) : proposal.hasVoted ? (
          <div className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-center">
            ✓ Voted
          </div>
        ) : proposal.hasRejected ? (
          <div className="flex-1 px-3 py-2 text-xs font-semibold rounded-lg bg-red-50 text-red-700 border border-red-200 text-center">
            Rejected
          </div>
        ) : null}
      </div>
    </div>
  );
}
