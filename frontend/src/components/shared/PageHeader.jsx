import { useLocation } from "react-router-dom";
import { cn } from "../../lib/utils";
import { ChevronRight } from "lucide-react";

const BREADCRUMB_MAP = {
  "": { label: "Home", parent: null },
  documents: { label: "Documents", parent: "" },
  compliance: { label: "Compliance", parent: "" },
  "compliance/review": { label: "Review Queue", parent: "compliance" },
  "compliance/details": { label: "Scan Results", parent: "compliance" },
  "auditor-ai": { label: "AI Assistant", parent: "" },
  admin: { label: "Admin", parent: "" },
  "admin/users": { label: "Organization Members", parent: "admin" },
  "admin/audit-logs": { label: "Audit Logs", parent: "admin" },
};

function getSegments(pathname) {
  const parts = pathname.replace(/^\/+/, "").split("/");
  const segments = [];
  for (let i = 0; i < parts.length; i++) {
    const key = parts.slice(0, i + 1).join("/");
    const entry = BREADCRUMB_MAP[key];
    if (entry) {
      segments.push({ label: entry.label, path: "/" + key });
    }
  }
  return segments;
}

export function PageHeader({ title, description, children, className }) {
  const location = useLocation();
  const segments = getSegments(location.pathname);

  return (
    <div className={cn("mb-6", className)}>
      {segments.length > 1 && (
        <nav className="flex items-center gap-1 text-xs text-muted-foreground mb-1.5">
          {segments.map((seg, i) => (
            <span key={seg.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3" />}
              <span className={i === segments.length - 1 ? "font-medium text-foreground" : ""}>{seg.label}</span>
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
          {description && (
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {children && (
          <div className="flex items-center gap-2 shrink-0">{children}</div>
        )}
      </div>
    </div>
  );
}
