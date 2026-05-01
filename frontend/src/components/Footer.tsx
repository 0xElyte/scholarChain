import { Link } from "react-router-dom";
import logo from "../assets/logo.png";

const COLS = {
  Protocol: [
    { label: "Explore Pools", to: "/dashbar/explore" },
    { label: "Create a Pool", to: "/dashbar/create"  },
    { label: "Dashboard",     to: "/dashbar/dashboard" },
    { label: "Documentation", to: "#" },
  ],
  Community: [
    { label: "Twitter / X",  href: "#" },
    { label: "Discord",      href: "#" },
    { label: "GitHub",       href: "#" },
    { label: "Forum",        href: "#" },
  ],
  Legal: [
    { label: "Terms of Service", href: "#" },
    { label: "Privacy Policy",   href: "#" },
    { label: "Cookie Policy",    href: "#" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-[#07182b]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">

          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5 mb-4">
              <span className="w-10 h-10 rounded-xl bg-white/95 flex items-center justify-center overflow-hidden">
                <img src={logo} alt="ScholarChain" className="w-9 h-9 object-contain" />
              </span>
              <span className="font-bold text-white text-lg">Scholar<span className="text-teal-300">Chain</span></span>
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-6 max-w-xs">
              A trustless scholarship protocol where every fund, vote, and payout is publicly verifiable on Ethereum.
            </p>
            <div className="flex gap-2">
              {[
                { l: "X",       icon: "𝕏",  href: "#" },
                { l: "Discord", icon: "💬", href: "#" },
                { l: "GitHub",  icon: "⌥",  href: "#" },
              ].map(({ l, icon, href }) => (
                <a key={l} href={href}
                  className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 hover:border-teal-400 hover:bg-teal-400/10 flex items-center justify-center text-slate-400 hover:text-white text-xs transition-all">
                  {icon}
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(COLS).map(([section, items]) => (
            <div key={section}>
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-widest mb-5">{section}</h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item.label}>
                    {"to" in item ? (
                      <Link to={item.to} className="text-sm text-slate-400 hover:text-white transition-colors">{item.label}</Link>
                    ) : (
                      <a href={item.href} className="text-sm text-slate-400 hover:text-white transition-colors">{item.label}</a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-500">© 2025 ScholarChain Protocol. All rights reserved.</p>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-linear-to-br from-cyan-950 to-teal-500 inline-block" />
              Built on Ethereum
            </span>
            <span>·</span>
            <span>Powered by IPFS</span>
            <span>·</span>
            <span>Secured by OpenZeppelin</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
