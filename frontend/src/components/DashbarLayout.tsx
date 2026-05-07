import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Compass, PlusCircle, ClipboardList } from "lucide-react";
import { JsonRpcProvider, Contract } from "ethers";
import { useWalletContext } from "../connection/WalletContext";
import TreasuryMultisigABI from "../constants/TreasuryMultisigABI.json";

const TREASURY_ADDRESS = "0x55dd331Fc1c894D7EC74C931A586aA05fE694d6A";
const SEPOLIA_RPC =
  (import.meta.env.VITE_SEPOLIA_RPC_URL as string | undefined) ??
  "https://ethereum-sepolia-rpc.publicnode.com";

const DASH_LINKS = [
  { to: "/dashbar/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dashbar/explore", label: "Explore Pools", icon: Compass },
  { to: "/dashbar/create", label: "Create Pool", icon: PlusCircle },
  { to: "/dashbar/review", label: "Review", icon: ClipboardList },
];

export function DashbarLayout() {
  const { wallet } = useWalletContext();
  const [isTreasurySigner, setIsTreasurySigner] = useState(false);

  useEffect(() => {
    const address = wallet.address;
    if (!address) {
      setIsTreasurySigner(false);
      return;
    }
    let cancelled = false;
    async function check() {
      try {
        const provider = new JsonRpcProvider(SEPOLIA_RPC);
        const treasury = new Contract(TREASURY_ADDRESS, TreasuryMultisigABI, provider);
        const signers: string[] = await treasury.getSigners();
        if (!cancelled) {
          setIsTreasurySigner(
            !!address && signers.some((s) => s.toLowerCase() === address.toLowerCase()),
          );
        }
      } catch {
        if (!cancelled) setIsTreasurySigner(false);
      }
    }
    void check();
    return () => { cancelled = true; };
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
