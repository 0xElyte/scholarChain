import { useState, useMemo } from "react";
import type { PoolState } from "../types";
import { MOCK_POOLS } from "../data/mockData";
import { PoolCard } from "../components/PoolCard";
import { useWalletContext } from "../connection/WalletContext";

const STATE_FILTERS: { label: string; value: PoolState | "ALL" }[] = [
  { label: "All", value: "ALL" },
  { label: "Pending", value: "PENDING" },
  { label: "Active", value: "ACTIVE" },
  { label: "In Review", value: "REVIEW" },
  { label: "Distributing", value: "DISTRIBUTING" },
  { label: "Closed", value: "CLOSED" },
  { label: "Cancelled", value: "CANCELLED" },
];

const EXPLORER_PHOTO =
  "https://images.unsplash.com/photo-1758270705290-62b6294dd044?auto=format&fit=crop&w=1200&q=80";

export function ExplorerPage() {
  const { wallet } = useWalletContext();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<PoolState | "ALL">("ALL");
  const [sortBy, setSortBy] = useState<"newest" | "largest" | "ending">(
    "newest",
  );

  const filtered = useMemo(() => {
    let pools = [...MOCK_POOLS];
    if (stateFilter !== "ALL")
      pools = pools.filter((p) => p.state === stateFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      pools = pools.filter(
        (p) =>
          p.poolName.toLowerCase().includes(q) ||
          p.creator.toLowerCase().includes(q),
      );
    }
    if (sortBy === "newest") pools.sort((a, b) => b.createdAt - a.createdAt);
    if (sortBy === "largest")
      pools.sort(
        (a, b) => parseFloat(b.totalDeposited) - parseFloat(a.totalDeposited),
      );
    if (sortBy === "ending") {
      const now = Math.floor(Date.now() / 1000);
      pools = pools.filter((p) => p.submissionEnd > now);
      pools.sort((a, b) => a.submissionEnd - b.submissionEnd);
    }
    return pools;
  }, [search, stateFilter, sortBy]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="scholar-card-strong rounded-3xl overflow-hidden mb-8">
        <div className="grid md:grid-cols-[1fr_360px]">
          <div className="p-7 sm:p-8">
            <p className="text-xs font-extrabold text-teal-700 uppercase tracking-[0.22em] mb-3">
              Explore grants
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-[#07182b]">
              Grant Pool Explorer
            </h1>
            <p className="text-sm text-slate-500 mt-2 max-w-xl">
              Browse {MOCK_POOLS.length} scholarship pools, compare funding
              state, and find open opportunities for scholars or donors.
            </p>
          </div>
          <img
            src={EXPLORER_PHOTO}
            alt="Students collaborating around a laptop"
            className="hidden md:block h-full min-h-[190px] w-full object-cover"
          />
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <span className="absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">
          🔍
        </span>
        <input
          type="text"
          className="scholar-input w-full pl-9 pr-10 py-3 text-sm rounded-xl border placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
          placeholder="Search by pool name or creator address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search && (
          <button
            className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
            onClick={() => setSearch("")}
          >
            ✕
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex flex-wrap gap-1.5">
          {STATE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStateFilter(f.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors cursor-pointer ${
                stateFilter === f.value
                  ? "bg-[#07182b] text-white border-[#07182b]"
                  : "bg-white text-slate-600 border-slate-300 hover:border-teal-400 hover:text-teal-700"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          className="scholar-input text-sm rounded-lg border px-3 py-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500 cursor-pointer"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        >
          <option value="newest">Newest First</option>
          <option value="largest">Largest Pool</option>
          <option value="ending">Ending Soon</option>
        </select>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">🔎</p>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">
            No pools found
          </h3>
          <p className="text-slate-500 text-sm mb-6">
            Try adjusting your search or filters.
          </p>
          <button
            onClick={() => {
              setSearch("");
              setStateFilter("ALL");
            }}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-4">
            {filtered.length} pool{filtered.length !== 1 ? "s" : ""} found
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((p) => (
              <PoolCard
                key={p.address}
                pool={p}
                connectedAddress={wallet.address}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
