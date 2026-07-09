import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import PaymentOrderForm from "./pages/PaymentOrderForm";
import SeizureForm from "./pages/SeizureForm";
import BillingKeyRegister from "./pages/BillingKeyRegister";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Consent from "./pages/Consent";
import Guide from "./pages/Guide";
import Lawyer from "./pages/Lawyer";
import CaseRequest from "./pages/CaseRequest";
import Faq from "./pages/Faq";
import Welcome from "./pages/Welcome";
import Account from "./pages/Account";
import MyPayments from "./pages/MyPayments";
import MyPaymentMethods from "./pages/MyPaymentMethods";
import MyNotifications from "./pages/MyNotifications";
import RouteMeta from "./components/RouteMeta";

// ── 콘솔 레이아웃(좌측 사이드바) ──
import MemberConsole from "./components/console/MemberConsole";
import LawyerConsole from "./components/console/LawyerConsole";
import AdminConsole from "./components/console/AdminConsole";

// ── 변호사 콘솔 페이지 ──
import LawyerDashboard from "./pages/lawyer/LawyerDashboard";
import LawyerCases from "./pages/lawyer/LawyerCases";
import LawyerDocuments from "./pages/lawyer/LawyerDocuments";

// ── 관리자 페이지 ──
import AdminDashboard from "./pages/admin/Dashboard";
import AdminCases from "./pages/admin/AdminCases";
import AdminCaseForm from "./pages/admin/CaseForm";
import AdminParties from "./pages/admin/Parties";
import AdminCaseUpdate from "./pages/admin/CaseUpdateForm";
import AdminDefendants from "./pages/admin/Defendants";
import CasePackage from "./pages/admin/CasePackage";
import AdminCaseRequests from "./pages/admin/CaseRequests";
import AdminPayments from "./pages/admin/AdminPayments";
import AdminAccounting from "./pages/admin/AdminAccounting";
import AdminPricing from "./pages/admin/AdminPricing";
import AdminMembers from "./pages/admin/AdminMembers";
import AdminLawyers from "./pages/admin/AdminLawyers";
import AdminAuditLogs from "./pages/admin/AdminAuditLogs";
import Owner from "./pages/admin/Owner";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading, isAdmin, isLawyer } = useAuth();
  const location = useLocation();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">로딩 중…</div>;
  if (!user) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  // 프로필 완성 게이트: 생년월일·주소가 비어 있으면 완성 페이지로 강제(소셜/기존 회원 포함).
  // 소송·계약 서면 발송에 필요. /welcome 자신·운영진(admin/lawyer)은 제외(락아웃·루프 방지).
  const profileIncomplete = !user.birthDate || !user.postalCode || !user.addressLine1;
  if (profileIncomplete && !isAdmin && !isLawyer && location.pathname !== "/welcome") {
    return <Navigate to="/welcome" replace />;
  }
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">로딩 중…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function LawyerRoute({ children }: { children: React.ReactNode }) {
  const { user, isLawyer, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">로딩 중…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isLawyer) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function OwnerRoute({ children }: { children: React.ReactNode }) {
  const { user, isOwner, isLoading } = useAuth();
  if (isLoading) return <div className="flex items-center justify-center min-h-screen">로딩 중…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOwner) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RouteMeta />
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1">
            <Routes>
              {/* ── 공개 ── */}
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/cases" element={<CaseList />} />
              <Route path="/cases/:id" element={<CaseDetail />} />
              <Route path="/guide" element={<Guide />} />
              <Route path="/lawyer" element={<Lawyer />} />
              <Route path="/request" element={<CaseRequest />} />
              <Route path="/faq" element={<Faq />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/consent" element={<Consent />} />

              {/* ── 로그인 필수: 프로필 완성 · 사건 진행 플로우 ── */}
              <Route path="/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
              <Route path="/cases/:id/join" element={<ProtectedRoute><JoinCase /></ProtectedRoute>} />
              <Route path="/cases/:id/contract" element={<ProtectedRoute><Contract /></ProtectedRoute>} />
              <Route path="/cases/:id/payment" element={<ProtectedRoute><Payment /></ProtectedRoute>} />
              <Route path="/cases/:id/progress" element={<ProtectedRoute><CaseProgress /></ProtectedRoute>} />
              <Route path="/cases/:id/payment-order" element={<ProtectedRoute><PaymentOrderForm /></ProtectedRoute>} />
              <Route path="/cases/:id/seizure" element={<ProtectedRoute><SeizureForm /></ProtectedRoute>} />
              <Route path="/cases/:id/billing" element={<ProtectedRoute><BillingKeyRegister /></ProtectedRoute>} />
              <Route path="/payment/success" element={<PaymentResult type="success" />} />
              <Route path="/payment/fail" element={<PaymentResult type="fail" />} />

              {/* ── 회원 콘솔 ── */}
              <Route element={<ProtectedRoute><MemberConsole /></ProtectedRoute>}>
                <Route path="/my" element={<MyCases />} />
                <Route path="/account" element={<Account />} />
                <Route path="/my/payments" element={<MyPayments />} />
                <Route path="/my/payment-methods" element={<MyPaymentMethods />} />
                <Route path="/my/notifications" element={<MyNotifications />} />
              </Route>

              {/* ── 변호사 콘솔 ── */}
              <Route element={<LawyerRoute><LawyerConsole /></LawyerRoute>}>
                <Route path="/desk" element={<LawyerDashboard />} />
                <Route path="/desk/requests" element={<AdminCaseRequests />} />
                <Route path="/desk/cases" element={<LawyerCases />} />
                <Route path="/desk/documents" element={<LawyerDocuments />} />
                <Route path="/desk/payments" element={<AdminPayments />} />
              </Route>

              {/* ── 관리자 콘솔 ── */}
              <Route element={<AdminRoute><AdminConsole /></AdminRoute>}>
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/owner" element={<OwnerRoute><Owner /></OwnerRoute>} />
                <Route path="/admin/cases" element={<AdminCases />} />
                <Route path="/admin/requests" element={<AdminCaseRequests />} />
                <Route path="/admin/pricing" element={<AdminPricing />} />
                <Route path="/admin/payments" element={<AdminPayments />} />
                <Route path="/admin/accounting" element={<AdminAccounting />} />
                <Route path="/admin/members" element={<AdminMembers />} />
                <Route path="/admin/lawyers" element={<AdminLawyers />} />
                <Route path="/admin/audit-logs" element={<AdminAuditLogs />} />
              </Route>

              {/* ── 관리자 사건 서브플로우(단독 화면) ── */}
              <Route path="/admin/cases/new" element={<AdminRoute><AdminCaseForm /></AdminRoute>} />
              <Route path="/admin/cases/:id/edit" element={<AdminRoute><AdminCaseForm /></AdminRoute>} />
              <Route path="/admin/cases/:id/parties" element={<AdminRoute><AdminParties /></AdminRoute>} />
              <Route path="/admin/cases/:id/update" element={<AdminRoute><AdminCaseUpdate /></AdminRoute>} />
              <Route path="/admin/cases/:id/defendants" element={<AdminRoute><AdminDefendants /></AdminRoute>} />
              <Route path="/admin/cases/:id/package" element={<LawyerRoute><CasePackage /></LawyerRoute>} />
            </Routes>
          </main>
          <Footer />
        </div>
      </AuthProvider>
    </BrowserRouter>
  );
}
