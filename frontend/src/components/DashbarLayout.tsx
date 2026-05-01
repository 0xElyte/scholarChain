import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import type { WalletState } from "../types";
import logo from "../assets/logo.png";

interface Props {
  wallet: WalletState;
  shortAddress: string | null;
  onDisconnect: () => void;
}

const DASH_LINKS = [
  { to: "/dashbar/dashboard", label: "Dashboard", icon: "D" },
  { to: "/dashbar/explore", label: "Explore Pools", icon: "E" },
  { to: "/dashbar/create", label: "Create Pool", icon: "C" },
];

export function DashbarLayout({ wallet, shortAddress, onDisconnect }: Props) {
  const navigate = useNavigate();

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

          <div className="absolute bottom-5 left-5 right-5 rounded-2xl border border-cyan-950/10 bg-[#f7fbfb] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Wallet</p>
            <p className="mt-2 font-mono text-sm font-bold text-[#07182b]">{shortAddress ?? "Not connected"}</p>
            <p className="mt-1 text-xs text-slate-500">{wallet.balance} USDT</p>
            {wallet.isConnected && (
              <button
                onClick={handleDisconnect}
                className="mt-4 w-full rounded-xl border border-cyan-950/10 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Disconnect
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
            </div>
          </div>

          <Outlet />
        </div>
      </div>
    </div>
  );
}
