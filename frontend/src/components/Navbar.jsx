import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Moon, Sun, LogOut, User as UserIcon, Settings, Command, ChevronDown, PanelLeft } from "lucide-react";
import { useSidebar } from "./ui/sidebar";
import { useAuth } from "../context/AuthContext";
import { Avatar, AvatarFallback } from "./ui/avatar";
import NotificationBell from "./NotificationBell";


function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof document === "undefined") return "light";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    setTheme(next);
  }

  return { theme, toggleTheme };
}

function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  if (!user) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 rounded-lg p-1 hover:bg-accent transition-colors"
      >
        <Avatar className="size-7">
          <AvatarFallback className="text-[10px] font-bold uppercase bg-muted text-foreground">
            {user.name?.charAt(0) || user.email?.charAt(0) || "?"}
          </AvatarFallback>
        </Avatar>
        <ChevronDown className="size-3 text-muted-foreground hidden sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[200px] overflow-hidden rounded-xl border bg-popover p-1 text-popover-foreground shadow-dropdown">
          <div className="px-2.5 py-2 border-b border-border">
            <p className="text-sm font-semibold text-foreground">{user.name || "User"}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
          <div className="pt-1">
            <button
              onClick={() => { navigate("/profile"); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-accent transition-colors"
            >
              <UserIcon className="size-4 text-muted-foreground" />
              Profile
            </button>
            {user.role === "admin" && (
              <button
                onClick={() => { navigate("/admin"); setOpen(false); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-accent transition-colors"
              >
                <Settings className="size-4 text-muted-foreground" />
                Admin Settings
              </button>
            )}
            <button
              onClick={() => { logout(); navigate("/login"); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors mt-0.5"
            >
              <LogOut className="size-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Navbar() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("nav-search-input")?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-11 items-center gap-2 border-b border-border bg-background px-3">
      <button
        onClick={toggleSidebar}
        className="inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
        title="Toggle sidebar"
      >
        <PanelLeft className="size-4" />
      </button>

      <div className="hidden sm:flex flex-1 items-center">
        <div className="relative max-w-sm w-full">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
          <input
            id="nav-search-input"
            type="text"
            placeholder="Search..."
            className="h-7.5 w-full rounded-md border border-input bg-muted/30 pl-8 pr-7 text-xs placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring/40 focus:border-transparent"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-4 select-none items-center gap-0.5 rounded border bg-muted px-1 font-mono text-[8px] font-medium text-muted-foreground/50">
            <Command className="size-2.5" />
            K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-0.5 ml-auto">
        <button
          onClick={toggleTheme}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </button>

        <NotificationBell />

        {user && <UserMenu />}
      </div>
    </header>
  );
}
