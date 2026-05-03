import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { BrowserProvider, Contract, parseUnits } from "ethers";
import type { WalletState, UserRole } from "../types";
import { FieldType } from "../types";
import { usePoolDetail, cidToBytes32 } from "../hooks/usePoolDetail";
import { StatusBadge } from "../components/StatusBadge";
import { Modal } from "../components/Modal";
import { ABI } from "../data/ABI.js";
import { CONTRACT_ADDRESSES } from "../data/contracts";
import { formatUSDT, formatDate, shortAddr, timeRemaining } from "../utils/format";

interface Props {
  wallet: WalletState;
}

export function PoolDetailPage({ wallet }: Props) {
  const { address: poolAddress } = useParams<{ address: string }>();
  const { detail, loading, error, refetch } = usePoolDetail(poolAddress, wallet.address);

  const [donateModal,  setDonateModal]  = useState(false);
  const [proposeModal, setProposeModal] = useState(false);
  const [donateAmount, setDonateAmount] = useState("");
  const [docCID,       setDocCID]       = useState("");
  const [payoutAddr,   setPayoutAddr]   = useState("");
  const [txPending,    setTxPending]    = useState(false);
  const [toast,        setToast]        = useState<string | null>(null);
  const [toastError,   setToastError]   = useState(false);
  const [voteTarget,   setVoteTarget]   = useState<string | null>(null);

  function showToast(msg: string, isError = false) {
    setToast(msg);
    setToastError(isError);
    setTimeout(() => setToast(null), 4000);
  }

  async function withTx(fn: () => Promise<void>) {
    setTxPending(true);
    try {
      await fn();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes("rejected") && !msg.includes("denied")) {
        showToast(msg.slice(0, 100), true);
        console.error(err);
      }
    } finally {
      setTxPending(false);
    }
  }

  async function getSigner() {
    if (!window.ethereum) throw new Error("MetaMask not found");
    const provider = new BrowserProvider(window.ethereum);
    return provider.getSigner();
  }

  // Loading / error states
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <p className="text-4xl mb-4 animate-pulse">⏳</p>
        <p className="text-slate-500 text-sm">Loading pool data from chain…</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-5xl mb-4">❓</p>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          {error ? "Failed to load pool" : "Pool not found"}
        </h2>
        <p className="text-slate-500 text-sm mb-6">{error ?? "This address doesn't match any known pool."}</p>
        <Link to="/dashbar/explore" className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 no-underline">
          Back to Explorer
        </Link>
      </div>
    );
  }

  const pool   = detail;
  const addr   = wallet.address?.toLowerCase();
  const isCreator = addr === pool.creator.toLowerCase();
  const isSigner  = pool.myIsSigner;
  const isWinner  = pool.myIsWinner;

  const roles: UserRole[] = [];
  if (isCreator)  roles.push("creator");
  if (isSigner)   roles.push("signer");
  if (isWinner)   roles.push("winner");
  if (pool.myProposal && !isWinner) roles.push("applicant");

  const quorum        = pool.quorum;
  const canDonate     = pool.state === "PENDING" || pool.state === "ACTIVE";
  const canSubmit     = pool.state === "ACTIVE" && !pool.myProposal && wallet.isConnected;
  const canVote       = isSigner && (pool.state === "ACTIVE" || pool.state === "REVIEW");
  const canDistribute = pool.state === "DISTRIBUTING" && !pool.distributionEntered;
  const canClaim      = pool.state === "DISTRIBUTING" && isWinner && !pool.myHasClaimed;
  const canRefund     = pool.state === "CANCELLED" || (pool.state === "DISTRIBUTING" && pool.winners.length === 0);
  const canCancel     = isCreator && pool.state === "PENDING";

  const ROLE_COLORS: Record<UserRole, string> = {
    creator:   "bg-teal-50 text-teal-700 border-teal-200",
    signer:    "bg-amber-50 text-amber-700 border-amber-200",
    winner:    "bg-emerald-50 text-emerald-700 border-emerald-200",
    applicant: "bg-teal-50 text-teal-700 border-teal-200",
    donor:     "bg-slate-50 text-slate-600 border-slate-200",
    visitor:   "bg-slate-50 text-slate-600 border-slate-200",
  };

  /* ── Transaction handlers ── */
  async function handleDonate() {
    if (!donateAmount || parseFloat(donateAmount) <= 0) return;
    setDonateModal(false);
    await withTx(async () => {
      const sig    = await getSigner();
      const rawAmt = parseUnits(donateAmount, 6);
      const usdt   = new Contract(CONTRACT_ADDRESSES.MockUSDT, ABI.MockUsdt, sig);
      const approveTx = await usdt.approve(pool.address, rawAmt);
      await approveTx.wait();
      const pc      = new Contract(pool.address, ABI.GrantPool, sig);
      const donateTx = await pc.donate(rawAmt);
      await donateTx.wait();
      showToast(`Donated ${donateAmount} USDT successfully`);
      setDonateAmount("");
      refetch();
    });
  }

  async function handlePropose() {
    if (!docCID || !payoutAddr) return;
    setProposeModal(false);
    await withTx(async () => {
      const sig = await getSigner();
      const pc  = new Contract(pool.address, ABI.GrantPool, sig);
      const tx  = await pc.submitProposal(cidToBytes32(docCID.trim()), payoutAddr.trim());
      await tx.wait();
      showToast("Proposal submitted successfully");
      setDocCID(""); setPayoutAddr("");
      refetch();
    });
  }

  async function handleVote(benefactor: string, approve: boolean) {
    setVoteTarget(null);
    await withTx(async () => {
      const sig = await getSigner();
      const pc  = new Contract(pool.address, ABI.GrantPool, sig);
      const tx  = await pc.vote(benefactor, approve);
      await tx.wait();
      showToast(`Voted ${approve ? "Approve" : "Reject"} for ${shortAddr(benefactor)}`);
      refetch();
    });
  }

  async function handleEnterDistribution() {
    await withTx(async () => {
      const sig = await getSigner();
      const pc  = new Contract(pool.address, ABI.GrantPool, sig);
      const tx  = await pc.enterDistributionPhase();
      await tx.wait();
      showToast("Distribution phase entered — 10% fee sent to treasury");
      refetch();
    });
  }

  async function handleClaimGrant() {
    await withTx(async () => {
      const sig = await getSigner();
      const pc  = new Contract(pool.address, ABI.GrantPool, sig);
      const tx  = await pc.claimGrant();
      await tx.wait();
      showToast("Grant claimed! Funds sent & SBT minted");
      refetch();
    });
  }

  async function handleClaimRefund() {
    await withTx(async () => {
      const sig = await getSigner();
      const pc  = new Contract(pool.address, ABI.GrantPool, sig);
      const tx  = await pc.claimRefund();
      await tx.wait();
      showToast("Refund claimed successfully");
      refetch();
    });
  }

  async function handleCancel() {
    if (!confirm("Are you sure you want to cancel this pool? This cannot be undone.")) return;
    await withTx(async () => {
      const sig = await getSigner();
      const pc  = new Contract(pool.address, ABI.GrantPool, sig);
      const tx  = await pc.cancelPool();
      await tx.wait();
      showToast("Pool cancelled. Donors may claim refunds.");
      refetch();
    });
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <Link to="/dashbar/explore" className="text-sm text-slate-500 hover:text-teal-700 no-underline mb-6 inline-block">
        ← Grant Pools
      </Link>

      {/* Toast */}
      {(txPending || toast) && (
        <div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
          txPending
            ? "bg-amber-100 text-amber-800 border border-amber-200"
            : toastError
              ? "bg-red-100 text-red-800 border border-red-200"
              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
        }`}>
          {txPending ? "⏳ Waiting for confirmation…" : toastError ? `⚠️ ${toast}` : `✓ ${toast}`}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusBadge state={pool.state} />
          {roles.map((r) => (
            <span key={r} className={`text-xs px-2.5 py-1 rounded-full font-medium border ${ROLE_COLORS[r]}`}>
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </span>
          ))}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">{pool.poolName}</h1>
        <p className="text-sm text-slate-500">
          Created by <span className="font-mono">{shortAddr(pool.creator)}</span>
          {" · "}Contract <span className="font-mono">{shortAddr(pool.address)}</span>
          {" · "}
          <a
            href={`https://sepolia.etherscan.io/address/${pool.address}`}
            target="_blank" rel="noreferrer"
            className="text-teal-700 hover:underline"
          >
            Etherscan ↗
          </a>
        </p>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mb-8">
        {canDonate && (
          <button onClick={() => setDonateModal(true)} disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer">
            💰 Donate USDT
          </button>
        )}
        {canSubmit && (
          <button onClick={() => setProposeModal(true)} disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer">
            📝 Submit Proposal
          </button>
        )}
        {canDistribute && (
          <button onClick={handleEnterDistribution} disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer">
            🚀 Enter Distribution
          </button>
        )}
        {canClaim && (
          <button onClick={handleClaimGrant} disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer">
            🏆 Claim Grant
          </button>
        )}
        {canRefund && (
          <button onClick={handleClaimRefund} disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer">
            ↩ Claim Refund
          </button>
        )}
        {canCancel && (
          <button onClick={handleCancel} disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors cursor-pointer">
            Cancel Pool
          </button>
        )}
      </div>

      {/* Body grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* ── Main column ── */}
        <div className="lg:col-span-2 space-y-6">

          {/* Overview */}
          <Card title="Pool Overview">
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { l: "Total Deposited",   v: `${formatUSDT(pool.totalDeposited)} USDT`,        c: "text-slate-800" },
                { l: "Quorum Required",   v: `${quorum} of ${pool.signers.length} reviewers`,  c: "text-slate-800" },
                { l: "Submissions Close", v: formatDate(pool.submissionEnd * 1000),            c: "text-slate-800" },
                { l: "Review Ends",       v: formatDate(pool.reviewEnd * 1000),                c: "text-slate-800" },
                ...(pool.distributionAmount !== "0"
                  ? [{ l: "Per Winner", v: `${formatUSDT(pool.distributionAmount)} USDT`, c: "text-amber-600" }]
                  : []),
                ...(pool.state === "ACTIVE" || pool.state === "PENDING"
                  ? [{ l: "Time Remaining", v: timeRemaining(pool.submissionEnd), c: "text-teal-700" }]
                  : []),
                ...(pool.myDonation !== "0.00"
                  ? [{ l: "Your Donation", v: `${pool.myDonation} USDT`, c: "text-teal-700" }]
                  : []),
              ].map(({ l, v, c }) => (
                <div key={l} className="bg-white rounded-xl p-4 border border-cyan-950/10 shadow-sm">
                  <p className="text-xs text-slate-500 mb-1">{l}</p>
                  <p className={`font-semibold text-sm ${c}`}>{v}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Application schema */}
          {pool.fieldDefinitions.length > 0 && (
            <Card title="Application Form">
              <p className="text-sm text-slate-500 mb-4">Applicants must fill in the following fields:</p>
              <div className="space-y-2">
                {pool.fieldDefinitions.map((f, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-white border border-cyan-950/10 shadow-sm">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      f.fieldType === FieldType.TEXT
                        ? "bg-slate-100 text-slate-600 border-slate-300"
                        : "bg-teal-50 text-teal-700 border-teal-200"
                    }`}>
                      {f.fieldType === FieldType.TEXT ? "Text" : f.fieldType === FieldType.URL ? "URL" : "Upload"}
                    </span>
                    <span className="text-sm text-slate-700 flex-1">{f.label}</span>
                    {f.required && <span className="text-xs text-red-500 font-medium">Required</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Proposals + voting */}
          {(pool.state === "ACTIVE" || pool.state === "REVIEW" || pool.state === "DISTRIBUTING" || pool.state === "CLOSED") && (
            <Card title={`Proposals (${pool.proposals.length})`}>
              {pool.proposals.length === 0 ? (
                <p className="text-sm text-slate-500">No proposals submitted yet.</p>
              ) : (
                <div className="space-y-4">
                  {pool.proposals.map((prop) => (
                    <div key={prop.benefactor} className="scholar-card rounded-xl p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800 font-mono">{shortAddr(prop.benefactor)}</p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Submitted {formatDate(prop.submittedAt * 1000)} · CID:{" "}
                            <span className="font-mono">{prop.documentCID.slice(0, 18)}…</span>
                          </p>
                        </div>
                        {prop.isWinner && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 font-medium">
                            🏆 Winner
                          </span>
                        )}
                      </div>

                      {/* Vote progress */}
                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-slate-500 mb-1">
                          <span>{prop.approvalCount} approval{prop.approvalCount !== 1 ? "s" : ""}</span>
                          <span>{quorum} needed</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-600 rounded-full transition-all"
                            style={{ width: `${Math.min(100, (prop.approvalCount / Math.max(1, quorum)) * 100)}%` }}
                          />
                        </div>
                      </div>

                      {/* Vote buttons — hidden if signer already voted */}
                      {canVote && !prop.isWinner && !prop.hasVotedOnThis && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {voteTarget === prop.benefactor ? (
                            <>
                              <button
                                onClick={() => handleVote(prop.benefactor, true)}
                                disabled={txPending}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer">
                                ✓ Approve
                              </button>
                              <button
                                onClick={() => handleVote(prop.benefactor, false)}
                                disabled={txPending}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 cursor-pointer">
                                ✗ Reject
                              </button>
                              <button onClick={() => setVoteTarget(null)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer">
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button onClick={() => setVoteTarget(prop.benefactor)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-50 cursor-pointer">
                              Cast Vote
                            </button>
                          )}
                        </div>
                      )}
                      {canVote && prop.hasVotedOnThis && !prop.isWinner && (
                        <p className="text-xs text-slate-400 mt-2 italic">✓ You already voted on this proposal</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* My proposal */}
          {pool.myProposal && (
            <Card title="Your Proposal" highlight>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { l: "Document CID",   v: `${pool.myProposal.documentCID.slice(0, 22)}…` },
                  { l: "Payout Address", v: shortAddr(pool.myProposal.payoutAddress) },
                  { l: "Approvals",      v: `${pool.myProposal.approvalCount} / ${quorum}` },
                  { l: "Status",         v: pool.myProposal.isWinner ? "🏆 Winner" : pool.myProposal.hasClaimed ? "✓ Claimed" : "⏳ Under Review" },
                ].map(({ l, v }) => (
                  <div key={l} className="bg-teal-50 rounded-lg p-3">
                    <p className="text-xs text-teal-600 mb-0.5">{l}</p>
                    <p className="text-sm font-semibold text-teal-900 font-mono">{v}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-5">
          {pool.winners.length > 0 && (
            <Card title={`Winners (${pool.winners.length})`}>
              <ul className="space-y-2">
                {pool.winners.map((w) => (
                  <li key={w} className="flex items-center gap-2 text-sm">
                    <span>🏆</span>
                    <span className="font-mono text-slate-700">{shortAddr(w)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card title={`Review Panel (${pool.signers.length})`}>
            <ul className="space-y-2">
              {pool.signers.map((s) => (
                <li key={s} className="flex items-center gap-2 text-sm">
                  <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                  <span className="font-mono text-slate-700">{shortAddr(s)}</span>
                  {s.toLowerCase() === addr && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">You</span>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Criteria Document">
            <CriteriaViewer cid={pool.criteriaMetadataCID} />
          </Card>

          <Card title="Contract">
            <p className="text-xs font-mono text-slate-600 break-all mb-2">{pool.address}</p>
            <a
              href={`https://sepolia.etherscan.io/address/${pool.address}`}
              target="_blank" rel="noreferrer"
              className="text-xs text-teal-700 hover:underline no-underline"
            >
              View on Etherscan ↗
            </a>
          </Card>
        </div>
      </div>

      {/* Donate modal */}
      <Modal open={donateModal} onClose={() => setDonateModal(false)} title="Donate to Pool">
        <p className="text-sm text-slate-600 mb-4">Donating to <strong>{pool.poolName}</strong></p>
        <p className="text-xs text-slate-500 mb-2">This will require two transactions: approve + donate.</p>
        <label className="block text-sm font-medium text-slate-700 mb-1">Amount (USDT)</label>
        <input type="number" min={1} placeholder="Enter amount"
          value={donateAmount} onChange={(e) => setDonateAmount(e.target.value)}
          className="scholar-input w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 mb-1" />
        <p className="text-xs text-slate-400 mb-6">Wallet balance: {wallet.balance} USDT</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setDonateModal(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button
            onClick={handleDonate}
            disabled={!donateAmount || parseFloat(donateAmount) <= 0}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer">
            Confirm
          </button>
        </div>
      </Modal>

      {/* Propose modal */}
      <Modal open={proposeModal} onClose={() => setProposeModal(false)} title="Submit Proposal">
        <p className="text-sm text-slate-600 mb-4">Submitting to <strong>{pool.poolName}</strong></p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Application Document CID <span className="text-red-500">*</span>
            </label>
            <input type="text" placeholder="IPFS CID of your application (QmXyz…)"
              value={docCID} onChange={(e) => setDocCID(e.target.value)}
              className="scholar-input w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono" />
            <p className="text-xs text-slate-400 mt-1">Upload your application JSON to IPFS and paste the CID here.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payout Address <span className="text-red-500">*</span>
            </label>
            <input type="text" placeholder="0x…"
              value={payoutAddr} onChange={(e) => setPayoutAddr(e.target.value)}
              className="scholar-input w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono" />
          </div>
          {pool.fieldDefinitions.length > 0 && (
            <div className="bg-white rounded-xl p-3 space-y-1.5 border border-cyan-950/10 shadow-sm">
              <p className="text-xs font-medium text-slate-600 mb-2">Required fields in your JSON:</p>
              {pool.fieldDefinitions.map((f, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold">{i + 1}</span>
                  {f.label}{f.required && <span className="text-red-500">*</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setProposeModal(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer">Cancel</button>
          <button
            onClick={handlePropose}
            disabled={!docCID || !payoutAddr}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer">
            Submit
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Card({ title, children, highlight }: { title: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-5 ${highlight ? "border border-teal-200 bg-teal-50/50 shadow-lg shadow-teal-950/5" : "scholar-card"}`}>
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">{title}</h2>
      {children}
    </div>
  );
}

/* ── CID validity helpers ── */
const IPFS_GATEWAY = "https://ipfs.io/ipfs";
function isValidCid(cid: string) {
  return /^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{58,})$/i.test(cid.trim());
}

type CriteriaState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "html";     html: string }
  | { status: "download"; url: string; filename: string; mime: string }
  | { status: "error";    msg: string };

function CriteriaViewer({ cid }: { cid: string }) {
  const [state, setState] = useState<CriteriaState>({ status: "idle" });

  useEffect(() => {
    if (!cid || !isValidCid(cid)) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const url = `${IPFS_GATEWAY}/${cid.trim()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Gateway returned ${res.status}`);

        const mime     = (res.headers.get("content-type") ?? "").toLowerCase();
        const cdHeader = res.headers.get("content-disposition") ?? "";
        // Extract filename from content-disposition if present
        const nameMatch = cdHeader.match(/filename\*?=['"]?(?:UTF-8'')?([^;"'\n]+)/i);
        const rawName   = nameMatch?.[1] ?? `criteria-${cid.slice(0, 8)}`;
        const filename  = decodeURIComponent(rawName.trim());

        const isHtml     = mime.includes("text/html");
        const isMarkdown = mime.includes("text/markdown") || filename.match(/\.md$/i);
        const isText     = mime.includes("text/plain") && !isMarkdown;

        if (isHtml) {
          const text = await res.text();
          if (!cancelled) setState({ status: "html", html: text });
        } else if (isMarkdown || isText) {
          // Display as preformatted text
          const text = await res.text();
          if (!cancelled) setState({
            status: "html",
            // Wrap in a simple styled pre so it renders nicely
            html: `<pre style="white-space:pre-wrap;font-family:inherit;font-size:13px;line-height:1.7">${
              text.replace(/</g, "&lt;").replace(/>/g, "&gt;")
            }</pre>`,
          });
        } else {
          // Binary/unknown (PDF, DOCX, etc.) → offer download
          const blob = await res.blob();
          const objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setState({ status: "download", url: objectUrl, filename, mime });
        }
      } catch (err: unknown) {
        if (!cancelled) setState({
          status: "error",
          msg: err instanceof Error ? err.message : String(err),
        });
      }
    })();

    return () => { cancelled = true; };
  }, [cid]);

  if (!cid || !isValidCid(cid)) {
    return (
      <p className="text-xs text-slate-400 italic">
        No criteria document on-chain.
      </p>
    );
  }

  const gatewayUrl = `${IPFS_GATEWAY}/${cid.trim()}`;

  return (
    <div className="space-y-3">
      {/* CID + raw link always visible */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-mono text-slate-500 break-all">{cid}</span>
        <a
          href={gatewayUrl}
          target="_blank" rel="noreferrer"
          className="text-xs text-teal-700 hover:underline no-underline shrink-0"
        >
          ↗ IPFS
        </a>
      </div>

      {/* Content area */}
      {state.status === "loading" && (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
          <span className="w-3 h-3 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
          Fetching from IPFS…
        </div>
      )}

      {state.status === "error" && (
        <div className="flex gap-2 p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
          <span>⚠️</span>
          <span>Could not load criteria: {state.msg}</span>
        </div>
      )}

      {state.status === "html" && (
        <div className="border border-cyan-950/10 rounded-xl overflow-hidden">
          <div
            className="p-4 text-sm text-slate-700 leading-relaxed overflow-y-auto max-h-[480px] prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: state.html }}
          />
        </div>
      )}

      {state.status === "download" && (
        <div className="flex items-center gap-3 p-4 rounded-xl border border-cyan-950/10 bg-slate-50">
          <span className="text-3xl">
            {state.mime.includes("pdf")
              ? "📕"
              : state.mime.includes("word") || state.filename.match(/\.docx?$/i)
                ? "📘"
                : "📄"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-800 truncate">{state.filename}</p>
            <p className="text-xs text-slate-400 mt-0.5 uppercase tracking-wide">
              {state.mime.split("/")[1]?.split(";")[0] ?? "file"}
            </p>
          </div>
          <a
            href={state.url}
            download={state.filename}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 transition-colors no-underline shrink-0"
          >
            ⬇ Download
          </a>
        </div>
      )}
    </div>
  );
}

