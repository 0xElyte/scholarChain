import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import ConnectButton from "./connectionButton";
import { useWalletContext } from "../connection/WalletContext";

const NAV_LINKS = [
  { to: "/#how-it-works", label: "How it works" },
  { to: "/#features", label: "Features" },
  { to: "/#start", label: "Explore Pools" },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { wallet } = useWalletContext();
  const showPublicLinks = pathname === "/";

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-b border-cyan-950/10 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 shrink-0">
          <span className="w-10 h-10 rounded-xl bg-white border border-cyan-950/10 shadow-sm flex items-center justify-center overflow-hidden">
            <img
              src={logo}
              alt="ScholarChain"
              className="w-9 h-9 object-contain"
            />
          </span>
          <span className="font-extrabold text-slate-950 text-lg tracking-tight">
            Scholar<span className="text-teal-600">Chain</span>
          </span>
        </Link>

        {/* Desktop nav */}
        {showPublicLinks && (
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
        )}

        {/* Right side */}
        <div className="flex items-center gap-3 shrink-0">
          <ConnectButton />

          {/* Hamburger */}
          <button
            className="md:hidden flex flex-col gap-1 p-2 cursor-pointer"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menu"
          >
            <span
              className={`block w-5 h-0.5 bg-slate-600 transition-all origin-center ${mobileOpen ? "rotate-45 translate-y-[6px]" : ""}`}
            />
            <span
              className={`block w-5 h-0.5 bg-slate-600 transition-all ${mobileOpen ? "opacity-0" : ""}`}
            />
            <span
              className={`block w-5 h-0.5 bg-slate-600 transition-all origin-center ${mobileOpen ? "-rotate-45 -translate-y-[6px]" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden bg-white border-t border-slate-100 px-4 py-3 space-y-1 animate-fade-up shadow-lg">
          {showPublicLinks &&
            NAV_LINKS.map(({ to, label }) => (
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
              onClick={() => {
                navigate("/dashbar/dashboard");
                setMobileOpen(false);
              }}
              className="w-full mt-2 px-4 py-2.5 rounded-xl bg-cyan-950 text-white text-sm font-semibold text-left cursor-pointer"
            >
              Open Dashbar
            </button>
          )}
          {!wallet.isConnected && (
            <div className="mt-2">
              <ConnectButton />
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
