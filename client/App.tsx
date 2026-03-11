import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import Header from "./components/layout/Header";
import Footer from "./components/layout/Footer";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import CaseList from "./pages/CaseList";
import CaseDetail from "./pages/CaseDetail";
import MyCases from "./pages/MyCases";
import JoinCase from "./pages/JoinCase";
import Contract from "./pages/Contract";
import Payment from "./pages/Payment";
import PaymentResult from "./pages/PaymentResult";
import CaseProgress from "./pages/CaseProgress";
import LegalTools from "./pages/LegalTools";
import PaymentOrderForm from "./pages/PaymentOrderForm";
import SeizureForm from "./pages/SeizureForm";
import BillingKeyRegister from "./pages/BillingKeyRegister";
import AdminDashboard from "./pages/admin/Dashboard";
import AdminCaseForm from "./pages/admin/CaseForm";
import AdminParties from "./pages/admin/Parties";
import AdminCaseUpdate from "./pages/admin/CaseUpdateForm";
import AdminDefendants from "./pages/admin/Defendants";
import Privacy from "./pages/Privacy";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">로딩 중...</div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">로딩 중...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/cases" element={<CaseList />} />
              <Route path="/cases/:id" element={<CaseDetail />} />
              <Route path="/tools" element={<LegalTools />} />
              <Route path="/privacy" element={<Privacy />} />

              {/* 로그인 필수 */}
              <Route path="/my" element={<ProtectedRoute><MyCases /></ProtectedRoute>} />
              <Route path="/cases/:id/join" element={<ProtectedRoute><JoinCase /></ProtectedRoute>} />
              <Route path="/cases/:id/contract" element={<ProtectedRoute><Contract /></ProtectedRoute>} />
              <Route path="/cases/:id/payment" element={<ProtectedRoute><Payment /></ProtectedRoute>} />
              <Route path="/cases/:id/progress" element={<ProtectedRoute><CaseProgress /></ProtectedRoute>} />
              <Route path="/cases/:id/payment-order" element={<ProtectedRoute><PaymentOrderForm /></ProtectedRoute>} />
              <Route path="/cases/:id/seizure" element={<ProtectedRoute><SeizureForm /></ProtectedRoute>} />
              <Route path="/cases/:id/billing" element={<ProtectedRoute><BillingKeyRegister /></ProtectedRoute>} />
              <Route path="/payment/success" element={<PaymentResult type="success" />} />
              <Route path="/payment/fail" element={<PaymentResult type="fail" />} />

              {/* 관리자 */}
              <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
              <Route path="/admin/cases/new" element={<AdminRoute><AdminCaseForm /></AdminRoute>} />
              <Route path="/admin/cases/:id/edit" element={<AdminRoute><AdminCaseForm /></AdminRoute>} />
              <Route path="/admin/cases/:id/parties" element={<AdminRoute><AdminParties /></AdminRoute>} />
              <Route path="/admin/cases/:id/update" element={<AdminRoute><AdminCaseUpdate /></AdminRoute>} />
              <Route path="/admin/cases/:id/defendants" element={<AdminRoute><AdminDefendants /></AdminRoute>} />
            </Routes>
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
