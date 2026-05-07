import { NavLink, Outlet } from "react-router-dom";
import { LayoutDashboard, Compass, PlusCircle, ClipboardList } from "lucide-react";

const DASH_LINKS = [
  { to: "/dashbar/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/dashbar/explore", label: "Explore Pools", icon: Compass },
  { to: "/dashbar/create", label: "Create Pool", icon: PlusCircle },
  { to: "/dashbar/review", label: "Review", icon: ClipboardList },
];

export function DashbarLayout() {
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
            </div>
          </div>

          <Outlet />
        </div>
      </div>
    </div>
  );
}
