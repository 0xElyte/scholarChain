import { useEffect, useState } from "react";
import { Contract, getAddress } from "ethers";
import { useWalletContext } from "../connection/WalletContext";
import { useAllPools } from "../hooks/read-hooks/useAllPools";
import useRunners from "../hooks/useRunners";
import GrantPoolABI from "../constants/GrantPoolABI.json";
import { shortAddr, formatUSDTWithCommas } from "../utils/format";
import { bytes32ToCid, ipfsGatewayUrl } from "../utils/ipfs";
import { StatusBadge } from "../components/StatusBadge";

interface Proposal {
  benefactor: string;
  documentCID: string;
  payoutAddress: string;
  approvalCount: number;
  isWinner: boolean;
  hasVoted: boolean;
}

export function ReviewPage() {
  const { wallet } = useWalletContext();
  const { pools, loading: poolsLoading } = useAllPools();
  const { signer, readOnlyProvider } = useRunners();

  const [selectedPool, setSelectedPool] = useState<string | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loadingProposals, setLoadingProposals] = useState(false);
  const [txPending, setTxPending] = useState(false);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

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
        const events = await pc.queryFilter(
          pc.filters.ProposalSubmitted(),
          0,
        );
        const benefactors = [
          ...new Set(events.map((e: any) => e.args?.benefactor as string)),
        ].filter(Boolean);

        const results: Proposal[] = await Promise.all(
          benefactors.map(async (benefactor) => {
            try {
              const p = await pc.getProposal(benefactor);
              const hasVoted =
                wallet.address
                  ? await pc.hasVoted(wallet.address, benefactor).catch(() => false)
                  : false;
              const rawCid =
                typeof p.documentCID === "string" ? p.documentCID : "";
              const cid = rawCid.startsWith("0x")
                ? bytes32ToCid(rawCid)
                : rawCid;
              return {
                benefactor,
                documentCID: cid,
                payoutAddress: p.payoutAddress ?? "",
                approvalCount: Number(p.approvalCount ?? 0),
                isWinner: Boolean(p.isWinner),
                hasVoted: Boolean(hasVoted),
              };
            } catch {
              return {
                benefactor,
                documentCID: "",
                payoutAddress: "",
                approvalCount: 0,
                isWinner: false,
                hasVoted: false,
              };
            }
          }),
        );

        if (!cancelled) setProposals(results);
      } catch (err) {
        console.error("Failed to load proposals:", err);
      } finally {
        if (!cancelled) setLoadingProposals(false);
      }
    }

    void fetchProposals();
    return () => {
      cancelled = true;
    };
  }, [selectedPool, readOnlyProvider, wallet.address]);

  async function handleVote(benefactor: string) {
    if (!signer || !selectedPool) return;
    try {
      setTxPending(true);
      const pc = new Contract(getAddress(selectedPool), GrantPoolABI, signer);
      const tx = await pc.vote(getAddress(benefactor));
      await tx.wait();
      setProposals((prev) =>
        prev.map((p) =>
          p.benefactor.toLowerCase() === benefactor.toLowerCase()
            ? { ...p, hasVoted: true, approvalCount: p.approvalCount + 1 }
            : p,
        ),
      );
      showToast("Vote cast successfully");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Transaction failed", false);
    } finally {
      setTxPending(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
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

      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Review Proposals</h1>
        <p className="text-sm text-slate-500 mt-1">
          Vote on applicants for pools where you are a designated reviewer.
        </p>
      </div>

      <div className="grid lg:grid-cols-[300px_1fr] gap-6 items-start">
        {/* ── Pool list ── */}
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">
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
                You are not a designated reviewer on any pool.
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
                    <span>{pool.state}</span>
                    <span>·</span>
                    <span>{pool.proposalCount} proposals</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Proposal list ── */}
        <div>
          {!selectedPool ? (
            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-16 text-center">
              <p className="text-4xl mb-3">👈</p>
              <p className="text-sm font-semibold text-slate-700">
                Select a pool to view and review proposals
              </p>
            </div>
          ) : loadingProposals ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-28 rounded-2xl bg-slate-100 animate-pulse"
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
            <div>
              {/* Pool summary strip */}
              {selectedPoolData && (
                <div className="flex flex-wrap items-center gap-3 mb-4 p-4 rounded-xl bg-white border border-cyan-950/10 shadow-sm">
                  <StatusBadge state={selectedPoolData.state} size="sm" />
                  <span className="text-sm font-semibold text-slate-800">
                    {selectedPoolData.poolName}
                  </span>
                  <span className="text-xs text-slate-400">
                    {formatUSDTWithCommas(selectedPoolData.totalDeposited)} USDT
                    pooled
                  </span>
                  <span className="text-xs text-slate-400 ml-auto">
                    {proposals.length} proposal
                    {proposals.length !== 1 ? "s" : ""}
                  </span>
                </div>
              )}

              <div className="space-y-3">
                {proposals.map((proposal) => (
                  <ProposalCard
                    key={proposal.benefactor}
                    proposal={proposal}
                    onVote={handleVote}
                    txPending={txPending}
                    poolState={selectedPoolData?.state ?? ""}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProposalCard({
  proposal,
  onVote,
  txPending,
  poolState,
}: {
  proposal: Proposal;
  onVote: (b: string) => void;
  txPending: boolean;
  poolState: string;
}) {
  const gatewayUrl = proposal.documentCID
    ? ipfsGatewayUrl(proposal.documentCID)
    : null;

  const canVote =
    poolState === "REVIEW" && !proposal.hasVoted && !proposal.isWinner;

  return (
    <div
      className={`rounded-2xl p-5 border transition-all ${
        proposal.isWinner
          ? "bg-emerald-50 border-emerald-200 shadow-sm"
          : "bg-white border-cyan-950/10 shadow-sm"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Applicant info */}
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {proposal.isWinner && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">
                🏆 Winner
              </span>
            )}
            {proposal.hasVoted && !proposal.isWinner && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200">
                ✓ Voted
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-800 font-mono">
            {shortAddr(proposal.benefactor)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5 font-mono">
            Payout: {shortAddr(proposal.payoutAddress) || "—"}
          </p>
        </div>

        {/* Vote count + actions */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center">
            <p className="text-lg font-black text-slate-800 leading-none">
              {proposal.approvalCount}
            </p>
            <p className="text-[10px] text-slate-400 mt-0.5">votes</p>
          </div>

          {gatewayUrl && (
            <a
              href={gatewayUrl}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors no-underline"
            >
              View Doc ↗
            </a>
          )}

          {canVote ? (
            <button
              onClick={() => onVote(proposal.benefactor)}
              disabled={txPending}
              className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors cursor-pointer"
            >
              {txPending ? "Voting…" : "Approve"}
            </button>
          ) : poolState === "REVIEW" && proposal.hasVoted ? (
            <span className="px-4 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-500 border border-slate-200">
              Voted
            </span>
          ) : null}
        </div>
      </div>

      {/* CID */}
      {proposal.documentCID && (
        <p className="mt-3 text-[11px] text-slate-400 font-mono break-all border-t border-slate-100 pt-2">
          CID: {proposal.documentCID}
        </p>
      )}
    </div>
  );
}
