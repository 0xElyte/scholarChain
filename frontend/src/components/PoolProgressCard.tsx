import { useEffect, useState } from "react";
import type { PoolState } from "../types";

interface Props {
  state: PoolState;
  submissionStart: number;   // unix seconds
  submissionEnd: number;     // unix seconds
  reviewEnd: number;         // unix seconds
  winners: number;
  claimedCount: number;
  distributionEntered: boolean;
  proposalCount: number;
}

// Returns { days, hours, mins, secs } left until a unix-second timestamp.
// Returns null if already past.
function useCountdown(targetSec: number) {
  const calc = () => {
    const diff = targetSec - Math.floor(Date.now() / 1000);
    if (diff <= 0) return null;
    return {
      days: Math.floor(diff / 86400),
      hours: Math.floor((diff % 86400) / 3600),
      mins: Math.floor((diff % 3600) / 60),
      secs: diff % 60,
    };
  };

  const [left, setLeft] = useState(calc);

  useEffect(() => {
    const id = setInterval(() => setLeft(calc()), 1000);
    return () => clearInterval(id);
  }, [targetSec]);

  return left;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

interface TimerProps {
  targetSec: number;
  label: string;
  accent: string; // tailwind text color
  ringColor: string; // tailwind border + ring color
}

function CountdownTimer({ targetSec, label, accent, ringColor }: TimerProps) {
  const left = useCountdown(targetSec);

  if (!left) {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${accent}`}>
          {label} — ended
        </span>
      </div>
    );
  }

  const units = [
    { v: left.days, u: "d" },
    { v: left.hours, u: "h" },
    { v: left.mins, u: "m" },
    { v: left.secs, u: "s" },
  ].filter((x, i) => i === 3 || x.v > 0 || left.days === 0);

  return (
    <div>
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
        {label}
      </p>
      <div className="flex items-end gap-2">
        {units.map(({ v, u }) => (
          <div key={u} className="flex flex-col items-center">
            <div
              className={`w-14 h-14 rounded-xl border-2 ${ringColor} flex items-center justify-center`}
            >
              <span className={`text-xl font-bold tabular-nums ${accent}`}>
                {pad(v)}
              </span>
            </div>
            <span className="text-xs text-slate-400 mt-1 font-medium">{u}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

export function PoolProgressCard({
  state,
  submissionStart,
  submissionEnd,
  reviewEnd,
  winners,
  claimedCount,
  distributionEntered,
  proposalCount,
}: Props) {
  if (state === "CLOSED" || state === "CANCELLED") return null;

  // ── PENDING: countdown to submissions opening ──
  if (state === "PENDING") {
    return (
      <div className="bg-white rounded-2xl border border-cyan-950/10 shadow-sm px-6 py-5 mb-6">
        <CountdownTimer
          targetSec={submissionStart}
          label="Submissions open in"
          accent="text-indigo-600"
          ringColor="border-indigo-300"
        />
        <p className="text-xs text-slate-400 mt-4">
          Donations are accepted during this period. The pool moves to{" "}
          <span className="font-semibold text-slate-500">Active</span> once
          submissions open.
        </p>
      </div>
    );
  }

  // ── ACTIVE: countdown to submission deadline ──
  if (state === "ACTIVE") {
    return (
      <div className="bg-white rounded-2xl border border-cyan-950/10 shadow-sm px-6 py-5 mb-6">
        <CountdownTimer
          targetSec={submissionEnd}
          label="Submissions close in"
          accent="text-teal-600"
          ringColor="border-teal-300"
        />
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-100">
          <StatPill
            icon="📝"
            label="Proposals submitted"
            value={String(proposalCount)}
          />
          <StatPill
            icon="🗳️"
            label="Next phase"
            value="Review"
          />
        </div>
      </div>
    );
  }

  // ── REVIEW: countdown to review deadline ──
  if (state === "REVIEW") {
    return (
      <div className="bg-white rounded-2xl border border-cyan-950/10 shadow-sm px-6 py-5 mb-6">
        <CountdownTimer
          targetSec={reviewEnd}
          label="Review period ends in"
          accent="text-amber-600"
          ringColor="border-amber-300"
        />
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-slate-100">
          <StatPill icon="📝" label="Proposals" value={String(proposalCount)} />
          <StatPill icon="🏆" label="Winners so far" value={String(winners)} />
          <StatPill icon="⏭️" label="Next phase" value="Distributing" />
        </div>
      </div>
    );
  }

  // ── DISTRIBUTING: show what's left to close the pool ──
  if (state === "DISTRIBUTING") {
    const unclaimed = winners - claimedCount;

    if (!distributionEntered) {
      return (
        <div className="bg-white rounded-2xl border border-cyan-950/10 shadow-sm px-6 py-5 mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            To advance to Closed
          </p>
          <div className="flex flex-col gap-3">
            <Step done={false} label="Enter distribution phase (triggers fee deduction)" />
            {winners > 0 && (
              <Step done={false} label={`All ${winners} winner${winners !== 1 ? "s" : ""} claim their grant`} />
            )}
          </div>
        </div>
      );
    }

    if (winners === 0) {
      return (
        <div className="bg-white rounded-2xl border border-cyan-950/10 shadow-sm px-6 py-5 mb-6">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            To advance to Closed
          </p>
          <Step done={true} label="Distribution phase entered — donors may claim refunds" />
        </div>
      );
    }

    return (
      <div className="bg-white rounded-2xl border border-cyan-950/10 shadow-sm px-6 py-5 mb-6">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
          To advance to Closed
        </p>
        <div className="flex flex-col gap-3 mb-4">
          <Step done={true} label="Distribution phase entered" />
          <Step
            done={unclaimed === 0}
            label={
              unclaimed === 0
                ? "All winners have claimed their grant"
                : `${unclaimed} of ${winners} winner${winners !== 1 ? "s" : ""} yet to claim`
            }
          />
        </div>
        {/* Claim progress bar */}
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-500"
            style={{ width: `${winners > 0 ? (claimedCount / winners) * 100 : 0}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 mt-1">
          {claimedCount} / {winners} claimed
        </p>
      </div>
    );
  }

  return null;
}

// ── small helpers ──────────────────────────────────────────────

function StatPill({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-base leading-none">{icon}</span>
      <div>
        <p className="text-xs text-slate-400">{label}</p>
        <p className="text-sm font-semibold text-slate-700">{value}</p>
      </div>
    </div>
  );
}

function Step({ done, label }: { done: boolean; label: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
          done ? "bg-emerald-500" : "bg-slate-100 border-2 border-slate-300"
        }`}
      >
        {done && (
          <svg viewBox="0 0 20 20" fill="white" className="w-3 h-3">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        )}
      </div>
      <p className={`text-sm ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>
        {label}
      </p>
    </div>
  );
}
