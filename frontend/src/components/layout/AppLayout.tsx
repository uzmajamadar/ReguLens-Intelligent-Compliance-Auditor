import { useEffect, useState, type ReactNode } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import Sidebar from "../Sidebar";
import Navbar from "../Navbar";
import { PageShell } from "../shared/PageShell";
import { SidebarProvider } from "../ui/sidebar";
import { X } from "lucide-react";

function useAuth() {
  try {
    const raw = sessionStorage.getItem("regulens_user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function DisclaimerBanner() {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("disclaimer_dismissed") === "true");

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-6 py-2.5 text-xs sm:text-sm text-amber-800">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-900 font-bold text-xs" aria-hidden="true">
        !
      </span>
      <p className="leading-snug flex-1">
        <strong className="font-semibold">Disclaimer:</strong> ReguLens AI analysis is for informational purposes only and does not constitute legal advice. All findings should be reviewed by a qualified professional for legal decisions.
      </p>
      <button
        onClick={() => { setDismissed(true); sessionStorage.setItem("disclaimer_dismissed", "true"); }}
        className="shrink-0 rounded-lg p-1 hover:bg-amber-200/50 transition-colors"
        aria-label="Dismiss"
      >
        <X className="size-4" />
      </button>
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
          <div className="flex flex-1 flex-col overflow-hidden">
            <Navbar />
            <main className="flex-1 overflow-auto bg-background">
              <PageShell>
                {children ?? <Outlet />}
              </PageShell>
            </main>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}

export default AppLayout;
