export function formatUSDT(raw: string): string {
  const n = parseFloat(raw);
  if (isNaN(n)) return "0";
  if (n >= 1_000_000) {
    const m = (n / 1_000_000).toFixed(1);
    return m.endsWith(".0") ? m.slice(0, -2) + "M" : m + "M";
  }
  if (n >= 1_000) {
    const k = (n / 1_000).toFixed(1);
    return k.endsWith(".0") ? k.slice(0, -2) + "K" : k + "K";
  }
  return n.toLocaleString();
}

export function formatUSDTWithCommas(raw: string): string {
  const n = Number(raw);
  if (Number.isNaN(n)) return "0";

  const usdtAmount = n / 1_000_000;
  return usdtAmount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export function timeRemaining(endTimestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = endTimestamp - now;
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / 86400);
  const hours = Math.floor((diff % 86400) / 3600);
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m remaining`;
}
