import type { PoolState } from "../types";

interface Props { state: PoolState; size?: "sm" | "md"; }

const CONFIG: Record<PoolState, { label: string; cls: string }> = {
  PENDING:      { label: "Pending",      cls: "bg-slate-100 text-slate-600 border-slate-200" },
  ACTIVE:       { label: "Active",       cls: "bg-teal-50 text-teal-700 border-teal-200" },
  REVIEW:       { label: "In Review",    cls: "bg-amber-50 text-amber-700 border-amber-200" },
  DISTRIBUTING: { label: "Distributing", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  CLOSED:       { label: "Closed",       cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  CANCELLED:    { label: "Cancelled",    cls: "bg-red-50 text-red-600 border-red-200" },
};

export function StatusBadge({ state, size = "md" }: Props) {
  const { label, cls } = CONFIG[state];
  const sz = size === "sm" ? "text-[10px] px-2 py-0.5" : "text-xs px-2.5 py-1";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-semibold border ${sz} ${cls}`}>
      {state === "ACTIVE" && <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />}
      {label}
    </span>
  );
}
