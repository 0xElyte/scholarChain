import { Link } from "react-router-dom";
import type { GrantPool } from "../types";
import { StatusBadge } from "./StatusBadge";
import {
  formatUSDTWithCommas,
  formatDate,
  shortAddr,
  timeRemaining,
} from "../utils/format";

interface Props {
  pool: GrantPool;
  connectedAddress?: string | null;
}

export function PoolCard({ pool, connectedAddress }: Props) {
  const isCreator =
    connectedAddress?.toLowerCase() === pool.creator.toLowerCase();
  const isSigner = pool.signers.some(
    (s) => s.toLowerCase() === connectedAddress?.toLowerCase(),
  );
  const isActive = pool.state === "ACTIVE" || pool.state === "PENDING";

  return (
    <Link
      to={`/dashbar/pool/${pool.address}`}
      className="block scholar-card rounded-2xl p-5 hover:border-teal-300 hover:shadow-xl hover:shadow-teal-950/10 transition-all duration-300 group card-lift"
    >
      <div className="flex items-start justify-between gap-2 mb-4">
        <StatusBadge state={pool.state} size="sm" />
        {isActive && (
          <span className="text-[10px] text-amber-600 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 shrink-0">
            {timeRemaining(pool.submissionEnd)}
          </span>
        )}
      </div>

      <h3 className="text-sm font-bold text-slate-800 group-hover:text-teal-700 transition-colors mb-1 line-clamp-2 leading-snug">
        {pool.poolName}
      </h3>
      <p className="text-[11px] text-slate-400 mb-4 font-mono">
        By {shortAddr(pool.creator)}
      </p>

      <div className="flex items-end justify-between mb-4">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">
            Pool Size
          </p>
          <p className="text-xl font-bold text-slate-800">
            {formatUSDTWithCommas(pool.totalDeposited)}
            <span className="text-sm font-normal text-slate-400 ml-1">
              USDT
            </span>
          </p>
        </div>
        {pool.winnersCount > 0 && (
          <div className="text-right">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-0.5">
              Winners
            </p>
            <p className="text-xl font-bold text-emerald-600">
              {pool.winnersCount}
            </p>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 pt-3 flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">
          {pool.signerCount} reviewers · {formatDate(pool.submissionEnd * 1000)}
        </span>
        <div className="flex gap-1.5">
          {isCreator && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-teal-50 text-teal-700 border border-teal-100 font-semibold">
              Creator
            </span>
          )}
          {isSigner && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-50 text-amber-600 border border-amber-100 font-semibold">
              Reviewer
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
