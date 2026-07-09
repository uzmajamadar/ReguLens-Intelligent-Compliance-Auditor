import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FileText,
  Shield,
  ClipboardCheck,
  BarChart3,
  ClipboardList,
  Users,
  Settings,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  ListChecks,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../hooks/use-toast";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { cn } from "../lib/utils";
import { useSidebar } from "./ui/sidebar";

function ActiveBar() {
  return <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-sidebar-foreground" />;
}

function NavItem({ to, icon: Icon, label }) {
  const { open } = useSidebar();

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "relative flex items-center gap-3 px-4 py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent/40 text-sidebar-foreground"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/20 hover:text-sidebar-foreground/90"
        )
      }
      title={!open ? label : undefined}
    >
      {({ isActive }) => (
        <>
          {isActive && open && <ActiveBar />}
          <Icon className="size-4 shrink-0" />
          {open && <span className="truncate">{label}</span>}
        </>
      )}
    </NavLink>
  );
}

function NavItemCompact({ to, icon: Icon, label }) {
  const { open } = useSidebar();

  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "relative flex items-center justify-center py-2 text-sm font-medium transition-colors",
          isActive
            ? "bg-sidebar-accent/40 text-sidebar-foreground"
            : "text-sidebar-foreground/60 hover:bg-sidebar-accent/20 hover:text-sidebar-foreground/90"
        )
      }
      title={!open ? label : undefined}
    >
      {({ isActive }) => (
        <>
          {isActive && <ActiveBar />}
          <Icon className="size-4 shrink-0 mx-auto" />
        </>
      )}
    </NavLink>
  );
}

const NAV_ITEMS = [
  { to: "/compliance", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/documents", icon: FileText, label: "Documents" },
  { to: "/my-tasks", icon: ListChecks, label: "My Tasks" },
  { to: "/compliance/details", icon: Shield, label: "Compliance" },
  { to: "/compliance/review", icon: ClipboardCheck, label: "Review Queue", requiresRole: "reviewer" },
  { to: "/reports", icon: BarChart3, label: "Reports" },
  { to: "/admin/audit-logs", icon: ClipboardList, label: "Audit Logs", adminOnly: true },
  { to: "/admin/users", icon: Users, label: "Organization", adminOnly: true },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export default function Sidebar() {
  const { open, toggleSidebar } = useSidebar();
  const { user, hasRole, logout } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  function handleLogout() {
    logout();
    toast({ title: "Signed out" });
    navigate("/login");
  }

  const Item = open ? NavItem : NavItemCompact;

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground transition-all duration-200 border-r border-sidebar-border",
        open ? "w-56" : "w-14"
      )}
    >
      <div className={cn("flex items-center px-4 pt-4 pb-3", !open && "justify-center px-0")}>
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
            <Shield className="size-3.5 text-sidebar-foreground" />
          </div>
          {open && (
            <span className="text-sm font-bold tracking-tight text-sidebar-foreground">ReguLens</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-0.5 pt-1">
        {NAV_ITEMS.map((item) => {
          if (item.adminOnly && !hasRole("admin")) return null;
          if (item.requiresRole === "reviewer" && !hasRole("admin", "compliance_manager", "reviewer")) return null;
          return <Item key={item.to} to={item.to} icon={item.icon} label={item.label} />;
        })}
      </div>

      <div className={cn("border-t border-sidebar-border mt-auto", !open && "flex flex-col items-center")}>
        {user && (
          <div className={cn("px-3 py-2.5", !open && "px-0")}>
            <NavLink
              to="/profile"
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-sidebar-accent/40 text-sidebar-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/20 hover:text-sidebar-foreground/90",
                  !open && "justify-center px-0"
                )
              }
              title={!open ? "Profile" : undefined}
            >
              <Avatar className="size-6 shrink-0">
                <AvatarFallback className="text-[9px] font-bold uppercase bg-sidebar-accent text-sidebar-foreground">
                  {user.name?.charAt(0) || user.email?.charAt(0) || "?"}
                </AvatarFallback>
              </Avatar>
              {open && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-sidebar-foreground truncate leading-none">
                    {user.name || user.email}
                  </p>
                  <p className="text-[10px] text-sidebar-foreground/40 truncate mt-px">
                    {user.role?.replace("_", " ")}
                  </p>
                </div>
              )}
            </NavLink>
          </div>
        )}

        <div className={cn("flex items-center px-3 pb-3", !open && "justify-center px-0")}>
          <button
            onClick={toggleSidebar}
            className="flex items-center justify-center rounded-lg p-1.5 text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/20 transition-colors"
            title={open ? "Collapse sidebar" : "Expand sidebar"}
          >
            {open ? <PanelLeftClose className="size-3.5" /> : <PanelLeft className="size-3.5" />}
          </button>
          {open && (
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground/70 transition-colors ml-auto"
              title="Sign out"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
