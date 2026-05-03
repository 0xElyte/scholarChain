import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { WalletState } from "../types";
import logo from "../assets/logo.png";

interface Props {
  wallet: WalletState;
  shortAddress: string | null;
  onConnect: () => void | Promise<void>;
}

function EthIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 256 417" fill="none">
      <path d="M127.9 0L125.2 9.1V285.2L127.9 287.9L255.7 212.9L127.9 0Z" fill="#627EEA"/>
      <path d="M127.9 0L0 212.9L127.9 287.9V154.1V0Z" fill="#8197EE"/>
      <path d="M127.9 312.2L126.3 314.1V412.2L127.9 417L255.8 237.2L127.9 312.2Z" fill="#627EEA"/>
      <path d="M127.9 417V312.2L0 237.2L127.9 417Z" fill="#8197EE"/>
    </svg>
  );
}

const NAV_LINKS = [
  { to: "/#how-it-works", label: "How it works" },
  { to: "/#features", label: "Features" },
  { to: "/#start", label: "Start" },
];

export function Navbar({ wallet, shortAddress, onConnect }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  async function handleConnect() {
    await onConnect();
    navigate("/dashbar/dashboard");
    setMobileOpen(false);
  }

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-b border-cyan-950/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">

        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <span className="w-10 h-10 rounded-xl bg-white border border-cyan-950/10 shadow-sm flex items-center justify-center overflow-hidden">
            <img src={logo} alt="ScholarChain" className="w-9 h-9 object-contain" />
          </span>
          <span className="font-extrabold text-slate-950 text-lg tracking-tight">
            Scholar<span className="text-teal-600">Chain</span>
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-1 flex-1 justify-center">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-all duration-200"
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
            <EthIcon />
            Sepolia
          </div>

          {wallet.isConnected ? (
            <div className="flex items-center gap-2">
              <span className="hidden sm:block text-xs text-slate-500 font-medium">{wallet.balance} USDT</span>
              <button onClick={() => navigate("/dashbar/dashboard")}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-teal-300 hover:bg-teal-50 text-slate-700 hover:text-teal-700 text-sm font-medium transition-all duration-200 cursor-pointer shadow-sm">
                <span className="w-5 h-5 rounded-full bg-linear-to-br from-cyan-950 to-teal-500 flex items-center justify-center text-[9px] text-white font-bold">
                  {shortAddress?.[2]?.toUpperCase() ?? "?"}
                </span>
                {shortAddress}
              </button>
            </div>
          ) : (
            <button onClick={handleConnect} disabled={wallet.isConnecting}
              className="px-4 py-2 rounded-xl bg-cyan-950 text-white text-sm font-semibold hover:bg-teal-700 hover:shadow-lg hover:shadow-teal-100 hover:-translate-y-0.5 disabled:opacity-60 transition-all duration-200 cursor-pointer">
              {wallet.isConnecting ? "Connecting…" : "Connect Wallet"}
            </button>
          )}

          {/* Hamburger */}
          <button className="md:hidden flex flex-col gap-1 p-2 cursor-pointer"
            onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
            <span className={`block w-5 h-0.5 bg-slate-600 transition-all origin-center ${mobileOpen ? "rotate-45 translate-y-[6px]" : ""}`} />
            <span className={`block w-5 h-0.5 bg-slate-600 transition-all ${mobileOpen ? "opacity-0" : ""}`} />
            <span className={`block w-5 h-0.5 bg-slate-600 transition-all origin-center ${mobileOpen ? "-rotate-45 -translate-y-[6px]" : ""}`} />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-3 space-y-1 animate-fade-up shadow-lg">
          {NAV_LINKS.map(({ to, label }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setMobileOpen(false)}
              className="block px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              {label}
            </Link>
          ))}
          {wallet.isConnected && (
            <button
              onClick={() => { navigate("/dashbar/dashboard"); setMobileOpen(false); }}
              className="w-full mt-2 px-4 py-2.5 rounded-xl bg-cyan-950 text-white text-sm font-semibold text-left cursor-pointer"
            >
              Open Dashbar
            </button>
          )}
          {!wallet.isConnected && (
            <button onClick={handleConnect}
              className="w-full mt-2 px-4 py-2.5 rounded-xl bg-cyan-950 text-white text-sm font-semibold text-left cursor-pointer">
              Connect Wallet
            </button>
          )}
        </div>
      )}
    </nav>
  );
}
