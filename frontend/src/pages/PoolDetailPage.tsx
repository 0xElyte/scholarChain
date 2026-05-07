import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Contract, getAddress, isAddress, parseUnits } from "ethers";
import type { UserRole } from "../types";
import { Modal } from "../components/Modal";
import {
  formatUSDT,
  formatUSDTWithCommas,
  formatDate,
  shortAddr,
  timeRemaining,
} from "../utils/format";
import { useWalletContext } from "../connection/WalletContext";
import useDonatePool from "../hooks/write-hooks/useDonatePool";
import useUSDTBalance from "../hooks/read-hooks/useUSDTBalance";
import { usePoolDetails } from "../hooks/read-hooks/usePoolDetails";
import useRunners from "../hooks/useRunners";
import { ipfsGatewayUrl } from "../utils/ipfs";
import { cidToBytes32 } from "../utils/ipfs";
import { uploadFileToPinata } from "../utils/pinata";
import GrantPoolABI from "../constants/GrantPoolABI.json";

type FieldInputValue = {
  text: string;
  cid: string;
  fileName: string;
};

export function PoolDetailPage() {
  const { wallet } = useWalletContext();
  const { address } = useParams<{ address: string }>();
  const { poolData: pool, loading, error } = usePoolDetails(address);

  const [donateModal, setDonateModal] = useState(false);
  const [proposeModal, setProposeModal] = useState(false);
  const [criteriaModal, setCriteriaModal] = useState(false);
  const [distributionModal, setDistributionModal] = useState(false);
  const [donateAmount, setDonateAmount] = useState("");
  const [benefactorDocumentCid, setBenefactorDocumentCid] = useState("");
  const [benefactorDocumentName, setBenefactorDocumentName] = useState("");
  const [uploadingMainDoc, setUploadingMainDoc] = useState(false);
  const [fieldValues, setFieldValues] = useState<FieldInputValue[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [payoutAddr, setPayoutAddr] = useState("");
  const [txPending, setTxPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [winnerPayout, setWinnerPayout] = useState<string | null>(null);

  const { signer, readOnlyProvider } = useRunners();
  const { donate, loading: donating } = useDonatePool();
  const {
    balance: usdtBalance,
    rawBalance: usdtRawBalance,
    loading: usdtBalanceLoading,
  } = useUSDTBalance(pool?.usdtTokenAddress, wallet.address || undefined);

  // Hoisted before early returns so hooks are called unconditionally
  const addr = wallet.address?.toLowerCase();
  const isWinner = pool?.winners.some((w) => w.toLowerCase() === addr) ?? false;

  useEffect(() => {
    if (!isWinner || !pool || !readOnlyProvider || !wallet.address) return;
    const pc = new Contract(getAddress(pool.poolAddress), GrantPoolABI, readOnlyProvider);
    pc.hasClaimed(wallet.address)
      .then((claimed: boolean) => setHasClaimed(claimed))
      .catch(() => {});
    pc.getProposal(wallet.address)
      .then((p: any) => setWinnerPayout(p?.payoutAddress ?? null))
      .catch(() => {});
  }, [isWinner, pool?.poolAddress, readOnlyProvider, wallet.address]);

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

  const isCreator = addr === pool.creator.toLowerCase();
  const isSigner = pool.signers.some((s) => s.toLowerCase() === addr);

  const roles: UserRole[] = [];
  if (isCreator) roles.push("creator");
  if (isSigner) roles.push("signer");
  if (isWinner) roles.push("winner");

  const quorum = Math.ceil((pool.signers.length * 70) / 100);
  const canDonate = pool.state === "PENDING" || pool.state === "ACTIVE";
  const canSubmit =
    pool.state === "ACTIVE" && wallet.isConnected && !isCreator && !isSigner;
  const requestedDonateAmount = (() => {
    if (!donateAmount) return 0n;
    try {
      return parseUnits(donateAmount, 6);
    } catch {
      return 0n;
    }
  })();
  const canRefund =
    pool.isCancelled ||
    (pool.state === "DISTRIBUTING" && pool.winners.length === 0 && pool.distributionEntered);
  const canCancel = isCreator && pool.state === "PENDING";
  const criteriaGatewayUrl = ipfsGatewayUrl(pool.criteriaMetadataCID);

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

  function ensureFieldState() {
    if (fieldValues.length === pool!.fieldDefinitions.length) return;
    setFieldValues(
      pool!.fieldDefinitions.map(() => ({ text: "", cid: "", fileName: "" })),
    );
  }

  function updateFieldText(index: number, value: string) {
    ensureFieldState();
    setFieldValues((prev) => {
      const next = [...prev];
      next[index] = {
        ...(next[index] || { text: "", cid: "", fileName: "" }),
        text: value,
      };
      return next;
    });
  }

  async function uploadMainDocument(file: File | null) {
    if (!file) return;
    setSubmitError(null);
    setUploadingMainDoc(true);
    try {
      const cid = await uploadFileToPinata(
        file,
        `${pool!.poolName}-benefactor-document-${Date.now()}`,
      );
      setBenefactorDocumentCid(cid);
      setBenefactorDocumentName(file.name);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to upload file",
      );
    } finally {
      setUploadingMainDoc(false);
    }
  }

  function validateProposalForm() {
    if (!wallet.isConnected || !signer) {
      return "Connect your wallet to submit a proposal.";
    }
    if (!benefactorDocumentCid) {
      return "Upload your proposal document before submitting.";
    }
    if (!isAddress(payoutAddr.trim())) {
      return "Enter a valid payout address.";
    }
    for (let i = 0; i < pool!.fieldDefinitions.length; i++) {
      const definition = pool!.fieldDefinitions[i];
      if (!definition.required) continue;
      const fieldValue = fieldValues[i] || { text: "", cid: "" };
      if (!fieldValue.text.trim()) {
        return `Fill the required field "${definition.label}".`;
      }
    }
    return null;
  }

  async function handleSubmitProposal() {
    setSubmitError(null);
    const validationError = validateProposalForm();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }
    try {
      setTxPending(true);
      const payload = {
        benefactorAddress: wallet.address,
        benefactorDocumentCID: benefactorDocumentCid,
        fields: pool!.fieldDefinitions.map((definition, index) => {
          const fieldValue = fieldValues[index] || {
            text: "",
            cid: "",
            fileName: "",
          };
          return {
            label: definition.label,
            fieldType: definition.fieldType,
            required: definition.required,
            value: fieldValue.text,
          };
        }),
      };
      const payloadJson = JSON.stringify(
        payload,
        (_, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      );
      const payloadFile = new File(
        [payloadJson],
        `proposal-${Date.now()}.json`,
        { type: "application/json" },
      );
      const payloadCid = await uploadFileToPinata(payloadFile, payloadFile.name);
      const proposalContract = new Contract(
        getAddress(pool!.poolAddress),
        GrantPoolABI,
        signer,
      );
      const tx = await proposalContract.submitProposal(
        cidToBytes32(payloadCid),
        getAddress(payoutAddr.trim()),
      );
      await tx.wait();
      setProposeModal(false);
      setBenefactorDocumentCid("");
      setBenefactorDocumentName("");
      setFieldValues(
        pool!.fieldDefinitions.map(() => ({ text: "", cid: "", fileName: "" })),
      );
      setPayoutAddr("");
      setToast("Proposal submitted successfully");
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to submit proposal",
      );
    } finally {
      setTxPending(false);
    }
  }

  async function handleEnterDistribution() {
    if (!signer) return;
    try {
      setTxPending(true);
      const pc = new Contract(getAddress(pool!.poolAddress), GrantPoolABI, signer);
      const tx = await pc.enterDistributionPhase();
      await tx.wait();
      setDistributionModal(false);
      setToast("Distribution phase entered — fee sent to treasury");
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Transaction failed");
      setTimeout(() => setToast(null), 3500);
    } finally {
      setTxPending(false);
    }
  }

  async function handleClaimGrant() {
    if (!signer) return;
    try {
      setTxPending(true);
      const pc = new Contract(getAddress(pool!.poolAddress), GrantPoolABI, signer);
      const tx = await pc.claimGrant();
      await tx.wait();
      setHasClaimed(true);
      setToast("Grant claimed — funds sent and SBT minted");
      setTimeout(() => setToast(null), 3500);
    } catch (err) {
      setToast(err instanceof Error ? err.message : "Transaction failed");
      setTimeout(() => setToast(null), 3500);
    } finally {
      setTxPending(false);
    }
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
            onClick={() => {
              ensureFieldState();
              setSubmitError(null);
              setProposeModal(true);
            }}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 transition-colors cursor-pointer"
          >
            📝 Submit Proposal
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
                  v: `${formatUSDTWithCommas(pool.totalDeposited)} USDT`,
                  c: "text-slate-800",
                },
                {
                  l: "Quorum Required",
                  v: `${quorum} of ${pool.signers.length} reviewers`,
                  c: "text-slate-800",
                },
                {
                  l: "Submitted Proposals",
                  v: `${pool.proposalCount}`,
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
                        : "bg-teal-50 text-teal-700 border-teal-200"
                    }`}
                  >
                    {f.fieldType === 1 ? "URL" : "Text"}
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

          {/* Distribution section */}
          {pool.state === "DISTRIBUTING" && (
            <Card title="Distribution">
              {!pool.distributionEntered ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                    <p className="text-sm font-semibold text-amber-700">
                      Distribution not yet initialized
                    </p>
                  </div>
                  <p className="text-sm text-slate-600 mb-4">
                    Entering distribution will deduct the protocol fee and
                    allocate remaining funds to winners.
                  </p>
                  {pool.winners.length === 0 ? (
                    <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 mb-5">
                      <p className="text-sm font-medium text-orange-700">
                        ⚠ No winners selected
                      </p>
                      <p className="text-xs text-orange-600 mt-1">
                        Entering distribution with no winners allows donors to
                        claim refunds.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 mb-5">
                      <p className="text-xs text-teal-700 font-medium">
                        {pool.winners.length} winner
                        {pool.winners.length !== 1 ? "s" : ""} will receive
                        funds after fee deduction.
                      </p>
                    </div>
                  )}
                  <button
                    onClick={() => setDistributionModal(true)}
                    disabled={txPending}
                    className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-60 transition-colors cursor-pointer"
                  >
                    Enter Distribution Phase
                  </button>
                </div>
              ) : pool.winners.length > 0 ? (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-2 h-2 rounded-full bg-teal-400 shrink-0" />
                    <p className="text-sm font-semibold text-teal-700">
                      Distribution active
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="bg-white rounded-xl p-4 border border-cyan-950/10 shadow-sm">
                      <p className="text-xs text-slate-500 mb-1">
                        Amount per winner
                      </p>
                      <p className="text-lg font-bold text-slate-800">
                        {formatUSDTWithCommas(pool.distributionAmount)} USDT
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 border border-cyan-950/10 shadow-sm">
                      <p className="text-xs text-slate-500 mb-1">
                        Total winners
                      </p>
                      <p className="text-lg font-bold text-slate-800">
                        {pool.winners.length}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                    <p className="text-sm font-semibold text-slate-700">
                      No winners selected
                    </p>
                  </div>
                  <p className="text-sm text-slate-500">
                    Funds have been returned to donors.
                  </p>
                </div>
              )}
            </Card>
          )}

          {/* Claim grant section */}
          {pool.state === "DISTRIBUTING" && (
            <Card title="Claim Grant" highlight={isWinner && !hasClaimed}>
              {isWinner ? (
                hasClaimed ? (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-lg">✅</span>
                      <p className="text-sm font-semibold text-emerald-700">
                        Grant already claimed
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 mb-3">
                      <div className="bg-emerald-50 rounded-lg p-3">
                        <p className="text-xs text-emerald-600 mb-0.5">
                          Amount received
                        </p>
                        <p className="text-sm font-semibold text-emerald-900 font-mono">
                          {formatUSDTWithCommas(pool.distributionAmount)} USDT
                        </p>
                      </div>
                      {winnerPayout && (
                        <div className="bg-emerald-50 rounded-lg p-3">
                          <p className="text-xs text-emerald-600 mb-0.5">
                            Payout address
                          </p>
                          <p className="text-sm font-mono text-emerald-900">
                            {shortAddr(winnerPayout)}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      An SBT has been minted to your wallet as proof of this
                      grant.
                    </p>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <span className="text-lg">🎉</span>
                      <p className="text-sm font-semibold text-teal-800">
                        You are a selected winner
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 mb-5">
                      <div className="bg-teal-50 rounded-lg p-3">
                        <p className="text-xs text-teal-600 mb-0.5">
                          Grant amount
                        </p>
                        <p className="text-sm font-semibold text-teal-900 font-mono">
                          {formatUSDTWithCommas(pool.distributionAmount)} USDT
                        </p>
                      </div>
                      {winnerPayout && (
                        <div className="bg-teal-50 rounded-lg p-3">
                          <p className="text-xs text-teal-600 mb-0.5">
                            Payout address
                          </p>
                          <p className="text-sm font-mono text-teal-900">
                            {shortAddr(winnerPayout)}
                          </p>
                        </div>
                      )}
                    </div>
                    {!pool.distributionEntered ? (
                      <p className="text-xs text-slate-500">
                        Waiting for distribution phase to be initialized before
                        you can claim.
                      </p>
                    ) : (
                      <button
                        onClick={() => void handleClaimGrant()}
                        disabled={txPending}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors cursor-pointer"
                      >
                        {txPending ? "Claiming…" : "Claim Grant"}
                      </button>
                    )}
                  </div>
                )
              ) : (
                <p className="text-sm text-slate-500">
                  You were not selected for this pool.
                </p>
              )}
            </Card>
          )}

          {/* Winner status (non-distributing states) */}
          {isWinner && pool.state !== "DISTRIBUTING" && (
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
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setCriteriaModal(true)}
                className="text-xs text-teal-700 hover:underline no-underline cursor-pointer"
              >
                View PDF
              </button>
              {criteriaGatewayUrl && (
                <a
                  href={criteriaGatewayUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-500 hover:text-teal-700 hover:underline no-underline"
                >
                  Open gateway link ↗
                </a>
              )}
            </div>
          </Card>

          <Card title="Contract">
            <p className="text-xs font-mono text-slate-600 break-all">
              {pool.poolAddress}
            </p>
          </Card>
        </div>
      </div>

      {/* ── Modals ── */}

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
        <div className="mb-6 rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs text-teal-800">
          <div className="font-medium">Connected wallet Mock USDT balance</div>
          <div className="font-mono">
            {usdtBalanceLoading ? "Loading…" : `${usdtBalance} USDT`}
          </div>
        </div>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setDonateModal(false)}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (!donateAmount || parseFloat(donateAmount) <= 0) return;
              if (requestedDonateAmount > usdtRawBalance) {
                setToast("Insufficient Mock USDT balance");
                setTimeout(() => setToast(null), 3500);
                return;
              }
              try {
                setTxPending(true);
                const res = await donate(
                  pool.poolAddress,
                  donateAmount,
                  pool.usdtTokenAddress,
                  { tokenDecimals: 6 },
                );
                if (res.tx) {
                  setToast(`Donated ${donateAmount} USDT`);
                  setTimeout(() => setToast(null), 3500);
                } else if (res.error) {
                  setToast(res.error.message || "Donation failed");
                  setTimeout(() => setToast(null), 3500);
                }
              } catch (e) {
                setToast(e instanceof Error ? e.message : "Donation failed");
                setTimeout(() => setToast(null), 3500);
              } finally {
                setTxPending(false);
                setDonateModal(false);
                setDonateAmount("");
              }
            }}
            disabled={
              donating ||
              !donateAmount ||
              parseFloat(donateAmount) <= 0 ||
              requestedDonateAmount > usdtRawBalance
            }
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
          >
            Confirm
          </button>
        </div>
      </Modal>

      <Modal
        open={proposeModal}
        onClose={() => setProposeModal(false)}
        title="Submit Proposal"
      >
        <p className="text-sm text-slate-600 mb-4">
          Submitting to <strong>{pool.poolName}</strong>
        </p>
        {submitError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {submitError}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Proposal Document <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              onChange={(e) =>
                void uploadMainDocument(e.target.files?.[0] ?? null)
              }
              className="scholar-input w-full px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            {uploadingMainDoc && (
              <p className="text-xs text-slate-500 mt-1">Uploading document…</p>
            )}
            {!!benefactorDocumentCid && (
              <p className="text-xs text-emerald-600 mt-1 break-all">
                Uploaded: {benefactorDocumentName} ({benefactorDocumentCid})
              </p>
            )}
            <p className="text-xs text-slate-400 mt-1">
              Upload your proposal document. CID is generated automatically.
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
          <div className="bg-white rounded-xl p-3 space-y-1.5 border border-cyan-950/10 shadow-sm">
            <p className="text-xs font-medium text-slate-600 mb-2">
              Fill the required fields:
            </p>
            {pool.fieldDefinitions.map((f, i) => (
              <div
                key={i}
                className="space-y-1.5 border-b border-slate-100 pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <span className="w-4 h-4 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                    {i + 1}
                  </span>
                  {f.label}
                  {f.required && <span className="text-red-500">*</span>}
                </div>
                <input
                  type={f.fieldType === 1 ? "url" : "text"}
                  value={fieldValues[i]?.text || ""}
                  onChange={(e) => updateFieldText(i, e.target.value)}
                  placeholder={
                    f.fieldType === 1
                      ? "https://example.com"
                      : "Enter field value"
                  }
                  className="scholar-input w-full px-3 py-2 text-xs rounded-lg border focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
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
            onClick={() => void handleSubmitProposal()}
            disabled={txPending || uploadingMainDoc}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
          >
            {txPending ? "Submitting…" : "Submit"}
          </button>
        </div>
      </Modal>

      <Modal
        open={distributionModal}
        onClose={() => !txPending && setDistributionModal(false)}
        title="Enter Distribution Phase"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm font-semibold text-amber-800 mb-2">
              Before you confirm:
            </p>
            <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
              <li>A protocol fee will be deducted from the pool balance</li>
              <li>Remaining funds will be allocated equally to winners</li>
              {pool.winners.length === 0 && (
                <li className="text-orange-700 font-medium">
                  No winners selected — donors will receive refunds
                </li>
              )}
            </ul>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Pool</span>
              <span className="font-semibold text-slate-800">{pool.poolName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Total deposited</span>
              <span className="font-semibold font-mono text-slate-800">
                {formatUSDTWithCommas(pool.totalDeposited)} USDT
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Winners</span>
              <span className="font-semibold text-slate-800">{pool.winners.length}</span>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setDistributionModal(false)}
            disabled={txPending}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-60 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleEnterDistribution()}
            disabled={txPending}
            className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#07182b] text-white hover:bg-teal-700 disabled:opacity-50 cursor-pointer"
          >
            {txPending ? "Sending…" : "Confirm Distribution"}
          </button>
        </div>
      </Modal>

      <Modal
        open={criteriaModal}
        onClose={() => setCriteriaModal(false)}
        title="Criteria PDF"
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            The criteria document is stored on IPFS and rendered below.
          </p>
          {criteriaGatewayUrl ? (
            <iframe
              src={criteriaGatewayUrl}
              title="Criteria PDF preview"
              className="w-full h-[70vh] rounded-xl border border-slate-200 bg-white"
            />
          ) : (
            <p className="text-sm text-slate-500">
              No criteria PDF link is available.
            </p>
          )}
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
