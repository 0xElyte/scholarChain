import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatUSDTWithCommas } from "../utils/format";
import { useWalletContext } from "../connection/WalletContext";

function useCountUp(target: number, duration = 1500) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    setCount(0);
    if (target <= 0) return;
    let current = 0;
    const steps = 60;
    const increment = target / steps;
    const intervalMs = duration / steps;
    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(current));
      }
    }, intervalMs);
    return () => clearInterval(timer);
  }, [target, duration]);

  return count;
}

const FEATURES = [
  {
    icon: "01",
    title: "Transparent funding",
    desc: "Every donation, review vote, distribution, claim, and refund is traceable from the pool contract.",
  },
  {
    icon: "02",
    title: "Community review",
    desc: "Grant panels approve applications through on-chain voting with clear quorum requirements.",
  },
  {
    icon: "03",
    title: "Direct grant claims",
    desc: "Approved grant recipients claim funds straight to their wallet when the pool enters distribution.",
  },
  {
    icon: "04",
    title: "Custom applications",
    desc: "Pool creators define the exact metadata fields applicants must submit before review begins.",
  },
];

const STEPS = [
  "Create a pool with criteria, dates, reviewers, and USDT token settings.",
  "Donors fund the grant pool while applicants prepare their proposal documents.",
  "Grant applicants submit IPFS proposal CIDs and payout wallet addresses.",
  "Reviewers vote, winners are selected, and grants are claimed on-chain.",
];

const SCHOLAR_PHOTO =
  "https://images.unsplash.com/photo-1758270705518-b61b40527e76?auto=format&fit=crop&w=1200&q=80";
const REVIEW_PHOTO =
  "https://images.unsplash.com/photo-1741699428220-65f37f3fbbcb?auto=format&fit=crop&w=1000&q=80";
const LIBRARY_PHOTO =
  "https://images.unsplash.com/photo-1764213077313-41b4dc822d8c?auto=format&fit=crop&w=1000&q=80";
const CTA_PHOTO =
  "https://images.unsplash.com/photo-1758270705290-62b6294dd044?auto=format&fit=crop&w=1000&q=80";

export function LandingPage() {
  const navigate = useNavigate();
  const { wallet, connect } = useWalletContext();

  const animatedPools = useCountUp(12);
  const animatedProposals = useCountUp(47);
  const animatedVotes = useCountUp(89);
  const animatedDeposited = useCountUp(48_500_000_000);
  const formattedTotal = `$${formatUSDTWithCommas(animatedDeposited.toString())}`;

  const handleCreateClick = async () => {
    if (!wallet.isConnected) {
      await connect();
      return;
    }

    navigate("/dashbar/create");
  };

  const handleExploreClick = async () => {
    if (!wallet.isConnected) {
      await connect();
      return;
    }

    navigate("/dashbar/explore");
  };

  return (
    <div className="bg-[#f7fbfb] text-slate-900">
      <section className="relative overflow-hidden border-b border-cyan-950/10 bg-[#07182b]">
        <div className="absolute inset-x-0 top-0 h-1 bg-linear-to-r from-cyan-950 via-teal-500 to-amber-400" />
        <div className="absolute inset-0">
          <img
            src={SCHOLAR_PHOTO}
            alt="Students collaborating on grant work"
            className="h-full w-full object-cover opacity-70"
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,24,43,0.94)_0%,rgba(7,24,43,0.78)_38%,rgba(7,24,43,0.22)_100%)]" />
          <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(7,24,43,0.88)_0%,transparent_45%)]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[calc(100svh-4rem)] py-16 lg:py-20 flex flex-col">
          <div className="flex-1 grid lg:grid-cols-[1fr_380px] gap-10 items-end">
            <div className="max-w-4xl animate-fade-up">
              <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black leading-[0.9] tracking-tight text-white max-w-5xl">
                Grants with proof, not paperwork.
              </h1>

              <p className="mt-7 text-lg text-slate-200 max-w-2xl leading-relaxed">
                Create transparent grant pools, let donors fund them with USDT,
                review applicants through signer votes, and distribute awards
                directly to scholar wallets.
              </p>

              <div className="mt-9 flex flex-wrap gap-3">
                <button
                  onClick={() => void handleCreateClick()}
                  className="px-6 py-3 rounded-xl bg-amber-400 text-[#07182b] text-sm font-bold hover:bg-amber-300 transition-all cursor-pointer"
                >
                  Create Pool
                </button>

                <button
                  onClick={() => void handleExploreClick()}
                  className="px-6 py-3 rounded-xl bg-teal-700 text-white text-sm font-bold hover:bg-teal-600 transition-all cursor-pointer"
                >
                  Explore Pools
                </button>
              </div>
            </div>

            <div className="hidden lg:block animate-slide-left">
              <div className="rounded-[1.75rem] bg-white/10 border border-white/15 p-4 backdrop-blur-xl shadow-2xl shadow-black/20">
                <div className="rounded-3xl bg-white p-5">
                  <div className="flex items-center justify-between mb-5">
                    <p className="text-xs font-bold text-slate-500">
                      Live pool
                    </p>
                    <span className="rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-3 py-1 text-xs font-bold">
                      Reviewing
                    </span>
                  </div>
                  <p className="text-2xl font-black text-[#07182b] leading-tight">
                    Web3 Research Fellowship
                  </p>
                  <div className="mt-6 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <p className="text-[11px] text-slate-500">Pool balance</p>
                      <p className="text-2xl font-black text-[#07182b] mt-1">
                        $120K
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4">
                      <p className="text-[11px] text-slate-500">Quorum</p>
                      <p className="text-2xl font-black text-[#07182b] mt-1">
                        4 / 5
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full w-4/5 rounded-full bg-linear-to-r from-teal-500 to-amber-400" />
                  </div>
                  <div className="mt-6 grid grid-cols-3 gap-2">
                    {["Fund", "Vote", "Claim"].map((item) => (
                      <div
                        key={item}
                        className="rounded-xl bg-[#07182b] px-3 py-2 text-center"
                      >
                        <p className="text-[11px] text-teal-100">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <p className="text-xs text-slate-300">Total pools</p>
              <p className="text-4xl font-black text-white mt-2">
                {animatedPools}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-300">Total funded volume</p>
              <p className="text-4xl font-black text-white mt-2">
                {formattedTotal}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-300">Scholar proposals</p>
              <p className="text-4xl font-black text-white mt-2">
                {animatedProposals}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-slate-300">Reviewer votes</p>
              <p className="text-4xl font-black text-white mt-2">
                {animatedVotes}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="scroll-mt-24 py-20 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-[0.85fr_1fr] gap-12 items-start">
            <div>
              <p className="text-xs font-extrabold text-teal-700 uppercase tracking-[0.24em] mb-4">
                Product Flow
              </p>
              <h2 className="text-4xl lg:text-5xl font-black text-[#07182b] leading-tight">
                One interface for creators, reviewers, donors, and grant
                recipients.
              </h2>
              <p className="mt-5 text-slate-600 leading-relaxed">
                ScholarChain is built around the grant pool lifecycle. The UI
                keeps each role focused on the action they can take right now.
              </p>
              <div className="mt-8 grid grid-cols-[0.85fr_1fr] gap-4 max-w-md">
                <div className="scholar-card rounded-3xl overflow-hidden bg-white">
                  <img
                    src={LIBRARY_PHOTO}
                    alt="Students studying in a library"
                    className="w-full h-full min-h-52 object-cover"
                  />
                </div>
                <div className="scholar-card rounded-3xl overflow-hidden bg-white">
                  <img
                    src={REVIEW_PHOTO}
                    alt="Scholar reviewing grant application"
                    className="w-full h-36 object-cover"
                  />
                  <p className="p-4 text-xs font-bold text-[#07182b]">
                    Pools, votes, and grant claims stay visible from one place.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              {FEATURES.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl scholar-card bg-white p-6 card-lift"
                >
                  <span className="inline-flex w-10 h-10 items-center justify-center rounded-xl bg-[#07182b] text-teal-200 text-xs font-black mb-5">
                    {feature.icon}
                  </span>
                  <h3 className="font-extrabold text-[#07182b] mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {feature.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        className="scroll-mt-24 py-20 lg:py-24 bg-[#07182b] text-white"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            <div>
              <p className="text-xs font-extrabold text-teal-300 uppercase tracking-[0.24em] mb-4">
                How it works
              </p>
              <h2 className="text-4xl lg:text-5xl font-black leading-tight">
                From grant idea to scholar payout in four clear steps.
              </h2>
              <div className="mt-8 rounded-[1.75rem] overflow-hidden border border-white/10 shadow-2xl shadow-black/20">
                <img
                  src={LIBRARY_PHOTO}
                  alt="Students studying in a modern library"
                  className="h-64 w-full object-cover"
                />
              </div>
            </div>

            <div className="space-y-4">
              {STEPS.map((step, index) => (
                <div
                  key={step}
                  className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5"
                >
                  <span className="shrink-0 w-9 h-9 rounded-xl bg-teal-400 text-[#07182b] flex items-center justify-center text-sm font-black">
                    {index + 1}
                  </span>
                  <p className="text-sm text-slate-200 leading-relaxed pt-1">
                    {step}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="start" className="scroll-mt-24 py-20 bg-[#f7fbfb]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-[2rem] scholar-card-strong overflow-hidden">
            <div className="grid md:grid-cols-[0.7fr_1fr]">
              <div className="relative min-h-72 overflow-hidden">
                <img
                  src={CTA_PHOTO}
                  alt="Students collaborating around a laptop"
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-linear-to-br from-[#07182b]/70 to-teal-700/30" />
                <div className="absolute left-6 bottom-6 right-6 rounded-2xl bg-white/90 p-4 shadow-xl">
                  <p className="text-xs font-bold text-teal-700 uppercase tracking-[0.18em]">
                    Transparent grants
                  </p>
                  <p className="mt-1 text-2xl font-black text-[#07182b]">
                    {formattedTotal} pooled
                  </p>
                </div>
              </div>
              <div className="p-8 sm:p-10">
                <p className="text-xs font-extrabold text-amber-600 uppercase tracking-[0.24em] mb-4">
                  Start building
                </p>
                <h2 className="text-3xl sm:text-4xl font-black text-[#07182b] leading-tight mb-4">
                  Launch a verifiable grant program.
                </h2>
                <p className="text-slate-600 leading-relaxed mb-8">
                  Explore existing grant pools, create a new pool for your
                  community, or connect your wallet to manage applications and
                  claims.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => void handleExploreClick()}
                    className="px-6 py-3 rounded-xl bg-[#07182b] text-white text-sm font-bold hover:bg-teal-700 transition-all cursor-pointer"
                  >
                    Explore Pools
                  </button>
                  <button
                    onClick={() => void handleCreateClick()}
                    className="px-6 py-3 rounded-xl bg-amber-400 text-[#07182b] text-sm font-bold hover:bg-amber-300 transition-all cursor-pointer"
                  >
                    Create Pool
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
