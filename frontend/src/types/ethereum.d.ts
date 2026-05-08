export {};

// Minimal MetaMask / EIP-1193 provider type for window.ethereum
interface EthereumProvider {
  isMetaMask?: boolean;
  providers?: EthereumProvider[];
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
