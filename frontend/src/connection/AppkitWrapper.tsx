import { createAppKit } from "@reown/appkit/react";
import { EthersAdapter } from "@reown/appkit-adapter-ethers";
import { liskSepolia, type AppKitNetwork } from "@reown/appkit/networks";
import type { ReactNode } from "react";

const projectId = import.meta.env.VITE_PROJECT_ID;

const networks: [AppKitNetwork, ...AppKitNetwork[]] = [liskSepolia];

const metadata = {
  name: "ScholarChain",
  description:
    "A decentralized grant protocol that connects donors, reviewers, and beneficiaries through transparent smart contracts, enabling trustless funding, verifiable achievements, and on-chain recognition of impact.",
  url: "http://localhost:5173/",
  icons: ["https://avatars.mywebsite.com/"],
};

createAppKit({
  adapters: [new EthersAdapter()],
  networks,
  metadata,
  projectId,
  features: {
    analytics: true, // Optional - defaults to your Cloud configuration
  },
});

export default function AppkitWrapper({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
