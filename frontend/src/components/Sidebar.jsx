import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { ChevronDown, Files, MessageSquare, Shield, ClipboardCheck, LogOut, FolderOpen, Users, ClipboardList, LayoutDashboard, Settings, Scan, AlertTriangle } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/use-toast";
import NotificationBell from "./NotificationBell";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Separator } from "./ui/separator";
import { cn } from "../lib/utils";
import * as Collapsible from "@radix-ui/react-collapsible";
import { useState } from "react";
import { useSidebar } from "./ui/sidebar";

function NavItem({ to, icon: Icon, label }) {
  const { open } = useSidebar();
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent text-sidebar-accent-foreground"
            : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
          !open && "justify-center px-2"
        )
      }
      title={!open ? label : undefined}
    >
      <Icon className="size-4 shrink-0" />
      {open && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

function NavSection({ title, children }) {
  const { open } = useSidebar();
  const [sectionOpen, setSectionOpen] = useState(true);
  if (!open) return <>{children}</>;
  return (
    <Collapsible.Root open={sectionOpen} onOpenChange={setSectionOpen}>
      <Collapsible.Trigger className="flex w-full items-center justify-between px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40 hover:text-sidebar-foreground/60 transition-colors">
        {title}
        <ChevronDown className={cn("size-3 transition-transform", sectionOpen && "rotate-180")} />
      </Collapsible.Trigger>
      <Collapsible.Content className="space-y-1 pt-1">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

function CollapsibleGroup({ icon: Icon, label, children, defaultOpen }) {
  const { open } = useSidebar();
  const [groupOpen, setGroupOpen] = useState(() => defaultOpen ?? false);

  if (!open) {
    return (
      <div className="space-y-1">
        {children}
      </div>
    );
  }

  return (
    <Collapsible.Root open={groupOpen} onOpenChange={setGroupOpen}>
      <Collapsible.Trigger className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors">
        <Icon className="size-4 shrink-0" />
        <span className="flex-1 text-left">{label}</span>
        <ChevronDown className={cn("size-3 transition-transform", groupOpen && "rotate-180")} />
      </Collapsible.Trigger>
      <Collapsible.Content className="ml-4 mt-1 space-y-1">
        {children}
      </Collapsible.Content>
    </Collapsible.Root>
  );
}

export default function Sidebar() {
  const { open } = useSidebar();
  const { user, hasRole, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();

  function handleLogout() {
    logout();
    toast({ title: "Signed out" });
    navigate("/login");
  }

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-300",
        open ? "w-60" : "w-16"
      )}
    >
      <div className={cn("flex items-center px-5 pt-6 pb-4", !open && "justify-center px-0")}>
        <div className="flex items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
            A
          </div>
          {open && <span className="text-base font-semibold tracking-tight">ReguLens</span>}
        </div>
        {open && <div className="ml-auto"><NotificationBell /></div>}
      </div>

      <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-2">
        <NavSection title={open ? "Navigation" : ""}>
          <NavItem to="/compliance" icon={LayoutDashboard} label="Dashboard" />

          <CollapsibleGroup icon={FolderOpen} label="Storage" defaultOpen={location.pathname.startsWith("/storage")}>
            <NavItem to="/storage" icon={Files} label="Files" />
          </CollapsibleGroup>

          <NavItem to="/compliance/details?tab=violations" icon={AlertTriangle} label="Violations" />

          <CollapsibleGroup icon={Shield} label="Compliance" defaultOpen={location.pathname.startsWith("/compliance") && !location.pathname.startsWith("/compliance/review") && !location.pathname.startsWith("/compliance/details")}>
            <NavItem to="/compliance/details" icon={Scan} label="Scan Results" />
          </CollapsibleGroup>

          {(hasRole("admin") || hasRole("compliance_manager") || hasRole("reviewer")) && (
            <NavItem to="/compliance/review" icon={ClipboardCheck} label="Review Queue" />
          )}

          <NavItem to="/auditor-ai" icon={MessageSquare} label="AI Assistant" />

          {hasRole("admin") && (
            <NavItem to="/admin/audit-logs" icon={ClipboardList} label="Audit Logs" />
          )}
        </NavSection>

        {open && hasRole("admin") && (
          <div className="pt-2">
            <NavSection title="Settings">
              <NavItem to="/admin" icon={LayoutDashboard} label="Admin Dashboard" />
              <NavItem to="/admin/users" icon={Users} label="User Management" />
              <NavItem to="/admin/audit-logs" icon={ClipboardList} label="Audit Logs" />
            </NavSection>
          </div>
        )}

        {!open && hasRole("admin") && (
          <NavItem to="/admin" icon={Settings} label="Settings" />
        )}
      </nav>

      {user && (
        <>
          <Separator className="mx-3 w-auto" />
          <div className={cn("px-4 py-3 space-y-2", !open && "px-2 flex flex-col items-center")}>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  !open && "justify-center px-2"
                )
              }
              title={!open ? "Profile" : undefined}
            >
              <div className={cn("flex items-center gap-3 flex-1 min-w-0", !open && "justify-center")}>
                <Avatar className="size-7 shrink-0">
                  <AvatarFallback className="text-[11px] font-bold uppercase bg-sidebar-primary/20 text-sidebar-primary">
                    {user.name?.charAt(0) || user.email?.charAt(0) || "?"}
                  </AvatarFallback>
                </Avatar>
                {open && (
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate">{user.name || user.email}</p>
                    <span className="inline-block px-1 py-0.5 text-[9px] font-medium uppercase tracking-wider rounded bg-sidebar-primary/20 text-sidebar-primary">
                      {user.role}
                    </span>
                  </div>
                )}
              </div>
            </NavLink>
            <button
              onClick={handleLogout}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors",
                open ? "w-full" : "justify-center w-auto"
              )}
              title={!open ? "Sign out" : undefined}
            >
              <LogOut className="size-3.5 shrink-0" />
              {open && "Sign out"}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
