import { AppKitProvider } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { sepolia, type AppKitNetwork } from "@reown/appkit/networks";
import type { ReactNode } from "react";

const projectId = (import.meta.env.VITE_PROJECT_ID as string) ?? "";
if (!projectId) {
  console.warn("VITE_PROJECT_ID env variable is not set — wallet connection will not work.");
}
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [sepolia];

const metadata = {
  name: "ScholarChain",
  description:
    "A decentralized grant protocol for transparent grant funding, review, and distribution.",
  url:
    (import.meta.env.VITE_APP_URL as string | undefined) ??
    (typeof window !== "undefined" ? window.location.origin : "https://localhost:5173"),
  icons: [
    (import.meta.env.VITE_APP_ICON as string | undefined) ??
      "https://raw.githubusercontent.com/Feyisara2108/scholarChain/dev/frontend/public/favicon.svg",
  ],
};

const appKitConfig = {
  adapters: [new EthersAdapter()],
  networks,
  defaultNetwork: sepolia,
  metadata,
  projectId,
  allWallets: "SHOW" as const,
  enableWallets: true,
  enableInjected: true,
  enableEIP6963: true,
  enableWalletConnect: true,
  defaultAccountTypes: {
    eip155: "eoa" as const,
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
};

export default function AppkitWrapper({ children }: { children: ReactNode }) {
  return <AppKitProvider {...appKitConfig}>{children}</AppKitProvider>;
}
