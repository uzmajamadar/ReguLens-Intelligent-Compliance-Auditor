import { useState, useEffect, useMemo } from "react";
import { listAuditLogs, listUsers } from "../lib/api";
import { cn } from "../lib/utils";
import { useToast } from "../hooks/use-toast";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EmptyState } from "../components/shared/EmptyState";
import { Skeleton } from "../components/ui/skeleton";
import { Button } from "../components/ui/button";
import {
  Search, X, RotateCw, Loader2, UserPlus, UserX, UserCheck,
  FileText, Shield, ClipboardCheck, CheckCircle2, AlertTriangle,
  LogIn, UserCog, Trash2, BookOpen, Workflow, Settings,
  Clock, XCircle, Play, RefreshCw,
} from "lucide-react";

const Edit3 = ({ className }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M10.5 1.5L12.5 3.5L4.5 11.5L1.5 12.5L2.5 9.5L10.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8.5 3.5L10.5 5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
  </svg>
);

const ACTION_CONFIG = {
  register: { icon: UserPlus, label: "Registered", severity: "info", color: "text-green-600 bg-green-50 border-green-200" },
  login: { icon: LogIn, label: "Logged In", severity: "info", color: "text-blue-600 bg-blue-50 border-blue-200" },
  password_reset_request: { icon: RefreshCw, label: "Password Reset Requested", severity: "info", color: "text-amber-600 bg-amber-50 border-amber-200" },
  password_reset: { icon: RefreshCw, label: "Password Reset", severity: "info", color: "text-amber-600 bg-amber-50 border-amber-200" },
  profile_update: { icon: UserCog, label: "Profile Updated", severity: "info", color: "text-blue-600 bg-blue-50 border-blue-200" },
  upload: { icon: FileText, label: "Document Uploaded", severity: "success", color: "text-indigo-600 bg-indigo-50 border-indigo-200" },
  delete: { icon: Trash2, label: "Document Deleted", severity: "warning", color: "text-red-600 bg-red-50 border-red-200" },
  update_frameworks: { icon: Shield, label: "Frameworks Updated", severity: "info", color: "text-purple-600 bg-purple-50 border-purple-200" },
  user_create: { icon: UserPlus, label: "User Created", severity: "success", color: "text-green-600 bg-green-50 border-green-200" },
  user_update: { icon: UserCheck, label: "User Updated", severity: "info", color: "text-blue-600 bg-blue-50 border-blue-200" },
  user_delete: { icon: UserX, label: "User Deactivated", severity: "warning", color: "text-red-600 bg-red-50 border-red-200" },
  review_start: { icon: Play, label: "Review Started", severity: "info", color: "text-amber-600 bg-amber-50 border-amber-200" },
  review_approve: { icon: CheckCircle2, label: "Review Approved", severity: "success", color: "text-green-600 bg-green-50 border-green-200" },
  review_resolve: { icon: CheckCircle2, label: "Review Resolved", severity: "success", color: "text-green-600 bg-green-50 border-green-200" },
  review_dismiss: { icon: XCircle, label: "Review Dismissed", severity: "info", color: "text-gray-600 bg-gray-50 border-gray-200" },
  review_needs_fix: { icon: AlertTriangle, label: "Review Needs Fix", severity: "warning", color: "text-amber-600 bg-amber-50 border-amber-200" },
  review_auto_resolve: { icon: CheckCircle2, label: "Review Auto-Resolved", severity: "success", color: "text-green-600 bg-green-50 border-green-200" },
  review_assign: { icon: ClipboardCheck, label: "Review Assigned", severity: "info", color: "text-blue-600 bg-blue-50 border-blue-200" },
  remediation_accept: { icon: CheckCircle2, label: "Remediation Accepted", severity: "success", color: "text-green-600 bg-green-50 border-green-200" },
  remediation_reject: { icon: XCircle, label: "Remediation Rejected", severity: "warning", color: "text-amber-600 bg-amber-50 border-amber-200" },
  remediation_edit: { icon: Edit3, label: "Remediation Edited", severity: "info", color: "text-blue-600 bg-blue-50 border-blue-200" },
  workflow_create: { icon: Workflow, label: "Workflow Created", severity: "success", color: "text-purple-600 bg-purple-50 border-purple-200" },
  workflow_step_add: { icon: Workflow, label: "Workflow Step Added", severity: "info", color: "text-purple-600 bg-purple-50 border-purple-200" },
  workflow_transition_add: { icon: Workflow, label: "Workflow Transition Added", severity: "info", color: "text-purple-600 bg-purple-50 border-purple-200" },
  workflow_task_complete: { icon: CheckCircle2, label: "Workflow Task Complete", severity: "success", color: "text-green-600 bg-green-50 border-green-200" },
  workflow_instance_create: { icon: Workflow, label: "Workflow Created", severity: "success", color: "text-purple-600 bg-purple-50 border-purple-200" },
  org_update: { icon: Settings, label: "Organization Updated", severity: "info", color: "text-blue-600 bg-blue-50 border-blue-200" },
};

const AVATAR_COLORS = [
  "bg-blue-500", "bg-purple-500", "bg-emerald-500", "bg-amber-500",
  "bg-rose-500", "bg-cyan-500", "bg-violet-500", "bg-teal-500",
];

function getActionConfig(action) {
  return ACTION_CONFIG[action] || {
    icon: BookOpen, label: action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    severity: "info", color: "text-muted-foreground bg-muted border-border",
  };
}

function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
}

function getAvatarColor(id) {
  return AVATAR_COLORS[(id ?? 0) % AVATAR_COLORS.length];
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return "";
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now - d;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatDateHeader(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const logDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  if (logDate.getTime() === today.getTime()) return "Today";
  if (logDate.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function extractDocumentName(log) {
  if (log.resource_type === "document" && log.details) {
    const match = log.details.match(/'([^']+)'/);
    if (match) return match[1];
  }
  if (log.details && log.details.includes("'")) {
    const match = log.details.match(/'([^']+)'/);
    if (match) return match[1];
  }
  return null;
}

function getSeverityVariant(severity) {
  switch (severity) {
    case "success": return "success";
    case "warning": return "warning";
    default: return "info";
  }
}

function groupByDate(logs) {
  const groups = {};
  for (const log of logs) {
    const dateKey = log.created_at ? new Date(log.created_at).toDateString() : "unknown";
    if (!groups[dateKey]) groups[dateKey] = [];
    groups[dateKey].push(log);
  }
  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === "unknown") return 1;
    if (b === "unknown") return -1;
    return new Date(b) - new Date(a);
  });
  return sortedKeys.map((key) => ({ dateKey: key, label: formatDateHeader(key), logs: groups[key] }));
}

function SkeletonEntry() {
  return (
    <div className="flex gap-3 pl-1">
      <div className="flex flex-col items-center">
        <Skeleton className="size-8 rounded-full" />
        <div className="w-px flex-1 bg-border mt-1" />
      </div>
      <div className="flex-1 pb-6 space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-5 w-20 rounded-full" />
        </div>
        <Skeleton className="h-3.5 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [docFilter, setDocFilter] = useState("");
  const [fwFilter, setFwFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    setLoading(true);
    Promise.all([
      listAuditLogs({ limit: 200, offset: 0, action: actionFilter || undefined }),
      listUsers().catch(() => []),
    ])
      .then(([logsData]) => {
        setAllLogs(logsData);
      })
      .catch(() => toast({ title: "Failed to load audit logs", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [actionFilter]);

  const actionTypes = useMemo(() => {
    return [...new Set(allLogs.map((l) => l.action))].sort();
  }, [allLogs]);

  const filteredLogs = useMemo(() => {
    let result = [...allLogs];

    if (userFilter) {
      const q = userFilter.toLowerCase();
      result = result.filter((l) => (l.user_email || "").toLowerCase().includes(q));
    }
    if (docFilter) {
      const q = docFilter.toLowerCase();
      result = result.filter((l) => {
        const docName = extractDocumentName(l);
        return (docName && docName.toLowerCase().includes(q)) || (l.details || "").toLowerCase().includes(q);
      });
    }
    if (fwFilter) {
      const q = fwFilter.toLowerCase();
      result = result.filter((l) => (l.details || "").toLowerCase().includes(q));
    }
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((l) => l.created_at && new Date(l.created_at) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((l) => l.created_at && new Date(l.created_at) <= to);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((l) =>
        (l.user_email || "").toLowerCase().includes(q) ||
        (l.action || "").toLowerCase().includes(q) ||
        (l.details || "").toLowerCase().includes(q) ||
        (l.resource_type || "").toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return result;
  }, [allLogs, userFilter, docFilter, fwFilter, dateFrom, dateTo, searchQuery]);

  const dateGroups = useMemo(() => groupByDate(filteredLogs), [filteredLogs]);

  function clearFilters() {
    setUserFilter("");
    setDocFilter("");
    setFwFilter("");
    setDateFrom("");
    setDateTo("");
    setSearchQuery("");
    setActionFilter("");
  }

  const hasFilters = userFilter || docFilter || fwFilter || dateFrom || dateTo || searchQuery || actionFilter;

  return (
    <div className="max-w-6xl mx-auto w-full px-6 py-6 space-y-6">
      <PageHeader title="Audit Logs" description="Track all activity across your organization." />

      {/* ── Filter Bar ──────────────────────────────────────────────── */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Action</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">All Actions</option>
              {actionTypes.map((a) => {
                const cfg = getActionConfig(a);
                return <option key={a} value={a}>{cfg.label}</option>;
              })}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">User</label>
            <input type="text" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}
              placeholder="Search by email..."
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Document</label>
            <input type="text" value={docFilter} onChange={(e) => setDocFilter(e.target.value)}
              placeholder="Search document..."
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Framework</label>
            <input type="text" value={fwFilter} onChange={(e) => setFwFilter(e.target.value)}
              placeholder="e.g. GDPR, HIPAA..."
              className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">From</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
            <span className="text-muted-foreground text-xs mt-5">—</span>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">To</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            </div>
          </div>
          <div className="flex-1 min-w-[180px] relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all fields..."
              className="w-full h-8 pl-8 pr-3 rounded-md border border-input bg-background text-xs placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          {hasFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 h-8 px-3 text-xs font-medium text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors mt-4">
              <X className="size-3" />
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Results Info ─────────────────────────────────────────── */}
      {!loading && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Showing <span className="font-medium text-foreground">{filteredLogs.length}</span> event{filteredLogs.length !== 1 ? "s" : ""}
            {!hasFilters && allLogs.length >= 200 && (
              <span className="text-muted-foreground/60"> (latest 200 shown)</span>
            )}
          </p>
          <button onClick={() => setActionFilter((prev) => prev)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <RotateCw className="size-3" />
            Refresh
          </button>
        </div>
      )}

      {/* ── Loading State ───────────────────────────────────────────── */}
      {loading ? (
        <div className="space-y-1">
          <SkeletonEntry />
          <SkeletonEntry />
          <SkeletonEntry />
          <SkeletonEntry />
          <SkeletonEntry />
        </div>
      ) : dateGroups.length === 0 ? (
        <div className="py-12">
          <EmptyState
            icon={Search}
            title="No events found"
            description={hasFilters ? "Try adjusting your filters." : "No audit logs recorded yet."}
          />
        </div>
      ) : (
        <div className="space-y-1">
          {dateGroups.map((group) => (
            <div key={group.dateKey}>
              {/* Date Header */}
              <div className="flex items-center gap-3 py-3">
                <div className="flex items-center gap-2">
                  <Clock className="size-3.5 text-muted-foreground" />
                  <h3 className="text-xs font-semibold text-foreground">{group.label}</h3>
                </div>
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] text-muted-foreground/60">{group.logs.length} event{group.logs.length !== 1 ? "s" : ""}</span>
              </div>

              {/* Events */}
              <div className="space-y-0">
                {group.logs.map((log, idx) => {
                  const cfg = getActionConfig(log.action);
                  const Icon = cfg.icon;
                  const isLast = idx === group.logs.length - 1;
                  const docName = extractDocumentName(log);
                  return (
                    <div key={log.id} className="flex gap-3">
                      {/* Timeline Node */}
                      <div className="flex flex-col items-center shrink-0">
                        <div className="flex size-8 items-center justify-center rounded-full border-2 border-border bg-card">
                          <Icon className="size-3.5 text-muted-foreground" />
                        </div>
                        {!isLast && <div className="w-px flex-1 bg-border my-0.5" />}
                      </div>

                      {/* Event Card */}
                      <div className={cn("flex-1 min-w-0 pb-5", isLast && "pb-0")}>
                        <div className="rounded-lg border bg-card p-3 hover:shadow-sm hover:border-foreground/10 transition-all">
                          <div className="flex items-start gap-2.5">
                            {/* User Avatar */}
                            <div className={cn("flex size-7 items-center justify-center rounded-full text-white text-[10px] font-semibold shrink-0 mt-0.5", getAvatarColor(log.user_id))}>
                              {getInitials(log.user_email)}
                            </div>

                            <div className="flex-1 min-w-0 space-y-1.5">
                              {/* Top row: User + Action Badge + Timestamp */}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-foreground">
                                  {log.user_email || `User #${log.user_id}`}
                                </span>
                                <StatusBadge variant={getSeverityVariant(cfg.severity)}>
                                  {cfg.label}
                                </StatusBadge>
                                <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                                  {formatRelativeTime(log.created_at)}
                                </span>
                              </div>

                              {/* Document name */}
                              {docName && (
                                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                  <FileText className="size-3 shrink-0" />
                                  <span className="truncate">{docName}</span>
                                </p>
                              )}

                              {/* Details */}
                              {log.details && !docName && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                  {log.details}
                                </p>
                              )}

                              {/* Bottom row: extra meta */}
                              <div className="flex items-center gap-3 pt-0.5">
                                {log.resource_type && log.resource_id && (
                                  <span className="text-[10px] text-muted-foreground/50">
                                    {log.resource_type} #{log.resource_id}
                                  </span>
                                )}
                                {log.ip_address && (
                                  <span className="text-[10px] text-muted-foreground/50">
                                    {log.ip_address}
                                  </span>
                                )}
                                <span className="text-[10px] text-muted-foreground/50 ml-auto">
                                  {log.created_at ? new Date(log.created_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : ""}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
