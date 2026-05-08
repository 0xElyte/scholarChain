import { useEffect, type ReactNode } from "react";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from "react-router-dom";
import { Navbar } from "./components/Navbar";
import { Footer } from "./components/Footer";
import { DashbarLayout } from "./components/DashbarLayout";
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ExplorerPage } from "./pages/ExplorerPage";
import { CreatePoolPage } from "./pages/CreatePoolPage";
import { ClaimPage } from "./pages/ClaimPage";
import { PoolDetailPage } from "./pages/PoolDetailPage";
import { ReviewPage } from "./pages/ReviewPage";
import { TreasuryPage } from "./pages/TreasuryPage";
import AppkitWrapper from "./connection/AppkitWrapper";
import { WalletProvider, useWalletContext } from "./connection/WalletContext";

function PublicLayout() {
  return (
    <div className="flex flex-col min-h-screen">
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { wallet } = useWalletContext();
  if (!wallet.isConnected) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function PageTitle() {
  const { pathname } = useLocation();

  useEffect(() => {
    const base = "ScholarChain";
    let page = "";
    if (pathname.startsWith("/dashbar/dashboard")) page = "Dashboard";
    else if (pathname.startsWith("/dashbar/explore")) page = "Explore Pools";
    else if (pathname.startsWith("/dashbar/create")) page = "Create Pool";
    else if (pathname.startsWith("/dashbar/review")) page = "Review Applications";
    else if (pathname.startsWith("/dashbar/claim")) page = "Claim";
    else if (pathname.startsWith("/dashbar/pool/")) page = "Pool Detail";
    else if (pathname === "/treasury") page = "Treasury · Admin";
    document.title = page ? `${page} · ${base}` : base;
  }, [pathname]);

  return null;
}

function AppShell() {
  const { pathname } = useLocation();
  const isStandalone = pathname === "/treasury";

  return (
    <div className="min-h-screen scholar-page flex flex-col">
      {!isStandalone && <Navbar />}
      <HashScroll />
      <PageTitle />
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<LandingPage />} />
        </Route>
        <Route path="/dashbar" element={<DashbarLayout />}>
          <Route index element={<Navigate to="/dashbar/dashboard" replace />} />
          <Route path="dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="explore" element={<ExplorerPage />} />
          <Route path="create" element={<ProtectedRoute><CreatePoolPage /></ProtectedRoute>} />
          <Route path="review" element={<ProtectedRoute><ReviewPage /></ProtectedRoute>} />
          <Route path="claim" element={<ProtectedRoute><ClaimPage /></ProtectedRoute>} />
          <Route path="pool/:address" element={<PoolDetailPage />} />
        </Route>
        {/* Treasury: standalone full-page, no sidebar/navbar */}
        <Route path="/treasury" element={<TreasuryPage />} />
        <Route path="/dashboard" element={<Navigate to="/dashbar/dashboard" replace />} />
        <Route path="/explore" element={<Navigate to="/dashbar/explore" replace />} />
        <Route path="/create" element={<Navigate to="/dashbar/create" replace />} />
        <Route path="/claim" element={<Navigate to="/dashbar/claim" replace />} />
        <Route path="/pool/:address" element={<Navigate to="/dashbar/explore" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
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
      if (target) target.scrollIntoView({ behavior: "smooth" });
    });
  }, [hash, pathname]);

  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AppkitWrapper>
        <WalletProvider>
          <AppShell />
        </WalletProvider>
      </AppkitWrapper>
    </BrowserRouter>
  );
}
export default App;
