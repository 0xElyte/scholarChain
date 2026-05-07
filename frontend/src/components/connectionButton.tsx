import { useAppKit, useAppKitAccount } from "@reown/appkit/react";

export default function ConnectButton() {
  const { open } = useAppKit();
  const { address, isConnected, status } = useAppKitAccount();

  const isConnecting = status === "connecting" || status === "reconnecting";
  const shortAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

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
      {isConnected
        ? shortAddress
        : isConnecting
          ? "Connecting..."
          : "Connect Wallet"}
    </button>
  );
}
