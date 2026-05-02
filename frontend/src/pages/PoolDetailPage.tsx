import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { UserRole } from "../types";
import { FieldType } from "../types";
import { MOCK_POOLS, MOCK_PROPOSALS } from "../data/mockData";
import { StatusBadge } from "../components/StatusBadge";
import { Modal } from "../components/Modal";
import {
  formatUSDT,
  formatDate,
  shortAddr,
  timeRemaining,
} from "../utils/format";
import { useWalletContext } from "../connection/WalletContext";

export function PoolDetailPage() {
  const { wallet } = useWalletContext();
  const { address } = useParams<{ address: string }>();
  const pool = MOCK_POOLS.find((p) => p.address === address);

  const [donateModal, setDonateModal] = useState(false);
  const [proposeModal, setProposeModal] = useState(false);
  const [donateAmount, setDonateAmount] = useState("");
  const [docCID, setDocCID] = useState("");
  const [payoutAddr, setPayoutAddr] = useState("");
  const [txPending, setTxPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [voteTarget, setVoteTarget] = useState<string | null>(null);

  if (!pool) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-5xl mb-4">❓</p>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Pool not found
        </h2>
        <p className="text-slate-500 text-sm mb-6">
          This address doesn't match any known pool.
        </p>
        <Link
          to="/dashbar/explore"
          className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 no-underline"
        >
          Back to Explorer
        </Link>
      </div>
    );
  }

  const addr = wallet.address?.toLowerCase();
  const isCreator = addr === pool.creator.toLowerCase();
  const isSigner = pool.signers.some((s) => s.toLowerCase() === addr);
  const myProposal = MOCK_PROPOSALS.find(
    (p) => p.benefactor.toLowerCase() === addr,
  );
  const isWinner = pool.winners.some((w) => w.toLowerCase() === addr);

  const roles: UserRole[] = [];
  if (isCreator) roles.push("creator");
  if (isSigner) roles.push("signer");
  if (isWinner) roles.push("winner");
  if (myProposal && !isWinner) roles.push("applicant");

  const quorum = Math.ceil((pool.signers.length * 70) / 100);
  const canDonate = pool.state === "PENDING" || pool.state === "ACTIVE";
  const canSubmit =
    pool.state === "ACTIVE" && !myProposal && wallet.isConnected;
  const canVote =
    isSigner && (pool.state === "ACTIVE" || pool.state === "REVIEW");
  const canDistribute =
    pool.state === "DISTRIBUTING" && !pool.distributionEntered;
  const canClaim = pool.state === "DISTRIBUTING" && isWinner;
  const canRefund =
    pool.state === "CANCELLED" ||
    (pool.state === "DISTRIBUTING" && pool.winners.length === 0);
  const canCancel = isCreator && pool.state === "PENDING";

  const ROLE_COLORS: Record<UserRole, string> = {
    creator: "bg-teal-50 text-teal-700 border-teal-200",
    signer: "bg-amber-50 text-amber-700 border-amber-200",
    winner: "bg-emerald-50 text-emerald-700 border-emerald-200",
    applicant: "bg-teal-50 text-teal-700 border-teal-200",
    donor: "bg-slate-50 text-slate-600 border-slate-200",
    visitor: "bg-slate-50 text-slate-600 border-slate-200",
  };

  async function stub(msg: string) {
    setTxPending(true);
    await new Promise((r) => setTimeout(r, 1200));
    setTxPending(false);
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Breadcrumb */}
      <Link
        to="/dashbar/explore"
        className="text-sm text-slate-500 hover:text-teal-700 no-underline mb-6 inline-block"
      >
        ← Grant Pools
      </Link>

      {/* Toast */}
      {(txPending || toast) && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium ${
            txPending
              ? "bg-amber-100 text-amber-800 border border-amber-200"
              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
          }`}
        >
          {txPending ? "⏳ Sending transaction…" : `✓ ${toast}`}
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <StatusBadge state={pool.state} />
          {roles.map((r) => (
            <span
              key={r}
              className={`text-xs px-2.5 py-1 rounded-full font-medium border ${ROLE_COLORS[r]}`}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </span>
          ))}
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">
          {pool.poolName}
        </h1>
        <p className="text-sm text-slate-500">
          Created by{" "}
          <span className="font-mono">{shortAddr(pool.creator)}</span>
          {" · "}
          Contract <span className="font-mono">{shortAddr(pool.address)}</span>
        </p>
      </div>

      {/* Action bar */}
      <div className="flex flex-wrap gap-2 mb-8">
        {canDonate && (
          <button
            onClick={() => setDonateModal(true)}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 transition-colors cursor-pointer"
          >
            💰 Donate USDT
          </button>
        )}
        {canSubmit && (
          <button
            onClick={() => setProposeModal(true)}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 transition-colors cursor-pointer"
          >
            📝 Submit Proposal
          </button>
        )}
        {canDistribute && (
          <button
            onClick={() =>
              stub("Distribution phase entered — 10% fee sent to treasury")
            }
            disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer"
          >
            🚀 Enter Distribution
          </button>
        )}
        {canClaim && (
          <button
            onClick={() => stub("Grant claimed! Funds sent + SBT minted")}
            disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
          >
            🏆 Claim Grant
          </button>
        )}
        {canRefund && (
          <button
            onClick={() => stub("Refund claimed successfully")}
            disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors cursor-pointer"
          >
            ↩ Claim Refund
          </button>
        )}
        {canCancel && (
          <button
            onClick={() => stub("Pool cancelled. Donors may claim refunds.")}
            disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors cursor-pointer"
          >
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
                {
                  l: "Total Deposited",
                  v: `${formatUSDT(pool.totalDeposited)} USDT`,
                  c: "text-slate-800",
                },
                {
                  l: "Quorum Required",
                  v: `${quorum} of ${pool.signers.length} reviewers`,
                  c: "text-slate-800",
                },
                {
                  l: "Submissions Close",
                  v: formatDate(pool.submissionEnd * 1000),
                  c: "text-slate-800",
                },
                {
                  l: "Review Ends",
                  v: formatDate(pool.reviewEnd * 1000),
                  c: "text-slate-800",
                },
                ...(pool.distributionAmount !== "0"
                  ? [
                      {
                        l: "Per Winner",
                        v: `${formatUSDT(pool.distributionAmount)} USDT`,
                        c: "text-amber-600",
                      },
                    ]
                  : []),
                ...(pool.state === "ACTIVE" || pool.state === "PENDING"
                  ? [
                      {
                        l: "Time Remaining",
                        v: timeRemaining(pool.submissionEnd),
                        c: "text-teal-700",
                      },
                    ]
                  : []),
              ].map(({ l, v, c }) => (
                <div
                  key={l}
                  className="bg-white rounded-xl p-4 border border-cyan-950/10 shadow-sm"
                >
                  <p className="text-xs text-slate-500 mb-1">{l}</p>
                  <p className={`font-semibold text-sm ${c}`}>{v}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* Application schema */}
          <Card title="Application Form">
            <p className="text-sm text-slate-500 mb-4">
              Applicants must fill in the following fields:
            </p>
            <div className="space-y-2">
              {pool.fieldDefinitions.map((f, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 p-3 rounded-lg bg-white border border-cyan-950/10 shadow-sm"
                >
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                      f.fieldType === FieldType.TEXT
                        ? "bg-slate-100 text-slate-600 border-slate-300"
                        : f.fieldType === FieldType.URL
                          ? "bg-teal-50 text-teal-700 border-teal-200"
                          : "bg-teal-50 text-teal-700 border-teal-200"
                    }`}
                  >
                    {f.fieldType === FieldType.TEXT
                      ? "Text"
                      : f.fieldType === FieldType.URL
                        ? "URL"
                        : "Upload"}
                  </span>
                  <span className="text-sm text-slate-700 flex-1">
                    {f.label}
                  </span>
                  {f.required && (
                    <span className="text-xs text-red-500 font-medium">
                      Required
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Proposals + voting */}
          {(pool.state === "ACTIVE" ||
            pool.state === "REVIEW" ||
            pool.state === "DISTRIBUTING" ||
            pool.state === "CLOSED") && (
            <Card title={`Proposals (${MOCK_PROPOSALS.length})`}>
              {MOCK_PROPOSALS.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No proposals submitted yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {MOCK_PROPOSALS.map((prop) => (
                    <div
                      key={prop.benefactor}
                      className="scholar-card rounded-xl p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-800 font-mono">
                            {shortAddr(prop.benefactor)}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            Submitted {formatDate(prop.submittedAt * 1000)} ·
                            CID:{" "}
                            <span className="font-mono">
                              {prop.documentCID.slice(0, 18)}…
                            </span>
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
                          <span>
                            {prop.approvalCount} approval
                            {prop.approvalCount !== 1 ? "s" : ""}
                          </span>
                          <span>{quorum} needed</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-teal-600 rounded-full transition-all"
                            style={{
                              width: `${Math.min(100, (prop.approvalCount / quorum) * 100)}%`,
                            }}
                          />
                        </div>
                      </div>

                      {/* Vote buttons */}
                      {canVote && !prop.isWinner && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {voteTarget === prop.benefactor ? (
                            <>
                              <button
                                onClick={() => {
                                  stub(
                                    `Voted Approve for ${shortAddr(prop.benefactor)}`,
                                  );
                                  setVoteTarget(null);
                                }}
                                disabled={txPending}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                              >
                                ✓ Approve
                              </button>
                              <button
                                onClick={() => {
                                  stub(
                                    `Voted Reject for ${shortAddr(prop.benefactor)}`,
                                  );
                                  setVoteTarget(null);
                                }}
                                disabled={txPending}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-60 cursor-pointer"
                              >
                                ✗ Reject
                              </button>
                              <button
                                onClick={() => setVoteTarget(null)}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setVoteTarget(prop.benefactor)}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-teal-300 text-teal-700 hover:bg-teal-50 cursor-pointer"
                            >
                              Cast Vote
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* My proposal */}
          {myProposal && (
            <Card title="Your Proposal" highlight>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  {
                    l: "Document CID",
                    v: `${myProposal.documentCID.slice(0, 22)}…`,
                  },
                  {
                    l: "Payout Address",
                    v: shortAddr(myProposal.payoutAddress),
                  },
                  {
                    l: "Approvals",
                    v: `${myProposal.approvalCount} / ${quorum}`,
                  },
                  {
                    l: "Status",
                    v: myProposal.isWinner ? "🏆 Winner" : "⏳ Under Review",
                  },
                ].map(({ l, v }) => (
                  <div key={l} className="bg-teal-50 rounded-lg p-3">
                    <p className="text-xs text-teal-600 mb-0.5">{l}</p>
                    <p className="text-sm font-semibold text-teal-900 font-mono">
                      {v}
                    </p>
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
                    <span className="font-mono text-slate-700">
                      {shortAddr(w)}
                    </span>
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
                  <span className="font-mono text-slate-700">
                    {shortAddr(s)}
                  </span>
                  {s.toLowerCase() === addr && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      You
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Criteria Document">
            <p className="text-xs font-mono text-slate-600 break-all mb-2">
              {pool.criteriaMetadataCID}
            </p>
            <a
              href={`https://ipfs.io/ipfs/${pool.criteriaMetadataCID}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-teal-700 hover:underline no-underline"
            >
              View on IPFS ↗
            </a>
          </Card>

          <Card title="Contract">
            <p className="text-xs font-mono text-slate-600 break-all">
              {pool.address}
            </p>
          </Card>
        </div>
      </div>

      {/* Donate modal */}
      <Modal
        open={donateModal}
        onClose={() => setDonateModal(false)}
        title="Donate to Pool"
      >
        <p className="text-sm text-slate-600 mb-4">
          Donating to <strong>{pool.poolName}</strong>
        </p>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          Amount (USDT)
        </label>
        <input
          type="number"
          min={1}
          placeholder="Enter amount"
          value={donateAmount}
          onChange={(e) => setDonateAmount(e.target.value)}
          className="scholar-input w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 mb-1"
        />
        <p className="text-xs text-slate-400 mb-6">
          Wallet balance: {wallet.balance} USDT
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDonateModal(false)}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setDonateModal(false);
              stub(`Donated ${donateAmount} USDT`);
              setDonateAmount("");
            }}
            disabled={!donateAmount || parseFloat(donateAmount) <= 0}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
          >
            Confirm
          </button>
        </div>
      </Modal>

      {/* Propose modal */}
      <Modal
        open={proposeModal}
        onClose={() => setProposeModal(false)}
        title="Submit Proposal"
      >
        <p className="text-sm text-slate-600 mb-4">
          Submitting to <strong>{pool.poolName}</strong>
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Application Document CID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="IPFS CID of your application JSON"
              value={docCID}
              onChange={(e) => setDocCID(e.target.value)}
              className="scholar-input w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
            <p className="text-xs text-slate-400 mt-1">
              Upload your application to IPFS, paste the CID here.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payout Address <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="0x…"
              value={payoutAddr}
              onChange={(e) => setPayoutAddr(e.target.value)}
              className="scholar-input w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
            />
          </div>
          {/* Schema preview */}
          <div className="bg-white rounded-xl p-3 space-y-1.5 border border-cyan-950/10 shadow-sm">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Required fields in your JSON:
            </p>
            {pool.fieldDefinitions.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-slate-600"
              >
                <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  {i + 1}
                </span>
                {f.label}
                {f.required && <span className="text-red-500">*</span>}
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setProposeModal(false)}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setProposeModal(false);
              stub("Proposal submitted successfully");
              setDocCID("");
              setPayoutAddr("");
            }}
            disabled={!docCID || !payoutAddr}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
          >
            Submit
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Card({
  title,
  children,
  highlight,
}: {
  title: string;
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 ${highlight ? "border border-teal-200 bg-teal-50/50 shadow-lg shadow-teal-950/5" : "scholar-card"}`}
    >
      <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}
