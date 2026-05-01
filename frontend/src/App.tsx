import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useWallet } from "./hooks/useWallet";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { DashbarLayout } from "./components/DashbarLayout";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { CreatePoolPage } from "./pages/CreatePoolPage";
import { PoolDetailPage } from "./pages/PoolDetailPage";

function App() {
  const { wallet, connect, disconnect, shortAddress } = useWallet();

  return (
    <BrowserRouter>
      <AppShell wallet={wallet} connect={connect} disconnect={disconnect} shortAddress={shortAddress} />
    </BrowserRouter>
  );
}

export default App;

function AppShell({
  wallet,
  connect,
  disconnect,
  shortAddress,
}: {
  wallet: ReturnType<typeof useWallet>["wallet"];
  connect: ReturnType<typeof useWallet>["connect"];
  disconnect: ReturnType<typeof useWallet>["disconnect"];
  shortAddress: string | null;
}) {
  const location = useLocation();
  const isDashbar = location.pathname.startsWith("/dashbar");

  return (
    <div className="min-h-screen scholar-page flex flex-col">
      {!isDashbar && <Navbar wallet={wallet} shortAddress={shortAddress} onConnect={connect} />}
      <HashScroll />
      <main className={`flex-1 ${isDashbar ? "" : "pt-16"}`}>
        <Routes>
          <Route path="/" element={<LandingPage wallet={wallet} onConnect={connect} />} />
          <Route
            path="/dashbar"
            element={<DashbarLayout wallet={wallet} shortAddress={shortAddress} onDisconnect={disconnect} />}
          >
            <Route index element={<Navigate to="/dashbar/dashboard" replace />} />
            <Route path="dashboard" element={wallet.isConnected ? <DashboardPage wallet={wallet} /> : <Navigate to="/" replace />} />
            <Route path="explore" element={<ExplorerPage wallet={wallet} />} />
            <Route path="create" element={<CreatePoolPage wallet={wallet} />} />
            <Route path="pool/:address" element={<PoolDetailPage wallet={wallet} />} />
          </Route>
          <Route path="/dashboard" element={<Navigate to="/dashbar/dashboard" replace />} />
          <Route path="/explore" element={<Navigate to="/dashbar/explore" replace />} />
          <Route path="/create" element={<Navigate to="/dashbar/create" replace />} />
          <Route path="/pool/:address" element={<Navigate to="/dashbar/explore" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!isDashbar && <Footer />}
    </div>
  );
}

function HashScroll() {
  const { hash, pathname } = useLocation();

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0, behavior: pathname === "/" ? "auto" : "smooth" });
      return;
    }

    requestAnimationFrame(() => {
      const target = document.querySelector(hash);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }, [hash, pathname]);

  return null;
}
