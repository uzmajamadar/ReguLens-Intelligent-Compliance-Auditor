import { useEffect, useState, type ReactNode } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "../Sidebar";
import { SidebarProvider, SidebarTrigger } from "../ui/sidebar";

function useAuth() {
  try {
    const raw = sessionStorage.getItem("regulens_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function DisclaimerBanner() {
  return (
    <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-6 py-2.5 mb-3 text-xs sm:text-sm text-amber-800">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-xs" aria-hidden="true">
        !
      </span>
      <p className="leading-snug">
        <strong className="font-semibold">Disclaimer:</strong> ReguLens AI analysis is for informational purposes only and does not constitute legal advice. All findings should be reviewed by a qualified professional for legal decisions.
      </p>
    </div>
  );
}

type AppLayoutProps = {
  children?: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  const user = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      setChecking(false);
      return;
    }
    const token = sessionStorage.getItem("regulens_token");
    fetch("/api/admin/organization/needs-onboarding", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.needs_onboarding && location.pathname !== "/onboarding") {
          navigate("/onboarding", { replace: true });
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [user, navigate, location.pathname]);

  if (checking) return null;

  return (
    <SidebarProvider>
      <div className="flex h-screen flex-col overflow-hidden">
        <DisclaimerBanner />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <main className="relative flex-1 overflow-auto bg-background px-6">
            <div className="sticky top-0 z-10 flex items-center bg-background/80 backdrop-blur-sm px-1 pt-1 pb-0">
              <SidebarTrigger />
            </div>
            {children ?? <Outlet />}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default AppLayout;
