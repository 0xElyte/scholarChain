import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { Contract, JsonRpcProvider } from "ethers";
import {
  LayoutDashboard,
  Compass,
  PlusCircle,
  ClipboardList,
  HandCoins,
} from "lucide-react";
import { useWalletContext } from "../connection/WalletContext";
import { useUSDTBalance } from "../hooks/read-hooks/useUSDTBalance";
import TreasuryMultisigABI from "../constants/TreasuryMultisigABI.json";

const DASH_LINKS = [
  { to: "/dashbar/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dashbar/explore", label: "Explore Pools", icon: Compass },
  { to: "/dashbar/create", label: "Create Pool", icon: PlusCircle },
  { to: "/dashbar/review", label: "Review", icon: ClipboardList },
  { to: "/dashbar/claim", label: "Claim Center", icon: HandCoins },
];

const MOCK_USDT_ADDRESS = (import.meta.env.VITE_MOCK_USDT_ADDRESS || "").trim();
const SEPOLIA_RPC =
  (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";
const TREASURY_ADDRESS = (
  import.meta.env.VITE_TREASURY_MULTISIG_ADDRESS ||
  "0x55dd331Fc1c894D7EC74C931A586aA05fE694d6A"
).trim();

export function DashbarLayout() {
  const { wallet, connect, disconnect, shortAddress } = useWalletContext();
  const { balance: usdtBalance } = useUSDTBalance(
    MOCK_USDT_ADDRESS || undefined,
    wallet.address ?? undefined,
  );
  const [isTreasurySigner, setIsTreasurySigner] = useState(false);

  useEffect((): void | (() => void) => {
    const address = wallet.address;
    if (!address) {
      setIsTreasurySigner(false);
      return;
    }
    let cancelled = false;
    async function check() {
      try {
        const provider = new JsonRpcProvider(SEPOLIA_RPC);
        const treasury = new Contract(
          TREASURY_ADDRESS,
          TreasuryMultisigABI as any,
          provider,
        );
        const signers: string[] = await treasury.getSigners();
        if (!cancelled) {
          setIsTreasurySigner(
            !!address &&
              signers.some((s) => s.toLowerCase() === address.toLowerCase()),
          );
        }
      } catch {
        if (!cancelled) setIsTreasurySigner(false);
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [wallet.address]);

  return (
    <div className="min-h-screen bg-[#eef6f4] pt-16">
      <div className="mx-auto flex max-w-[1440px]">
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-72 shrink-0 border-r border-cyan-950/10 bg-white/90 p-5 backdrop-blur-xl lg:block">
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
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
                  <item.icon size={15} />
                </span>
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Wallet panel + Treasury CTA pinned to bottom */}
          <div className="absolute bottom-5 left-5 right-5 space-y-3">
            {/* Treasury CTA — only visible to treasury signers */}
            {isTreasurySigner && (
              <>
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-cyan-950/10" />
                  <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
                    Admin
                  </span>
                  <div className="h-px flex-1 bg-cyan-950/10" />
                </div>
                <div className="rounded-2xl bg-gradient-to-br from-[#07182b] to-teal-800 p-[1px] shadow-lg shadow-cyan-950/20">
                  <NavLink
                    to="/treasury"
                    className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-[#07182b] to-teal-800 px-4 py-3.5 text-left cursor-pointer group"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg transition-transform group-hover:scale-110">
                      🏛
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-black text-white leading-tight">
                        Go to Treasury
                      </p>
                      <p className="text-xs text-teal-300 mt-0.5 truncate">
                        Multisig governance
                      </p>
                    </div>
                    <span className="ml-auto text-teal-400 text-sm shrink-0">
                      →
                    </span>
                  </NavLink>
                </div>
              </>
            )}

            {/* Wallet panel */}
            <div className="flex items-center gap-2">
              <div className="h-px flex-1 bg-cyan-950/10" />
              <span className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-slate-400">
                Account
              </span>
              <div className="h-px flex-1 bg-cyan-950/10" />
            </div>
            <div className="rounded-2xl border border-cyan-950/10 bg-[#f7fbfb] p-4">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">
                Wallet
              </p>
              {wallet.isConnected ? (
                <>
                  <p className="mt-2 font-mono text-sm font-bold text-[#07182b] truncate">
                    {shortAddress}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {usdtBalance} USDT
                  </p>
                  <button
                    onClick={() => disconnect()}
                    className="mt-4 w-full rounded-xl border border-cyan-950/10 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={() => connect()}
                  disabled={wallet.isConnecting}
                  className="mt-3 w-full rounded-xl bg-[#07182b] px-3 py-2.5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-60 cursor-pointer transition-colors"
                >
                  {wallet.isConnecting ? "Connecting…" : "Connect Wallet"}
                </button>
              )}
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="sticky top-16 z-30 border-b border-cyan-950/10 bg-white/95 px-4 py-3 backdrop-blur-xl lg:hidden">
            <div className="flex gap-2 overflow-x-auto">
              {DASH_LINKS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `shrink-0 rounded-xl px-3 py-2 text-sm font-semibold ${
                      isActive
                        ? "bg-[#07182b] text-white"
                        : "bg-white text-slate-600 border border-cyan-950/10"
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
