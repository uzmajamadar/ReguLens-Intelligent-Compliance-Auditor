import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ClipboardList, CheckCircle2, AlertTriangle, ExternalLink, Upload } from "lucide-react";
import { listNotifications, markNotificationRead, markAllNotificationsRead } from "../lib/api";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./ui/dropdown-menu";

const TYPE_ICONS = {
  review_assigned: ClipboardList,
  review_approved: CheckCircle2,
  review_rejected: AlertTriangle,
  review_changes_requested: AlertTriangle,
  review_resolved: CheckCircle2,
  task_assigned: ClipboardList,
  task_orphaned: AlertTriangle,
  upload_complete: Upload,
  info: Bell,
};

const TYPE_COLORS = {
  review_assigned: "text-blue-600 bg-blue-50",
  review_approved: "text-green-600 bg-green-50",
  review_rejected: "text-red-600 bg-red-50",
  review_changes_requested: "text-amber-600 bg-amber-50",
  review_resolved: "text-green-600 bg-green-50",
  task_assigned: "text-blue-600 bg-blue-50",
  task_orphaned: "text-amber-600 bg-amber-50",
  upload_complete: "text-purple-600 bg-purple-50",
  info: "text-gray-600 bg-gray-50",
};

function parseMessage(msg) {
  if (!msg) return { lines: [] };
  return msg.split("\n").filter(Boolean).map((line) => {
    const [label, ...rest] = line.split(": ");
    return { label, value: rest.join(": ") };
  });
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  function load() {
    setLoading(true);
    listNotifications(true)
      .then(setNotifications)
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  async function handleMarkRead(id) {
    await markNotificationRead(id).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }

  async function handleOpenReview(id) {
    await markNotificationRead(id).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    navigate("/compliance/review");
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead().catch(() => {});
    setNotifications([]);
  }

  const unreadCount = notifications.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative p-1.5 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-red-500 rounded-full">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-96">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span className="text-sm font-semibold">Notifications</span>
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="text-xs text-primary hover:underline font-normal">
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-[30rem] overflow-y-auto">
          {loading && notifications.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No new notifications</p>
          ) : (
            notifications.map((n) => {
              const Icon = TYPE_ICONS[n.type] || Bell;
              const colorClass = TYPE_COLORS[n.type] || "text-muted-foreground bg-muted";
              const messageLines = parseMessage(n.message);

              return (
                <DropdownMenuItem
                  key={n.id}
                  className="flex flex-col items-stretch px-4 py-3 cursor-default hover:bg-accent/50"
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full ${colorClass}`}>
                      <Icon className="size-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{n.title}</p>
                      {messageLines.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {messageLines.map((line, i) => (
                            <p key={i} className="text-xs text-muted-foreground">
                              <span className="font-medium">{line.label}:</span>{" "}
                              <span>{line.value}</span>
                            </p>
                          ))}
                        </div>
                      )}
                      <p className="mt-1 text-[10px] text-muted-foreground/50">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  {n.type.startsWith("review_") && (
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={() => handleOpenReview(n.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                      >
                        <ExternalLink className="size-3" />
                        Open Review
                      </button>
                    </div>
                  )}
                </DropdownMenuItem>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
