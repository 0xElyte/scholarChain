import { Link } from "react-router-dom";
import { MOCK_POOLS, MOCK_STATS } from "../data/mockData";
import { PoolCard } from "../components/PoolCard";
import { formatUSDT } from "../utils/format";
import { useWalletContext } from "../connection/WalletContext";

const DASHBOARD_PHOTO =
  "https://images.unsplash.com/photo-1764213077313-41b4dc822d8c?auto=format&fit=crop&w=900&q=80";

export function DashboardPage() {
  const { wallet } = useWalletContext();
  const addr = wallet.address?.toLowerCase();

  const myCreated = MOCK_POOLS.filter((p) => p.creator.toLowerCase() === addr);
  const mySigning = MOCK_POOLS.filter((p) =>
    p.signers.some((s) => s.toLowerCase() === addr),
  );
  const pendingVotes = mySigning.filter(
    (p) => p.state === "ACTIVE" || p.state === "REVIEW",
  );
  const activePools = MOCK_POOLS.filter(
    (p) => p.state === "ACTIVE" || p.state === "PENDING",
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header */}
      <div className="scholar-card-strong rounded-3xl overflow-hidden mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="p-7 sm:p-8">
            <p className="text-xs font-extrabold text-teal-700 uppercase tracking-[0.22em] mb-3">
              Dashboard
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-[#07182b]">
              Welcome back
            </h1>
            <p className="text-sm text-slate-500 mt-2">
              {wallet.address?.slice(0, 6)}...{wallet.address?.slice(-4)} - your
              ScholarChain overview
            </p>
          </div>
          <img
            src={DASHBOARD_PHOTO}
            alt="Students studying in a library"
            className="hidden md:block h-40 w-72 object-cover"
          />
          <div className="px-7 pb-7 md:p-0 md:pr-8">
            <Link
              to="/dashbar/create"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#07182b] text-white text-sm font-semibold hover:bg-teal-700 transition-colors no-underline"
            >
              + Create Pool
            </Link>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            label: "Total Pools",
            value: MOCK_STATS.totalPools,
            sub: "across all creators",
            color: "text-slate-800",
          },
          {
            label: "Active Right Now",
            value: MOCK_STATS.activePools,
            sub: "accepting proposals",
            color: "text-teal-700",
          },
          {
            label: "Total Value",
            value: `$${formatUSDT(MOCK_STATS.totalFunded)}`,
            sub: "USDT deposited",
            color: "text-amber-600",
          },
          {
            label: "Scholars Funded",
            value: MOCK_STATS.totalWinners,
            sub: `$${formatUSDT(MOCK_STATS.totalGrantsClaimed)} claimed`,
            color: "text-emerald-600",
          },
        ].map(({ label, value, sub, color }) => (
          <div key={label} className="scholar-card rounded-xl p-5">
            <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">
              {label}
            </p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
            <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
          </div>
        ))}
      </div>

      {/* Pending vote alert */}
      {pendingVotes.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8 p-4 rounded-xl bg-amber-50 border border-amber-200">
          <span className="text-2xl">🗳️</span>
          <div className="flex-1">
            <p className="font-semibold text-amber-800">
              {pendingVotes.length} pool{pendingVotes.length > 1 ? "s" : ""}{" "}
              awaiting your review
            </p>
            <p className="text-sm text-amber-700">
              Proposals need your vote before the review period ends.
            </p>
          </div>
          <Link
            to="/dashbar/explore"
            className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors no-underline shrink-0"
          >
            Review Now
          </Link>
        </div>
      )}

      {/* My pools + signing duties */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">
              My Created Pools
            </h2>
            <Link
              to="/dashbar/explore"
              className="text-sm text-teal-700 hover:underline no-underline"
            >
              View all
            </Link>
          </div>
          {myCreated.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-teal-300 p-8 text-center shadow-sm">
              <p className="text-slate-500 text-sm mb-3">
                You haven't created any pools yet.
              </p>
              <Link
                to="/dashbar/create"
                className="text-sm font-semibold text-teal-700 hover:underline no-underline"
              >
                Create your first pool →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {myCreated.map((p) => (
                <PoolCard
                  key={p.address}
                  pool={p}
                  connectedAddress={wallet.address}
                />
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-800">
              My Review Duties
            </h2>
            <Link
              to="/dashbar/explore"
              className="text-sm text-teal-700 hover:underline no-underline"
            >
              View all
            </Link>
          </div>
          {mySigning.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-teal-300 p-8 text-center shadow-sm">
              <p className="text-slate-500 text-sm">
                You're not a reviewer on any pool.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mySigning.map((p) => (
                <PoolCard
                  key={p.address}
                  pool={p}
                  connectedAddress={wallet.address}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Recent pools */}
      <section className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-800">
            Recently Created Pools
          </h2>
          <Link
            to="/dashbar/explore"
            className="text-sm text-teal-700 hover:underline no-underline"
          >
            See all →
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {MOCK_POOLS.slice(0, 4).map((p) => (
            <PoolCard
              key={p.address}
              pool={p}
              connectedAddress={wallet.address}
            />
          ))}
        </div>
      </section>

      {/* Apply CTA */}
      {activePools.length > 0 && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 p-6 rounded-2xl bg-[#07182b] text-white shadow-2xl shadow-cyan-950/20">
          <div className="flex-1">
            <p className="font-semibold text-lg">
              {activePools.length} pool
              {activePools.length > 1 ? "s are" : " is"} currently accepting
              applications
            </p>
            <p className="text-teal-100 text-sm mt-0.5">
              Submit your proposal before the deadline.
            </p>
          </div>
          <Link
            to="/dashbar/explore"
            className="px-5 py-2 rounded-lg bg-white text-teal-700 font-semibold text-sm hover:bg-teal-50 transition-colors no-underline shrink-0"
          >
            Apply Now
          </Link>
        </div>
      )}
    </div>
  );
}
