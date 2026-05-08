import { useWalletContext } from "../connection/WalletContext";

export default function ConnectButton() {
  const { wallet, connect } = useWalletContext();

  const shortAddress = wallet.address
    ? `${wallet.address.slice(0, 6)}...${wallet.address.slice(-4)}`
    : null;

  async function handleClick() {
    await connect();
  }

  return (
    <button
      type="button"
      onClick={() => void handleClick()}
      className="inline-flex items-center justify-center rounded-xl bg-[#07182b] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
      disabled={wallet.isConnecting}
    >
      {wallet.isConnected
        ? shortAddress
        : wallet.isConnecting
          ? "Connecting..."
          : "Connect Wallet"}
    </button>
  );
}
