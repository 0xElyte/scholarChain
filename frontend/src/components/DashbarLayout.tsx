import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { ethers } from "ethers";
import type { WalletState } from "../types";
import { ABI } from "../data/ABI";
import { CONTRACT_ADDRESSES } from "../data/contracts";
import logo from "../assets/logo.png";

const SEPOLIA_RPC =
  (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";

interface Props {
  wallet: WalletState;
  shortAddress: string | null;
  onConnect: () => void;
  onDisconnect: () => void;
}

const DASH_LINKS = [
  { to: "/dashbar/dashboard", label: "Dashboard", icon: "D" },
  { to: "/dashbar/explore", label: "Explore Pools", icon: "E" },
  { to: "/dashbar/create", label: "Create Pool", icon: "C" },
];

export function DashbarLayout({ wallet, shortAddress, onConnect, onDisconnect }: Props) {
  const navigate = useNavigate();
  const [isTreasurySigner, setIsTreasurySigner] = useState(false);

  useEffect(() => {
    if (!wallet.address) {
      setIsTreasurySigner(false);
      return;
    }
    let cancelled = false;
    async function check() {
      try {
        const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC);
        const treasury = new ethers.Contract(
          CONTRACT_ADDRESSES.TreasuryMultisig,
          ABI.TreasuryMultisig,
          provider,
        );
        const signers: string[] = await treasury.getSigners();
        if (!cancelled) {
          setIsTreasurySigner(
            signers.some((s) => s.toLowerCase() === wallet.address!.toLowerCase()),
          );
        }
      } catch {
        if (!cancelled) setIsTreasurySigner(false);
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [wallet.address]);

  function handleDisconnect() {
    onDisconnect();
    navigate("/");
  }

  return (
    <div className="min-h-screen bg-[#eef6f4]">
      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-0 hidden h-screen w-72 shrink-0 border-r border-cyan-950/10 bg-white/90 p-5 backdrop-blur-xl lg:block">
          <Link to="/" className="mb-8 flex items-center gap-3 rounded-2xl border border-cyan-950/10 bg-white p-3 shadow-sm">
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-white">
              <img src={logo} alt="ScholarChain" className="h-10 w-10 object-contain" />
            </span>
            <div>
              <p className="text-sm font-black text-[#07182b]">ScholarChain</p>
              <p className="text-xs text-slate-500">Grant workspace</p>
            </div>
          </Link>

          <nav className="space-y-1">
            {DASH_LINKS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    isActive
                      ? "bg-[#07182b] text-white shadow-lg shadow-cyan-950/10"
                      : "text-slate-600 hover:bg-teal-50 hover:text-teal-800"
                  }`
                }
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15 text-xs font-black">
                  {item.icon}
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Treasury CTA — only visible to treasury signers */}
          {isTreasurySigner && (
            <div className="mt-5 rounded-2xl bg-gradient-to-br from-[#07182b] to-teal-800 p-[1px] shadow-lg shadow-cyan-950/20">
              <button
                disabled
                className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-[#07182b] to-teal-800 px-4 py-3.5 text-left cursor-pointer group"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg transition-transform group-hover:scale-110">
                  🏛
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black text-white leading-tight">Go to Treasury</p>
                  <p className="text-xs text-teal-300 mt-0.5 truncate">Multisig governance</p>
                </div>
                <span className="ml-auto text-teal-400 text-sm shrink-0">→</span>
              </button>
            </div>
          )}

          <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-cyan-950/10 bg-[#f7fbfb] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Wallet</p>
            {wallet.isConnected ? (
              <>
                <p className="mt-2 font-mono text-sm font-bold text-[#07182b]">{shortAddress}</p>
                <p className="mt-1 text-xs text-slate-500">{wallet.balance} USDT</p>
                <button
                  onClick={handleDisconnect}
                  className="mt-4 w-full rounded-xl border border-cyan-950/10 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Disconnect
                </button>
              </>
            ) : (
              <button
                onClick={onConnect}
                disabled={wallet.isConnecting}
                className="mt-3 w-full rounded-xl bg-[#07182b] px-3 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer transition-colors"
              >
                {wallet.isConnecting ? "Connecting…" : "Connect Wallet"}
              </button>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-0 z-30 border-b border-cyan-950/10 bg-white/95 px-4 py-3 backdrop-blur-xl lg:hidden">
            <div className="flex gap-2 overflow-x-auto">
              {DASH_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
                      isActive ? "bg-[#07182b] text-white" : "bg-white text-slate-600 border border-cyan-950/10"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              {isTreasurySigner && (
                <button
                  disabled
                  className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold bg-gradient-to-r from-[#07182b] to-teal-700 text-white cursor-pointer"
                >
                  🏛 <span>Treasury</span>
                </button>
              )}
            </div>
          </div>

          <Outlet />
        </div>
      </div>
    </div>
  );
}
