import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AppLayout from "./components/layout/AppLayout";
import { ToastProvider } from "./hooks/use-toast";
import { AuthProvider } from "./context/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import ProtectedRoute from "./components/ProtectedRoute";
import DocumentDetail from "./pages/DocumentDetail";
import DocumentsPage from "./pages/Documents";
import SettingsPage from "./pages/Settings";
import AuditorAIPage from "./pages/AuditorAI";
import Compliance from "./pages/Compliance";
import ComplianceDetails from "./pages/ComplianceDetails";
import ReviewQueue from "./pages/ReviewQueue";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AuditLogs from "./pages/AuditLogs";
import WorkflowInstances from "./pages/WorkflowInstances";
import Reports from "./pages/Reports";
import MyTasks from "./pages/MyTasks";
import OnboardingWizard from "./pages/OnboardingWizard";

function ComplianceDetailRedirect() {
  const { docId } = useParams();
  return <Navigate to={`/documents/${docId}?tab=compliance`} replace />;
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />

              <Route element={<AppLayout />}>
                <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
                <Route path="/documents/:id" element={<ProtectedRoute roles={["admin", "compliance_manager", "reviewer", "document_owner"]}><DocumentDetail /></ProtectedRoute>} />
                <Route path="/storage" element={<Navigate to="/documents" replace />} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                <Route path="/reports" element={<ProtectedRoute roles={["admin", "compliance_manager", "reviewer", "document_owner"]}><Reports /></ProtectedRoute>} />
                <Route path="/compliance" element={<ProtectedRoute roles={["admin", "compliance_manager", "reviewer", "document_owner"]}><Compliance /></ProtectedRoute>} />
                <Route path="/compliance/details" element={<ProtectedRoute roles={["admin", "compliance_manager", "reviewer", "document_owner"]}><ComplianceDetails /></ProtectedRoute>} />
                <Route path="/compliance/details/:docId" element={<ComplianceDetailRedirect />} />
                <Route path="/compliance/review" element={<ProtectedRoute roles={["admin", "compliance_manager", "reviewer"]}><ReviewQueue /></ProtectedRoute>} />
                <Route path="/my-tasks" element={<ProtectedRoute roles={["admin", "compliance_manager", "reviewer", "document_owner"]}><MyTasks /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute roles={["admin"]}><AdminUsers /></ProtectedRoute>} />
              <Route path="/admin/audit-logs" element={<ProtectedRoute roles={["admin"]}><AuditLogs /></ProtectedRoute>} />
            </Route>

              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<ProtectedRoute roles={["admin"]}><OnboardingWizard /></ProtectedRoute>} />
              <Route path="/auditor-ai" element={<ProtectedRoute><AuditorAIPage /></ProtectedRoute>} />
              <Route path="/query" element={<Navigate to="/auditor-ai" replace />} />
            </Routes>
            </ErrorBoundary>
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
