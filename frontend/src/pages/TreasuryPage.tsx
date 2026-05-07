import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Contract, JsonRpcProvider, formatUnits, parseUnits, isAddress } from "ethers";
import { useWalletContext } from "../connection/WalletContext";
import useRunners from "../hooks/useRunners";
import TreasuryMultisigABI from "../constants/TreasuryMultisigABI.json";
import { shortAddr } from "../utils/format";

const TREASURY_ADDRESS = "0x55dd331Fc1c894D7EC74C931A586aA05fE694d6A";
const MOCK_USDT_ADDRESS = "0xf328F1b428748710687A0d275AF939eA100aA29c";
const SEPOLIA_RPC =
  (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";

interface ProposalView {
  id: bigint;
  by: string;
  to: string;
  data: string;
  executed: boolean;
  signatureCount: bigint;
  signers: string[];
}

interface TreasuryStats {
  signers: string[];
  requiredSigs: number;
  usdtBalance: string;
  tokenAddress: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────
function decodeProposalLabel(p: ProposalView): string {
  const d = p.data;
  if (!d || d === "0x") return "Arbitrary call";
  const sel = d.slice(0, 10).toLowerCase();
  const labels: Record<string, string> = {
    "0x43d726d6": "ERC-20 Withdrawal",   // proposeERC20Withdrawal selector
    "0x7065cb48": "Add Signer",
    "0x173825d9": "Remove Signer",
    "0xba51a6df": "Change Threshold",
  };
  return labels[sel] ?? "Custom Call";
}

function statusBadge(p: ProposalView, required: number) {
  if (p.executed)
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-900/40 text-teal-300 border border-teal-700/40">Executed</span>;
  if (Number(p.signatureCount) >= required)
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-900/40 text-yellow-300 border border-yellow-700/40">Ready</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-700/60 text-slate-300 border border-slate-600/40">Pending</span>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────
type ModalTab =
  | "withdrawal"
  | "addSigner"
  | "removeSigner"
  | "changeThreshold"
  | "arbitrary";

function ProposalModal({
  onClose,
  onSuccess,
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { signer } = useRunners();
  const [tab, setTab] = useState<ModalTab>("withdrawal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // form state per tab
  const [wRecipient, setWRecipient] = useState("");
  const [wAmount, setWAmount] = useState("");
  const [addAddr, setAddAddr] = useState("");
  const [removeAddr, setRemoveAddr] = useState("");
  const [threshold, setThreshold] = useState("");
  const [arbTo, setArbTo] = useState("");
  const [arbData, setArbData] = useState("");

  async function submit() {
    if (!signer) { setError("Wallet not connected"); return; }
    setError(null);
    setBusy(true);
    try {
      const treasury = new Contract(TREASURY_ADDRESS, TreasuryMultisigABI, signer);
      if (tab === "withdrawal") {
        if (!isAddress(wRecipient)) throw new Error("Invalid recipient address");
        const amt = parseUnits(wAmount, 6);
        await (await treasury.proposeERC20Withdrawal(wRecipient, amt)).wait();
      } else if (tab === "addSigner") {
        if (!isAddress(addAddr)) throw new Error("Invalid address");
        await (await treasury.proposeAddSigner(addAddr)).wait();
      } else if (tab === "removeSigner") {
        if (!isAddress(removeAddr)) throw new Error("Invalid address");
        await (await treasury.proposeRemoveSigner(removeAddr)).wait();
      } else if (tab === "changeThreshold") {
        const n = Number(threshold);
        if (!n || n < 1) throw new Error("Invalid threshold");
        await (await treasury.proposeChangeRequiredSignatures(n)).wait();
      } else if (tab === "arbitrary") {
        if (!isAddress(arbTo)) throw new Error("Invalid target address");
        await (await treasury.proposeArbitraryCall(arbTo, arbData || "0x")).wait();
      }
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message.slice(0, 120) : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  const TABS: { id: ModalTab; label: string; icon: string }[] = [
    { id: "withdrawal",      label: "Withdraw USDT",    icon: "💸" },
    { id: "addSigner",       label: "Add Signer",       icon: "➕" },
    { id: "removeSigner",    label: "Remove Signer",    icon: "🗑" },
    { id: "changeThreshold", label: "Change Threshold", icon: "🔢" },
    { id: "arbitrary",       label: "Custom Call",      icon: "⚙️" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-3xl bg-[#07182b] border border-teal-800/40 shadow-2xl overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-teal-800/30">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-teal-400">Treasury</p>
            <h2 className="text-lg font-black text-white mt-0.5">Make a Proposal</h2>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10 text-white hover:bg-white/20 cursor-pointer text-sm">✕</button>
        </div>

        {/* tab bar */}
        <div className="flex overflow-x-auto gap-1 px-6 pt-4 pb-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setError(null); }}
              className={`shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-colors cursor-pointer ${
                tab === t.id
                  ? "bg-teal-700 text-white"
                  : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          ))}
        </div>

        {/* divider */}
        <div className="h-px bg-teal-800/30 mx-6" />

        {/* form body */}
        <div className="px-6 py-5 space-y-4">
          {tab === "withdrawal" && (
            <>
              <label className="block">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">Recipient Address</span>
                <input value={wRecipient} onChange={e => setWRecipient(e.target.value)}
                  placeholder="0x…"
                  className="mt-1.5 w-full rounded-xl bg-white/5 border border-teal-800/40 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">Amount (USDT)</span>
                <input value={wAmount} onChange={e => setWAmount(e.target.value)}
                  placeholder="e.g. 500"
                  type="number" min="0"
                  className="mt-1.5 w-full rounded-xl bg-white/5 border border-teal-800/40 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              </label>
            </>
          )}

          {tab === "addSigner" && (
            <>
              <div className="h-px bg-teal-800/20" />
              <label className="block">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">New Signer Address</span>
                <input value={addAddr} onChange={e => setAddAddr(e.target.value)}
                  placeholder="0x…"
                  className="mt-1.5 w-full rounded-xl bg-white/5 border border-teal-800/40 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              </label>
            </>
          )}

          {tab === "removeSigner" && (
            <>
              <div className="h-px bg-teal-800/20" />
              <label className="block">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">Signer to Remove</span>
                <input value={removeAddr} onChange={e => setRemoveAddr(e.target.value)}
                  placeholder="0x…"
                  className="mt-1.5 w-full rounded-xl bg-white/5 border border-teal-800/40 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              </label>
            </>
          )}

          {tab === "changeThreshold" && (
            <>
              <div className="h-px bg-teal-800/20" />
              <label className="block">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">New Required Signatures</span>
                <input value={threshold} onChange={e => setThreshold(e.target.value)}
                  placeholder="e.g. 2"
                  type="number" min="1"
                  className="mt-1.5 w-full rounded-xl bg-white/5 border border-teal-800/40 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              </label>
            </>
          )}

          {tab === "arbitrary" && (
            <>
              <div className="h-px bg-teal-800/20" />
              <label className="block">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">Target Contract Address</span>
                <input value={arbTo} onChange={e => setArbTo(e.target.value)}
                  placeholder="0x…"
                  className="mt-1.5 w-full rounded-xl bg-white/5 border border-teal-800/40 px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              </label>
              <div className="h-px bg-teal-800/20" />
              <label className="block">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">Calldata (hex)</span>
                <input value={arbData} onChange={e => setArbData(e.target.value)}
                  placeholder="0x…"
                  className="mt-1.5 w-full rounded-xl bg-white/5 border border-teal-800/40 px-3 py-2.5 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-600" />
              </label>
            </>
          )}

          {error && (
            <p className="rounded-xl bg-red-900/30 border border-red-700/40 px-3 py-2 text-xs text-red-300">{error}</p>
          )}

          <div className="h-px bg-teal-800/30" />

          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-50 px-4 py-3 text-sm font-black text-white transition-colors cursor-pointer"
          >
            {busy ? "Submitting…" : "Submit Proposal →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export function TreasuryPage() {
  const { wallet } = useWalletContext();
  const { signer } = useRunners();
  const navigate = useNavigate();

  const [accessChecked, setAccessChecked] = useState(false);
  const [stats, setStats] = useState<TreasuryStats | null>(null);
  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null);

  function showToast(text: string, ok = true) {
    setToast({ text, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const provider = new JsonRpcProvider(SEPOLIA_RPC);
      const treasury = new Contract(TREASURY_ADDRESS, TreasuryMultisigABI, provider);

      const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];
      const tokenContract = new Contract(MOCK_USDT_ADDRESS, ERC20_ABI, provider);

      const [signers, requiredSigs, tokenAddress, rawBalance, allProposals] = await Promise.all([
        treasury.getSigners(),
        treasury.getRequiredSignatures(),
        treasury.getTokenAddress(),
        tokenContract.balanceOf(TREASURY_ADDRESS),
        treasury.getAllProposals(),
      ]);

      setStats({
        signers: signers as string[],
        requiredSigs: Number(requiredSigs),
        usdtBalance: formatUnits(rawBalance, 6),
        tokenAddress: tokenAddress as string,
      });

      setProposals([...(allProposals as ProposalView[])].reverse());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load treasury");
    } finally {
      setLoading(false);
    }
  }

  // Strict access check — runs once on mount and whenever wallet changes.
  // Calls isSignerPublic directly; if not a signer, bounces to home.
  useEffect(() => {
    let cancelled = false;
    async function checkAccess() {
      const addr = wallet.address;
      if (!addr) {
        // No wallet connected — bounce immediately
        navigate("/", { replace: true });
        return;
      }
      try {
        const provider = new JsonRpcProvider(SEPOLIA_RPC);
        const treasury = new Contract(TREASURY_ADDRESS, TreasuryMultisigABI, provider);
        const ok = await treasury.isSignerPublic(addr) as boolean;
        if (cancelled) return;
        if (!ok) {
          navigate("/", { replace: true });
        } else {
          setAccessChecked(true);
          void load();
        }
      } catch {
        if (!cancelled) navigate("/", { replace: true });
      }
    }
    void checkAccess();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.address]);

  async function handleSign(id: bigint) {
    if (!signer) return;
    const key = `sign-${id}`;
    setActionBusy(key);
    try {
      const treasury = new Contract(TREASURY_ADDRESS, TreasuryMultisigABI, signer);
      await (await treasury.signProposal(id)).wait();
      showToast("Proposal signed ✓");
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message.slice(0, 80) : "Failed", false);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleRevoke(id: bigint) {
    if (!signer) return;
    const key = `revoke-${id}`;
    setActionBusy(key);
    try {
      const treasury = new Contract(TREASURY_ADDRESS, TreasuryMultisigABI, signer);
      await (await treasury.revokeSignature(id)).wait();
      showToast("Signature revoked");
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message.slice(0, 80) : "Failed", false);
    } finally {
      setActionBusy(null);
    }
  }

  async function handleExecute(id: bigint) {
    if (!signer) return;
    const key = `exec-${id}`;
    setActionBusy(key);
    try {
      const treasury = new Contract(TREASURY_ADDRESS, TreasuryMultisigABI, signer);
      await (await treasury.executeProposal(id)).wait();
      showToast("Proposal executed ✓");
      await load();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message.slice(0, 80) : "Failed", false);
    } finally {
      setActionBusy(null);
    }
  }

  const activeProposals = proposals.filter((p) => !p.executed);
  const executedProposals = proposals.filter((p) => p.executed);

  // ── access gate splash ────────────────────────────────────────────────────
  if (!accessChecked) {
    return (
      <div className="min-h-screen bg-[#07182b] flex flex-col items-center justify-center gap-4">
        <div className="h-12 w-12 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
        <p className="text-sm font-bold text-teal-400 uppercase tracking-widest">Verifying access…</p>
      </div>
    );
  }

  // ── full standalone page ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#07182b] text-white flex flex-col">

      {/* ── TOPBAR ── */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-4 px-6 py-4 border-b border-teal-800/30 bg-[#07182b]/95 backdrop-blur-md">
        {/* left: brand */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashbar/explore")}
            className="flex items-center justify-center h-8 w-8 rounded-xl bg-white/8 hover:bg-white/15 text-slate-400 hover:text-white transition-colors cursor-pointer text-sm"
            title="Back to app"
          >
            ←
          </button>
          <div className="flex items-center gap-2">
            <span className="text-base font-black text-white tracking-tight">ScholarChain</span>
            <span className="px-2 py-0.5 rounded-lg bg-teal-700/30 border border-teal-600/30 text-[10px] font-black uppercase tracking-widest text-teal-400">Treasury</span>
          </div>
        </div>

        {/* right: wallet pill + propose button */}
        <div className="flex items-center gap-3">
          {wallet.address && (
            <div className="hidden sm:flex items-center gap-2 rounded-xl border border-teal-800/40 bg-white/5 px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-teal-400" />
              <span className="font-mono text-xs text-slate-300">{shortAddr(wallet.address)}</span>
            </div>
          )}
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-teal-600 hover:bg-teal-500 px-4 py-2 text-xs font-black text-white transition-colors cursor-pointer shadow-lg shadow-teal-900/30"
          >
            <span>＋</span> New Proposal
          </button>
        </div>
      </header>

      {/* ── HERO ── */}
      <div className="relative overflow-hidden border-b border-teal-800/20">
        {/* decorative blobs */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-teal-900/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 right-0 h-72 w-72 rounded-full bg-cyan-900/15 blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 pt-14 pb-12">
          {/* eyebrow */}
          <div className="flex items-center gap-2 mb-5">
            <span className="h-px w-8 bg-teal-600" />
            <span className="text-[10px] font-extrabold uppercase tracking-[0.25em] text-teal-500">Multisig Governance</span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
            <div>
              <h1 className="text-4xl sm:text-5xl font-black text-white leading-none">
                Treasury<br />
                <span className="text-teal-400">Control Panel</span>
              </h1>
              <p className="mt-4 text-slate-400 text-sm max-w-md leading-relaxed">
                Propose, sign, and execute treasury operations. All actions require multisig consensus before execution.
              </p>
              <p className="mt-3 font-mono text-xs text-slate-600">
                {TREASURY_ADDRESS}
              </p>
            </div>

            {/* stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-3 lg:min-w-[440px]">
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />
                ))
              ) : stats ? (
                [
                  { label: "USDT Balance",    value: `${parseFloat(stats.usdtBalance).toLocaleString()}`, sub: "USDT", accent: "text-teal-300" },
                  { label: "Signers",          value: stats.signers.length.toString(),                     sub: "wallets",  accent: "text-white" },
                  { label: "Threshold",        value: `${stats.requiredSigs}/${stats.signers.length}`,      sub: "required", accent: "text-white" },
                  { label: "Active",           value: activeProposals.length.toString(),                    sub: "proposals", accent: activeProposals.length > 0 ? "text-yellow-300" : "text-white" },
                ].map((s) => (
                  <div key={s.label} className="rounded-2xl border border-teal-800/30 bg-white/5 px-4 py-4 backdrop-blur-sm">
                    <p className={`text-2xl font-black leading-none ${s.accent}`}>{s.value}</p>
                    <p className="text-[10px] text-slate-500 mt-1">{s.sub}</p>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 mt-0.5">{s.label}</p>
                  </div>
                ))
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 max-w-6xl mx-auto w-full px-6 py-10">

        {/* toast */}
        {toast && (
          <div className={`fixed top-20 right-4 z-50 rounded-2xl px-4 py-3 text-sm font-semibold shadow-xl border ${
            toast.ok
              ? "bg-teal-900 border-teal-700 text-teal-200"
              : "bg-red-900 border-red-700 text-red-200"
          }`}>
            {toast.text}
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-700/40 bg-red-900/20 px-4 py-3 text-sm text-red-300">{error}</div>
        )}

        <div className="grid lg:grid-cols-[280px_1fr] gap-8">

          {/* ── LEFT SIDEBAR: signers panel ── */}
          <aside className="space-y-6">
            {/* signers */}
            <div className="rounded-2xl border border-teal-800/30 bg-white/3 p-5">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-teal-500 mb-4">Authorized Signers</p>
              {loading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => <div key={i} className="h-9 rounded-xl bg-white/5 animate-pulse" />)}
                </div>
              ) : (
                <div className="space-y-2">
                  {stats?.signers.map((s) => {
                    const isMe = s.toLowerCase() === wallet.address?.toLowerCase();
                    return (
                      <div key={s} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                        isMe
                          ? "border-teal-600/40 bg-teal-900/30"
                          : "border-white/5 bg-white/5"
                      }`}>
                        <span className={`h-2 w-2 shrink-0 rounded-full ${isMe ? "bg-teal-400" : "bg-slate-600"}`} />
                        <span className="font-mono text-xs text-slate-300 truncate">{shortAddr(s)}</span>
                        {isMe && <span className="ml-auto text-[9px] font-black uppercase tracking-widest text-teal-500">You</span>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* quick actions */}
            <div className="rounded-2xl border border-teal-800/30 bg-white/3 p-5">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-teal-500 mb-4">Quick Actions</p>
              <button
                onClick={() => setShowModal(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-teal-600 hover:bg-teal-500 px-4 py-3 text-sm font-black text-white transition-colors cursor-pointer"
              >
                📋 Make a Proposal
              </button>
              <button
                onClick={() => { void load(); }}
                disabled={loading}
                className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-teal-800/30 bg-white/5 hover:bg-white/10 disabled:opacity-40 px-4 py-2.5 text-xs font-bold text-slate-300 transition-colors cursor-pointer"
              >
                {loading ? "Refreshing…" : "↻ Refresh"}
              </button>
            </div>

            {/* executed history (collapsed in sidebar) */}
            {executedProposals.length > 0 && (
              <div className="rounded-2xl border border-white/5 bg-white/2 p-5">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.22em] text-slate-600 mb-3">
                  Executed ({executedProposals.length})
                </p>
                <div className="space-y-1.5">
                  {executedProposals.map((p) => (
                    <div key={p.id.toString()} className="flex items-center justify-between rounded-lg px-2.5 py-2 opacity-50">
                      <span className="text-[10px] font-mono text-slate-600">#{p.id.toString()}</span>
                      <span className="text-[10px] text-slate-600">{decodeProposalLabel(p)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </aside>

          {/* ── RIGHT: proposals feed ── */}
          <main className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-extrabold uppercase tracking-[0.22em] text-teal-500">
                Active Proposals
              </h2>
              <span className="text-xs text-slate-600">{activeProposals.length} pending</span>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[...Array(2)].map((_, i) => <div key={i} className="h-36 rounded-2xl bg-white/5 animate-pulse" />)}
              </div>
            ) : activeProposals.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-teal-800/30 bg-white/2 px-8 py-20 text-center">
                <p className="text-5xl mb-4">📭</p>
                <p className="text-lg font-black text-white">No active proposals</p>
                <p className="text-sm text-slate-500 mt-2 mb-6 max-w-xs">
                  All clear. Use the proposal panel to initiate a treasury action.
                </p>
                <button
                  onClick={() => setShowModal(true)}
                  className="flex items-center gap-2 rounded-xl bg-teal-700 hover:bg-teal-600 px-5 py-2.5 text-sm font-bold text-white transition-colors cursor-pointer"
                >
                  📋 Create First Proposal
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {activeProposals.map((p) => {
                  const sigCount = Number(p.signatureCount);
                  const required = stats?.requiredSigs ?? 1;
                  const hasSigned = p.signers.some(
                    (s) => s.toLowerCase() === wallet.address?.toLowerCase(),
                  );
                  const canExecute = sigCount >= required;
                  const pct = Math.min(100, (sigCount / required) * 100);

                  return (
                    <div key={p.id.toString()} className="rounded-2xl border border-teal-800/25 bg-white/4 p-6 hover:border-teal-700/40 transition-colors">
                      {/* top row */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="rounded-lg bg-white/8 px-2 py-0.5 text-[10px] font-black text-slate-400">#{p.id.toString()}</span>
                            <span className="text-base font-black text-white">{decodeProposalLabel(p)}</span>
                            {statusBadge(p, required)}
                          </div>
                          <p className="text-xs text-slate-500">
                            Proposed by{" "}
                            <span className="font-mono text-slate-400">{shortAddr(p.by)}</span>
                            {p.to !== TREASURY_ADDRESS && (
                              <> · target <span className="font-mono text-slate-400">{shortAddr(p.to)}</span></>
                            )}
                          </p>
                        </div>
                        <div className="shrink-0 rounded-2xl border border-teal-800/40 bg-teal-900/20 px-4 py-2 text-center">
                          <p className="text-lg font-black text-white leading-none">{sigCount}<span className="text-slate-500 font-bold text-sm">/{required}</span></p>
                          <p className="text-[10px] text-slate-500 mt-0.5">sigs</p>
                        </div>
                      </div>

                      {/* progress */}
                      <div className="mt-4 h-1.5 w-full rounded-full bg-white/8 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${canExecute ? "bg-yellow-400" : "bg-teal-500"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>

                      {/* who signed */}
                      {p.signers.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {p.signers.map((s) => (
                            <span key={s} className="rounded-lg bg-teal-900/30 border border-teal-700/20 px-2 py-0.5 text-[10px] font-mono text-teal-400">
                              {shortAddr(s)}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* actions */}
                      <div className="mt-5 flex flex-wrap gap-2 border-t border-white/5 pt-4">
                        {!hasSigned ? (
                          <button
                            onClick={() => handleSign(p.id)}
                            disabled={actionBusy === `sign-${p.id}`}
                            className="rounded-xl bg-teal-700 hover:bg-teal-600 disabled:opacity-50 px-5 py-2 text-xs font-bold text-white cursor-pointer transition-colors"
                          >
                            {actionBusy === `sign-${p.id}` ? "Signing…" : "✓ Sign"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleRevoke(p.id)}
                            disabled={actionBusy === `revoke-${p.id}`}
                            className="rounded-xl border border-teal-800/40 bg-white/5 hover:bg-white/10 disabled:opacity-50 px-5 py-2 text-xs font-bold text-slate-400 cursor-pointer transition-colors"
                          >
                            {actionBusy === `revoke-${p.id}` ? "Revoking…" : "Revoke"}
                          </button>
                        )}
                        {canExecute && (
                          <button
                            onClick={() => handleExecute(p.id)}
                            disabled={actionBusy === `exec-${p.id}`}
                            className="rounded-xl bg-yellow-400 text-[#07182b] hover:bg-yellow-300 disabled:opacity-50 px-5 py-2 text-xs font-black cursor-pointer transition-colors"
                          >
                            {actionBusy === `exec-${p.id}` ? "Executing…" : "⚡ Execute"}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* ── PAGE FOOTER ── */}
      <footer className="mt-auto border-t border-teal-800/20 px-6 py-5">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] text-slate-700">
          <span className="font-black uppercase tracking-widest text-slate-600">ScholarChain Treasury</span>
          <span className="font-mono">{TREASURY_ADDRESS}</span>
          <span>Sepolia Testnet · Chain ID 11155111</span>
        </div>
      </footer>

      {showModal && (
        <ProposalModal
          onClose={() => setShowModal(false)}
          onSuccess={() => { void load(); }}
        />
      )}
    </div>
  );
}
