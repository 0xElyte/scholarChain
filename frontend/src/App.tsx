import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
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
import AppkitWrapper from "./connection/AppkitWrapper";
import { WalletProvider } from "./connection/WalletContext";

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

function HashScroll() {
  return null;
}

function App() {
  return (
    <BrowserRouter>
      <AppkitWrapper>
        <WalletProvider>
          <div className="min-h-screen scholar-page flex flex-col">
            <Navbar />
            <HashScroll />
            <Routes>
              <Route element={<PublicLayout />}>
                <Route path="/" element={<LandingPage />} />
              </Route>
              <Route path="/dashbar" element={<DashbarLayout />}>
                <Route
                  index
                  element={<Navigate to="/dashbar/dashboard" replace />}
                />
                <Route path="dashboard" element={<DashboardPage />} />
                <Route path="explore" element={<ExplorerPage />} />
                <Route path="create" element={<CreatePoolPage />} />
                <Route path="review" element={<ReviewPage />} />
                <Route path="claim" element={<ClaimPage />} />
                <Route path="pool/:address" element={<PoolDetailPage />} />
              </Route>
              <Route
                path="/dashboard"
                element={<Navigate to="/dashbar/dashboard" replace />}
              />
              <Route
                path="/explore"
                element={<Navigate to="/dashbar/explore" replace />}
              />
              <Route
                path="/create"
                element={<Navigate to="/dashbar/create" replace />}
              />
              <Route
                path="/claim"
                element={<Navigate to="/dashbar/claim" replace />}
              />
              <Route
                path="/pool/:address"
                element={<Navigate to="/dashbar/explore" replace />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </WalletProvider>
      </AppkitWrapper>
    </BrowserRouter>
  );
}
export default App;
