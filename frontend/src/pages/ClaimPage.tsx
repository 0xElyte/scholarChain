import { useEffect, useMemo, useState } from "react";
import { Contract, Interface, getAddress } from "ethers";
import { HandCoins, RefreshCw, ArrowRight, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useWalletContext } from "../connection/WalletContext";
import { useAllPools, type PoolSummary } from "../hooks/read-hooks/useAllPools";
import { useFactoryContract } from "../hooks/useContracts";
import useRunners from "../hooks/useRunners";
import GrantPoolABI from "../constants/GrantPoolABI.json";
import { customReasonMapper } from "../utils/errorHandler";
import { formatUSDTWithCommas, shortAddr } from "../utils/format";
import { StatusBadge } from "../components/StatusBadge";

type ClaimKind = "grant" | "refund";

type ClaimItem = {
  id: string;
  kind: ClaimKind;
  poolAddress: string;
  poolName: string;
  state: PoolSummary["state"];
  claimableAmount: string;
  claimLabel: string;
  reason: string;
  payoutAddress?: string;
  donorAmount?: string;
  totalDeposited: string;
  distributionAmount: string;
  hasClaimed: boolean;
  isWinner: boolean;
  isRefundFromZeroWinnerPool: boolean;
};

type ProtocolStats = {
  totalPools: string;
  activePools: string;
  totalDeposited: string;
  totalWinners: string;
  totalGrantsClaimed: string;
  totalProposals: string;
  feeBps: string;
};

const grantPoolInterface = new Interface(GrantPoolABI as any);

function asBigInt(value: unknown): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(value);
    if (typeof value === "string") return BigInt(value);
    if (value && typeof value === "object" && "toString" in value) {
      return BigInt((value as { toString(): string }).toString());
    }
  } catch {
    // ignore
  }
  return 0n;
}

function formatClaimAmount(amount: string) {
  return `${formatUSDTWithCommas(amount)} USDT`;
}

export function ClaimPage() {
  const { wallet } = useWalletContext();
  const { pools, loading: poolsLoading } = useAllPools();
  const factoryContract = useFactoryContract();
  const { signer, readOnlyProvider } = useRunners();

  const [claims, setClaims] = useState<ClaimItem[]>([]);
  const [protocolStats, setProtocolStats] = useState<ProtocolStats | null>(
    null,
  );
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [pendingClaimId, setPendingClaimId] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadClaims() {
      if (!wallet.address || !factoryContract || !readOnlyProvider) {
        setClaims([]);
        setProtocolStats(null);
        return;
      }

      const walletAddress = wallet.address;

      setLoadingClaims(true);
      setClaimError(null);

      try {
        const [protocolStatsResult, feeResult] = await Promise.allSettled([
          factoryContract.getProtocolStats(),
          factoryContract.TREASURY_FEE_BPS(),
        ]);

        if (!cancelled) {
          setProtocolStats({
            totalPools: "0",
            activePools: "0",
            totalDeposited: "0",
            totalWinners: "0",
            totalGrantsClaimed: "0",
            totalProposals: "0",
            feeBps:
              feeResult.status === "fulfilled"
                ? feeResult.value.toString()
                : "1000",
          });
        }

        if (protocolStatsResult.status === "fulfilled" && !cancelled) {
          const [
            totalPools,
            activePools,
            totalDeposited,
            totalWinners,
            totalGrantsClaimed,
            totalProposals,
          ] = protocolStatsResult.value;
          setProtocolStats({
            totalPools: totalPools.toString(),
            activePools: activePools.toString(),
            totalDeposited: totalDeposited.toString(),
            totalWinners: totalWinners.toString(),
            totalGrantsClaimed: totalGrantsClaimed.toString(),
            totalProposals: totalProposals.toString(),
            feeBps:
              feeResult.status === "fulfilled"
                ? feeResult.value.toString()
                : "1000",
          });
        }

        const eligiblePools = pools.filter(
          (pool) =>
            pool.isCancelled ||
            (pool.state === "DISTRIBUTING" &&
              (pool.winnersCount > 0 || pool.distributionEntered)),
        );

        const claimItems = await Promise.all(
          eligiblePools.map(async (pool): Promise<ClaimItem | null> => {
            try {
              const poolContract = new Contract(
                getAddress(pool.address),
                GrantPoolABI,
                readOnlyProvider,
              );

              const [hasClaimedResult, donationResult, winnersResult] =
                await Promise.allSettled([
                  poolContract.hasClaimed(walletAddress),
                  poolContract.donations(walletAddress),
                  pool.state === "DISTRIBUTING" && pool.winnersCount > 0
                    ? poolContract.getWinners()
                    : Promise.resolve([]),
                ]);

              const hasClaimed =
                hasClaimedResult.status === "fulfilled"
                  ? Boolean(hasClaimedResult.value)
                  : false;
              const donationBalance =
                donationResult.status === "fulfilled"
                  ? asBigInt(donationResult.value)
                  : 0n;
              const winners =
                winnersResult.status === "fulfilled"
                  ? (winnersResult.value as string[])
                  : [];

              const lowerWallet = walletAddress.toLowerCase();
              const isWinner = winners.some(
                (winner) => winner.toLowerCase() === lowerWallet,
              );

              const isZeroWinnerRefundPool =
                pool.state === "DISTRIBUTING" &&
                pool.winnersCount === 0 &&
                pool.distributionEntered;

              const canClaimGrant =
                pool.state === "DISTRIBUTING" && isWinner && !hasClaimed;
              const canClaimRefund =
                donationBalance > 0n &&
                !hasClaimed &&
                (pool.isCancelled || isZeroWinnerRefundPool);

              if (!canClaimGrant && !canClaimRefund) return null;

              const grantAmount = asBigInt(pool.distributionAmount);
              const feeBps =
                protocolStatsResult.status === "fulfilled"
                  ? asBigInt(
                      feeResult.status === "fulfilled" ? feeResult.value : 1000,
                    )
                  : 1000n;

              let claimableAmount = 0n;
              let claimLabel = "";
              let reason = "";
              let payoutAddress: string | undefined;

              if (canClaimGrant) {
                claimableAmount = grantAmount;
                claimLabel = "Claim Grant";
                reason =
                  "You are a selected winner and the pool is in distribution.";

                try {
                  const proposal = await poolContract.getProposal(
                    wallet.address,
                  );
                  payoutAddress = proposal?.payoutAddress ?? undefined;
                } catch {
                  payoutAddress = undefined;
                }
              } else {
                const totalDeposited = asBigInt(pool.totalDeposited);
                const netPool =
                  totalDeposited > 0n
                    ? totalDeposited - (totalDeposited * feeBps) / 10_000n
                    : 0n;

                claimableAmount = pool.isCancelled
                  ? donationBalance
                  : totalDeposited > 0n
                    ? (donationBalance * netPool) / totalDeposited
                    : donationBalance;
                claimLabel = "Claim Refund";
                reason = pool.isCancelled
                  ? "The pool was cancelled, so your donation is refundable."
                  : "No winners were selected, so refunds are available after the protocol fee.";
              }

              return {
                id: `${canClaimGrant ? "grant" : "refund"}:${pool.address}`,
                kind: canClaimGrant ? "grant" : "refund",
                poolAddress: pool.address,
                poolName: pool.poolName,
                state: pool.state,
                claimableAmount: claimableAmount.toString(),
                claimLabel,
                reason,
                payoutAddress,
                donorAmount: donationBalance.toString(),
                totalDeposited: pool.totalDeposited,
                distributionAmount: pool.distributionAmount,
                hasClaimed,
                isWinner,
                isRefundFromZeroWinnerPool: isZeroWinnerRefundPool,
              };
            } catch (error) {
              console.error(
                `Failed to load claim data for ${pool.address}:`,
                error,
              );
              return null;
            }
          }),
        );

        if (!cancelled) {
          setClaims(
            claimItems.filter((item): item is ClaimItem => item !== null),
          );
        }
      } catch (error) {
        console.error("Failed to load claim page data:", error);
        if (!cancelled) {
          setClaimError(
            error instanceof Error
              ? error.message
              : "Failed to load claim data",
          );
          setClaims([]);
        }
      } finally {
        if (!cancelled) setLoadingClaims(false);
      }
    }

    void loadClaims();

    return () => {
      cancelled = true;
    };
  }, [wallet.address, factoryContract, readOnlyProvider, pools, refreshTick]);

  const grantClaims = useMemo(
    () => claims.filter((claim) => claim.kind === "grant"),
    [claims],
  );
  const refundClaims = useMemo(
    () => claims.filter((claim) => claim.kind === "refund"),
    [claims],
  );
  const totalClaimable = useMemo(
    () =>
      claims.reduce((sum, claim) => sum + asBigInt(claim.claimableAmount), 0n),
    [claims],
  );

  async function handleClaim(item: ClaimItem) {
    if (!signer) return;

    const claimKey = item.id;
    try {
      setPendingClaimId(claimKey);
      const poolContract = new Contract(
        getAddress(item.poolAddress),
        GrantPoolABI,
        signer,
      );
      const tx =
        item.kind === "grant"
          ? await poolContract.claimGrant()
          : await poolContract.claimRefund();
      await tx.wait();
      setToast({
        text:
          item.kind === "grant"
            ? "Grant claimed successfully"
            : "Refund claimed successfully",
        ok: true,
      });
      setRefreshTick((tick) => tick + 1);
    } catch (error) {
      const candidateData = [
        (error as { data?: unknown }).data,
        (error as { info?: { error?: { data?: unknown } } }).info?.error?.data,
        (error as { error?: { data?: unknown } }).error?.data,
      ].find((value): value is string => typeof value === "string");

      if (candidateData) {
        try {
          const decoded = grantPoolInterface.parseError(candidateData);
          setToast({ text: customReasonMapper(decoded as any), ok: false });
        } catch {
          const message =
            (error as any)?.error?.message ||
            (error as any)?.message ||
            String(error);
          setToast({ text: message, ok: false });
        }
      } else {
        const message =
          (error as any)?.error?.message ||
          (error as any)?.message ||
          String(error);
        setToast({ text: message, ok: false });
      }
    } finally {
      setPendingClaimId(null);
      window.setTimeout(() => setToast(null), 3500);
    }
  }

  const claimStats = [
    { label: "Grant claims ready", value: grantClaims.length.toString() },
    { label: "Refunds ready", value: refundClaims.length.toString() },
    {
      label: "Claimable USDT",
      value: formatClaimAmount(totalClaimable.toString()),
    },
    {
      label: "Factory fee",
      value: protocolStats ? `${Number(protocolStats.feeBps) / 100}%` : "10%",
    },
  ];

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-[linear-gradient(180deg,#eef6f4_0%,#f7fbfb_38%,#ffffff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 rounded-xl border px-5 py-3 text-sm font-medium shadow-lg ${
            toast.ok
              ? "border-emerald-200 bg-emerald-100 text-emerald-800"
              : "border-red-200 bg-red-100 text-red-800"
          }`}
        >
          {toast.ok ? "✓" : "!"} {toast.text}
        </div>
      )}

      <div className="mx-auto max-w-7xl space-y-6">
        <div className="overflow-hidden rounded-[2rem] border border-cyan-950/10 bg-[#07182b] text-white shadow-2xl shadow-cyan-950/10">
          <div className="grid gap-0 lg:grid-cols-[1.3fr_0.9fr]">
            <div className="p-8 sm:p-10 lg:p-12">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100">
                <HandCoins size={14} /> Claim Center
              </div>
              <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Claim grants and refunds from the pools you are eligible for.
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base">
                The page mirrors the GrantPool claim rules: winners claim their
                distribution in{" "}
                <span className="font-semibold text-white">DISTRIBUTING</span>,
                while donors can recover funds from cancelled pools or
                zero-winner pools after the protocol fee is applied.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/dashbar/explore"
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-[#07182b] no-underline transition-transform hover:scale-[1.02]"
                >
                  Browse pools <ArrowRight size={16} />
                </Link>
                <button
                  type="button"
                  onClick={() => setRefreshTick((tick) => tick + 1)}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15"
                >
                  <RefreshCw size={16} /> Refresh
                </button>
              </div>
            </div>

            <div className="border-t border-white/10 bg-white/5 p-8 sm:p-10 lg:border-l lg:border-t-0">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/80">
                Factory summary
              </p>
              <div className="mt-5 grid grid-cols-2 gap-3">
                {claimStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-white/10 bg-black/20 p-4"
                  >
                    <p className="text-[11px] uppercase tracking-wide text-slate-300">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-lg font-bold text-white">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="mt-5 rounded-2xl border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-50">
                <p className="font-semibold text-amber-100">Claim rules</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-50/90">
                  <li>
                    • `claimGrant()` is only available to winners once the pool
                    is distributing.
                  </li>
                  <li>
                    • `claimRefund()` is available to donors for cancelled pools
                    or zero-winner pools.
                  </li>
                  <li>• The factory fee remains fixed at 10%.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {claimError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mr-2 inline-block align-[-3px]" />
            {claimError}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-6">
            <section className="rounded-[1.75rem] border border-cyan-950/10 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                    Grant claims
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-[#07182b]">
                    Selected winners ready to claim
                  </h2>
                </div>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {grantClaims.length} available
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {loadingClaims || poolsLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map((item) => (
                      <div
                        key={item}
                        className="h-40 animate-pulse rounded-2xl bg-slate-100"
                      />
                    ))}
                  </div>
                ) : grantClaims.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-4xl">🏆</p>
                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      No grant claims available
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Once a pool enters distribution and marks you as a winner,
                      the claim button will appear here.
                    </p>
                  </div>
                ) : (
                  grantClaims.map((claim) => (
                    <ClaimCard
                      key={claim.id}
                      claim={claim}
                      onClaim={() => void handleClaim(claim)}
                      pending={pendingClaimId === claim.id}
                    />
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[1.75rem] border border-cyan-950/10 bg-white p-6 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">
                    Refund claims
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-[#07182b]">
                    Donations you can recover
                  </h2>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                  {refundClaims.length} available
                </span>
              </div>

              <div className="mt-5 space-y-4">
                {loadingClaims || poolsLoading ? (
                  <div className="space-y-4">
                    {[1, 2].map((item) => (
                      <div
                        key={item}
                        className="h-40 animate-pulse rounded-2xl bg-slate-100"
                      />
                    ))}
                  </div>
                ) : refundClaims.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
                    <p className="text-4xl">↩</p>
                    <p className="mt-3 text-sm font-semibold text-slate-700">
                      No refunds available
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Cancelled pools and zero-winner distributions will appear
                      here when your donation becomes refundable.
                    </p>
                  </div>
                ) : (
                  refundClaims.map((claim) => (
                    <ClaimCard
                      key={claim.id}
                      claim={claim}
                      onClaim={() => void handleClaim(claim)}
                      pending={pendingClaimId === claim.id}
                    />
                  ))
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-[1.75rem] border border-cyan-950/10 bg-[#07182b] p-6 text-white shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-100/80">
                Wallet status
              </p>
              <div className="mt-4 space-y-3 text-sm text-slate-200">
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Connected account
                  </p>
                  <p className="mt-1 font-mono text-white">
                    {wallet.address
                      ? shortAddr(wallet.address)
                      : "Not connected"}
                  </p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Claimable total
                  </p>
                  <p className="mt-1 font-bold text-amber-300">
                    {formatClaimAmount(totalClaimable.toString())}
                  </p>
                </div>
                <div className="rounded-xl bg-white/5 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">
                    Pools scanned
                  </p>
                  <p className="mt-1 font-bold text-white">{pools.length}</p>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function ClaimCard({
  claim,
  onClaim,
  pending,
}: {
  claim: ClaimItem;
  onClaim: () => void;
  pending: boolean;
}) {
  const isGrant = claim.kind === "grant";

  return (
    <div
      className={`rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md ${
        isGrant
          ? "border-emerald-200 bg-emerald-50/40"
          : "border-sky-200 bg-sky-50/40"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge state={claim.state} size="sm" />
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] ${isGrant ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700"}`}
            >
              {claim.kind}
            </span>
          </div>
          <h3 className="mt-3 text-lg font-bold text-slate-900">
            {claim.poolName}
          </h3>
          <p className="mt-1 text-xs font-mono text-slate-500">
            {shortAddr(claim.poolAddress)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            Claimable
          </p>
          <p
            className={`mt-1 text-2xl font-black ${isGrant ? "text-emerald-700" : "text-sky-700"}`}
          >
            {formatClaimAmount(claim.claimableAmount)}
          </p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-600">{claim.reason}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Pool amount
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatUSDTWithCommas(claim.totalDeposited)} USDT
          </p>
        </div>
        <div className="rounded-xl bg-white/80 p-3 ring-1 ring-slate-200">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">
            Distribution
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {claim.distributionAmount === "0"
              ? claim.isRefundFromZeroWinnerPool
                ? "Zero-winner refund"
                : "Not entered"
              : formatUSDTWithCommas(claim.distributionAmount) + " USDT"}
          </p>
        </div>
      </div>

      {claim.payoutAddress && (
        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          Payout address:{" "}
          <span className="font-mono">{shortAddr(claim.payoutAddress)}</span>
        </div>
      )}

      {claim.donorAmount && !isGrant && (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900">
          Your donation:{" "}
          <span className="font-mono">
            {formatUSDTWithCommas(claim.donorAmount)} USDT
          </span>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onClaim}
          disabled={pending}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-transform hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60 ${
            isGrant
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-sky-600 hover:bg-sky-700"
          }`}
        >
          {pending ? "Processing..." : claim.claimLabel}
        </button>
        <Link
          to={`/dashbar/pool/${claim.poolAddress}`}
          className="text-sm font-semibold text-slate-600 no-underline hover:text-slate-900"
        >
          View pool
        </Link>
      </div>
    </div>
  );
}
