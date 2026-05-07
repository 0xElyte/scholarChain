import { useEffect } from "react";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";
import { useNavigate, useLocation } from "react-router-dom";

export default function ConnectButton() {
  const { open } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isConnecting = status === "connecting" || status === "reconnecting";
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  // Redirect to dashboard immediately after wallet connects from landing page
  useEffect(() => {
    if (isConnected && pathname === "/") {
      navigate("/dashbar/dashboard");
    }
  }, [isConnected, pathname, navigate]);

  async function handleClick() {
    await open();
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="inline-flex items-center justify-center rounded-xl bg-[#07182b] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={isConnecting}
    >
      {isConnected ? shortAddress : isConnecting ? "Connecting..." : "Connect Wallet"}
    </button>
  );
}
