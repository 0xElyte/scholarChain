import type { PoolState } from "../types";

interface Stage {
  key: PoolState;
  label: string;
  /** Tailwind classes for the filled circle */
  filledBg: string;
  /** Tailwind classes for the unfilled circle border + text */
  emptyBorder: string;
  emptyText: string;
  /** Tailwind classes for the connecting line that follows this stage */
  lineColor: string;
}

const STAGES: Stage[] = [
  {
    key: "PENDING",
    label: "Pending",
    filledBg: "bg-indigo-500",
    emptyBorder: "border-indigo-300",
    emptyText: "text-indigo-300",
    lineColor: "bg-teal-400",
  },
  {
    key: "ACTIVE",
    label: "Active",
    filledBg: "bg-teal-500",
    emptyBorder: "border-teal-300",
    emptyText: "text-teal-300",
    lineColor: "bg-amber-400",
  },
  {
    key: "REVIEW",
    label: "Review",
    filledBg: "bg-amber-500",
    emptyBorder: "border-amber-300",
    emptyText: "text-amber-300",
    lineColor: "bg-orange-400",
  },
  {
    key: "DISTRIBUTING",
    label: "Distributing",
    filledBg: "bg-orange-500",
    emptyBorder: "border-orange-300",
    emptyText: "text-orange-300",
    lineColor: "bg-emerald-400",
  },
  {
    key: "CLOSED",
    label: "Closed",
    filledBg: "bg-emerald-500",
    emptyBorder: "border-emerald-300",
    emptyText: "text-emerald-300",
    lineColor: "",
  },
];

const STATE_ORDER: Record<PoolState, number> = {
  PENDING: 0,
  ACTIVE: 1,
  REVIEW: 2,
  DISTRIBUTING: 3,
  CLOSED: 4,
  CANCELLED: -1,
};

interface Props {
  state: PoolState;
}

export function PoolLifecycleStepper({ state }: Props) {
  const isCancelled = state === "CANCELLED";
  const currentIndex = isCancelled ? -1 : STATE_ORDER[state];

  return (
    <div className="bg-white rounded-2xl border border-cyan-950/10 shadow-sm px-6 py-5 mb-6">
      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
        Pool Lifecycle
      </p>

      {/* Stepper row */}
      <div className="flex items-center">
        {STAGES.map((stage, idx) => {
          const isPassed = currentIndex > idx;
          const isCurrent = currentIndex === idx;
          const isDimmed = !isCancelled && currentIndex < idx;

          return (
            <div key={stage.key} className="flex items-center flex-1 last:flex-none">
              {/* Node */}
              <div className="flex flex-col items-center">
                <div
                  className={[
                    "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-all select-none",
                    isPassed || isCurrent
                      ? `${stage.filledBg} border-transparent text-white shadow-md`
                      : isCancelled
                      ? "bg-slate-100 border-slate-300 text-slate-300"
                      : `bg-white ${stage.emptyBorder} ${stage.emptyText}`,
                  ].join(" ")}
                >
                  {isPassed ? (
                    // checkmark for already-passed stages
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-4 h-4"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </div>

                {/* Label */}
                <span
                  className={[
                    "mt-2 text-xs font-medium whitespace-nowrap",
                    isCurrent
                      ? "text-slate-800"
                      : isPassed
                      ? "text-slate-500"
                      : "text-slate-300",
                    isCancelled ? "text-slate-300" : "",
                  ].join(" ")}
                >
                  {stage.label}
                </span>

                {/* "Current" pulse dot */}
                {isCurrent && (
                  <span className="mt-1 w-1.5 h-1.5 rounded-full bg-current opacity-70 animate-pulse" />
                )}
              </div>

              {/* Connecting line (not after last stage) */}
              {idx < STAGES.length - 1 && (
                <div
                  className={[
                    "flex-1 h-0.5 mx-1 mb-5 rounded-full transition-all",
                    isCancelled
                      ? "bg-slate-200"
                      : isPassed || isCurrent
                      ? stage.lineColor
                      : isDimmed
                      ? "bg-slate-200"
                      : "bg-slate-200",
                  ].join(" ")}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Cancelled banner */}
      {isCancelled && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
          <span className="text-red-500 text-base">✕</span>
          <p className="text-sm font-semibold text-red-600">
            Pool Cancelled
          </p>
          <p className="text-xs text-red-400 ml-auto">
            Donors may claim refunds
          </p>
        </div>
      )}
    </div>
  );
}
