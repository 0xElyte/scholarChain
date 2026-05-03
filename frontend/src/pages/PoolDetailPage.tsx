import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import type { UserRole } from "../types";
import { Modal } from "../components/Modal";
import {
  formatUSDT,
  formatDate,
  shortAddr,
  timeRemaining,
} from "../utils/format";
import { useWalletContext } from "../connection/WalletContext";
import { usePoolDetails } from "../hooks/read-hooks/usePoolDetails";

export function PoolDetailPage() {
  const { wallet } = useWalletContext();
  const { address } = useParams<{ address: string }>();
  const { poolData: pool, loading, error } = usePoolDetails(address);

  const [donateModal, setDonateModal] = useState(false);
  const [proposeModal, setProposeModal] = useState(false);
  const [donateAmount, setDonateAmount] = useState("");
  const [docCID, setDocCID] = useState("");
  const [payoutAddr, setPayoutAddr] = useState("");
  const [txPending, setTxPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-4xl mb-4">⏳</p>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Loading pool details…
        </h2>
        <p className="text-slate-500 text-sm">
          Fetching data from the blockchain.
        </p>
      </div>
    );
  }

  if (error || !pool) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <p className="text-5xl mb-4">❓</p>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">
          Pool not found
        </h2>
        <p className="text-slate-500 text-sm mb-6">
          {error
            ? `Error: ${error}`
            : "This address doesn't match any known pool."}
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
  const isWinner = pool.winners.some((w) => w.toLowerCase() === addr);

  const roles: UserRole[] = [];
  if (isCreator) roles.push("creator");
  if (isSigner) roles.push("signer");
  if (isWinner) roles.push("winner");

  const quorum = Math.ceil((pool.signers.length * 70) / 100);
  const canDonate = pool.state === "PENDING" || pool.state === "ACTIVE";
  const canSubmit = pool.state === "ACTIVE" && wallet.isConnected;
  const canDistribute =
    pool.state === "DISTRIBUTING" && !pool.distributionEntered;
  const canClaim = pool.state === "DISTRIBUTING" && isWinner;
  const canRefund =
    pool.isCancelled ||
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
          <div className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-700 border border-blue-200">
            {pool.state}
          </div>
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
          Contract{" "}
          <span className="font-mono">{shortAddr(pool.poolAddress)}</span>
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
                      f.fieldType === 0
                        ? "bg-slate-100 text-slate-600 border-slate-300"
                        : f.fieldType === 1
                          ? "bg-teal-50 text-teal-700 border-teal-200"
                          : "bg-teal-50 text-teal-700 border-teal-200"
                    }`}
                  >
                    {f.fieldType === 0
                      ? "Text"
                      : f.fieldType === 1
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
            <Card title="Proposals">
              <div className="p-4 rounded-lg bg-blue-50 border border-blue-200">
                <p className="text-sm text-blue-700">
                  💡 Proposals are indexed from blockchain events. To view
                  detailed proposals, connect to a subgraph or use The Graph
                  Network once deployed.
                </p>
              </div>
            </Card>
          )}

          {/* My proposal placeholder */}
          {isWinner && (
            <Card title="Your Proposal Status" highlight>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="bg-teal-50 rounded-lg p-3">
                  <p className="text-xs text-teal-600 mb-0.5">Status</p>
                  <p className="text-sm font-semibold text-teal-900">
                    🏆 Winner
                  </p>
                </div>
                <div className="bg-emerald-50 rounded-lg p-3">
                  <p className="text-xs text-emerald-600 mb-0.5">
                    Claimable Amount
                  </p>
                  <p className="text-sm font-semibold text-emerald-900 font-mono">
                    {formatUSDT(pool.distributionAmount)} USDT
                  </p>
                </div>
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
              {pool.poolAddress}
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
