import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CheckCircle2, Loader2, RefreshCw, FileText,
  Shield, User, Search, Calendar, Clock, Bell, FolderOpen,
  SlidersHorizontal, Bookmark, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  listReviewTasks, getReviewStats, approveReviewTask, startReviewTask,
  rejectReviewTask, needsFixReviewTask, retryReviewTask, listUsers,
  assignReviewTask, updateReviewTask, checkOverdue, resolveReviewTask,
} from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EmptyState } from "../components/shared/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";

const SEVERITY_CONFIG = {
  critical: { label: "Critical", variant: "critical" },
  high: { label: "High", variant: "high" },
  medium: { label: "Medium", variant: "medium" },
  low: { label: "Low", variant: "low" },
};

const SAVED_VIEWS = [
  { id: "all", label: "All Open Tasks", icon: FolderOpen },
  { id: "assigned_to_me", label: "Assigned to Me", icon: User },
  { id: "critical", label: "Critical Priority", icon: AlertTriangle },
  { id: "overdue", label: "Overdue", icon: Clock },
  { id: "needs_assignment", label: "Needs Assignment", icon: Bookmark },
];

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "pending", label: "Pending" },
  { value: "assigned", label: "Assigned" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "changes_requested", label: "Changes Requested" },
  { value: "resolved", label: "Resolved" },
  { value: "dismissed", label: "Dismissed" },
];

const SEVERITY_OPTIONS = [
  { value: "", label: "All Severities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const FW_COLORS = {
  GDPR: "text-indigo-600 bg-indigo-50 border-indigo-200",
  HR: "text-emerald-600 bg-emerald-50 border-emerald-200",
  HIPAA: "text-blue-600 bg-blue-50 border-blue-200",
  SOC2: "text-purple-600 bg-purple-50 border-purple-200",
  "PCI-DSS": "text-red-600 bg-red-50 border-red-200",
  ISO27001: "text-amber-600 bg-amber-50 border-amber-200",
};

function SkeletonCard() {
  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
      <div className="flex items-center gap-3 pt-1">
        <Skeleton className="h-6 w-6 rounded-full" />
        <div className="space-y-1 flex-1">
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-3 w-12" />
      </div>
    </div>
  );
}

export default function ReviewQueue() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [notes, setNotes] = useState({});
  const [users, setUsers] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [selectedAssignee, setSelectedAssignee] = useState({});
  const [selectedDueDate, setSelectedDueDate] = useState({});
  const [assignNote, setAssignNote] = useState({});
  const [showAllTasks, setShowAllTasks] = useState(true);
  const [activeView, setActiveView] = useState("all");
  const [searchParams, setSearchParams] = useSearchParams();
  const [overdueLoading, setOverdueLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const assignedTo = showAllTasks ? null : user?.id;
      const actualStatus = statusFilter || "";
      const [tasksData, statsData, allUsers] = await Promise.all([
        listReviewTasks(actualStatus, frameworkFilter || null, assignedTo),
        getReviewStats(),
        listUsers().catch(() => []),
      ]);
      let filtered = tasksData;
      if (severityFilter) filtered = filtered.filter((t) => t.violation?.severity === severityFilter);
      if (activeView === "assigned_to_me" && user?.id) filtered = filtered.filter((t) => t.assigned_to_id === user.id);
      if (activeView === "critical") filtered = filtered.filter((t) => t.violation?.severity === "critical");
      if (activeView === "overdue") {
        const now = new Date();
        filtered = filtered.filter((t) => t.due_date && new Date(t.due_date) < now && !["resolved", "dismissed"].includes(t.status));
      }
      setTasks(filtered);
      setStats(statsData);
      setUsers(allUsers || []);

      const taskId = searchParams.get("task_id");
      if (taskId) {
        const task = filtered.find((t) => t.id === Number(taskId));
        if (task) {
          setSelectedTask(task);
          setSearchParams({}, { replace: true });
        }
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [statusFilter, frameworkFilter, severityFilter, showAllTasks, user, activeView, searchParams, setSearchParams]);

  useEffect(() => {
    const runLoadData = async () => {
      await loadData();
    };
    runLoadData();
  }, [loadData]);

  async function handleApprove(taskId) {
    setActionLoading(taskId);
    try {
      await approveReviewTask(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "approved" } : t));
      setSelectedTask((prev) => prev?.id === taskId ? { ...prev, status: "approved" } : prev);
    } catch (err) { setError(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleStartReview(taskId) {
    setActionLoading(taskId);
    try {
      await startReviewTask(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "in_review" } : t));
      setSelectedTask((prev) => prev?.id === taskId ? { ...prev, status: "in_review" } : prev);
    } catch (err) { setError(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleReject(taskId) {
    setActionLoading(taskId);
    try {
      await rejectReviewTask(taskId, notes[taskId] || "");
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "dismissed" } : t));
      setSelectedTask((prev) => prev?.id === taskId ? { ...prev, status: "dismissed" } : prev);
    } catch (err) { setError(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleNeedsFix(taskId) {
    setActionLoading(taskId);
    try {
      await needsFixReviewTask(taskId, notes[taskId] || "");
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "changes_requested" } : t));
      setSelectedTask((prev) => prev?.id === taskId ? { ...prev, status: "changes_requested" } : prev);
    } catch (err) { setError(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleResolve(taskId) {
    setActionLoading(taskId);
    try {
      await resolveReviewTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedTask((prev) => prev?.id === taskId ? null : prev);
    } catch (err) { setError(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleRetry(taskId) {
    setActionLoading(taskId);
    try {
      await retryReviewTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      setSelectedTask((prev) => prev?.id === taskId ? null : prev);
    } catch (err) { setError(err.message); }
    finally { setActionLoading(null); }
  }

  async function handleSendOverdueReminders() {
    setOverdueLoading(true);
    try {
      const result = await checkOverdue();
      toast({ title: "Overdue Reminders Sent", description: `${result.notifications_sent} reminder(s) sent for ${result.overdue_count} overdue task(s).` });
    } catch (err) { toast({ title: "Failed to send reminders", description: err.message, variant: "destructive" }); }
    finally { setOverdueLoading(false); }
  }

  async function handleAssign(task) {
    setActionLoading(task.id);
    try {
      await updateReviewTask(task.id, { due_date: selectedDueDate[task.id] });
      await assignReviewTask(task.id, Number(selectedAssignee[task.id]), assignNote[task.id] || "");
      setSelectedAssignee((prev) => { const r = { ...prev }; delete r[task.id]; return r; });
      setSelectedDueDate((prev) => { const r = { ...prev }; delete r[task.id]; return r; });
      setAssignNote((prev) => { const r = { ...prev }; delete r[task.id]; return r; });
      await loadData();
    } catch { /* ignore */ }
    setActionLoading(null);
  }

  function handleSelectView(viewId) {
    setActiveView(viewId);
    if (viewId === "critical") setSeverityFilter("critical");
    else setSeverityFilter("");
    setSelectedTask(null);
  }

  function selectTask(task) {
    setSelectedTask((prev) => prev?.id === task.id ? null : task);
  }

  const statsCards = stats ? [
    { label: "Open", count: stats.pending || 0, color: "text-amber-600" },
    { label: "Assigned", count: stats.assigned || 0, color: "text-blue-600" },
    { label: "In Review", count: stats.in_review || 0, color: "text-amber-600" },
    { label: "Approved", count: (stats.approved || 0) + (stats.resolved || 0), color: "text-success" },
    { label: "Changes Requested", count: stats.changes_requested || 0, color: "text-destructive" },
  ] : [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* ── LEFT: Filter Panel ───────────────────────────────── */}
      <aside className="w-[240px] shrink-0 border-r border-border bg-muted/20 flex flex-col overflow-y-auto">
        <div className="p-3 border-b border-border">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" /> Views
          </h2>
          <nav className="space-y-0.5">
            {SAVED_VIEWS.map((view) => (
              <button
                key={view.id}
                onClick={() => handleSelectView(view.id)}
                className={cn(
                  "flex items-center gap-2.5 w-full rounded-md px-2.5 py-2 text-xs font-medium transition-colors",
                  activeView === view.id ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <view.icon className="size-3.5 shrink-0" />
                <span>{view.label}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="p-3 border-b border-border space-y-3">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-2">
            <Search className="size-3.5 text-muted-foreground" /> Filters
          </h2>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Status</label>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setActiveView("all"); }} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Severity</label>
            <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)} className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs">
              {SEVERITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1 block">Framework</label>
            <input type="text" value={frameworkFilter} onChange={(e) => setFrameworkFilter(e.target.value)} placeholder="Search frameworks..." className="w-full h-8 rounded-md border border-input bg-background px-2 text-xs" />
          </div>
        </div>

        <div className="p-3 space-y-2 mt-auto">
          {hasRole("admin", "compliance_manager") && (
            <button onClick={() => setShowAllTasks((prev) => !prev)} className={cn("flex items-center gap-2 w-full rounded-md px-2.5 py-2 text-xs font-medium transition-colors", showAllTasks ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")}>
              <User className="size-3.5" /> {showAllTasks ? "All Tasks" : "My Tasks"}
            </button>
          )}
          <button onClick={loadData} disabled={loading} className="flex items-center gap-2 w-full rounded-md px-2.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} /> Refresh
          </button>
          <button onClick={handleSendOverdueReminders} disabled={overdueLoading} className="flex items-center gap-2 w-full rounded-md px-2.5 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors">
            <Bell className={cn("size-3.5", overdueLoading && "animate-pulse")} /> Send Reminders
          </button>
        </div>
      </aside>

      {/* ── CENTER: Review List ───────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <div className="p-4 pb-0 shrink-0">
          <PageHeader title="Review Queue" description="Human-in-the-loop review for compliance findings" className="mb-0" />
          {statsCards.length > 0 && (
            <div className="flex items-center gap-3 mt-3 mb-0">
              {statsCards.map((card) => (
                <div key={card.label} className="flex items-center gap-1.5">
                  <span className={cn("text-lg font-bold", card.color)}>{card.count}</span>
                  <span className="text-xs text-muted-foreground">{card.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 mb-4">
              {error} <button onClick={loadData} className="ml-2 underline font-medium">Retry</button>
            </div>
          )}

          {loading ? (
            <div className="space-y-2 mt-3">
              <SkeletonCard /> <SkeletonCard /> <SkeletonCard />
            </div>
          ) : tasks.length === 0 ? (
            <div className="mt-8">
              <EmptyState icon={CheckCircle2} title="No review tasks" description="All AI evaluations completed successfully — no items need review." />
            </div>
          ) : (
            <div className="space-y-2 mt-3">
              <p className="text-xs text-muted-foreground mb-2">Showing <span className="font-medium text-foreground">{tasks.length}</span> task{tasks.length !== 1 ? "s" : ""}</p>
              {tasks.map((task) => {
                const severity = SEVERITY_CONFIG[task.violation?.severity] || SEVERITY_CONFIG.low;
                const fwColor = FW_COLORS[task.framework] || "text-gray-600 bg-gray-50 border-gray-200";
                const isOverdue = task.due_date && new Date(task.due_date) < new Date() && !["resolved", "dismissed"].includes(task.status);
                return (
                  <div
                    key={task.id}
                    onClick={() => selectTask(task)}
                    className={cn(
                      "rounded-xl border bg-card p-4 cursor-pointer transition-all hover:shadow-sm hover:border-foreground/20",
                      selectedTask?.id === task.id && "ring-2 ring-primary/20 border-primary/20"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
                            task.violation?.severity === "critical" ? "text-red-700 bg-red-50 border-red-200" :
                            task.violation?.severity === "high" ? "text-orange-700 bg-orange-50 border-orange-200" :
                            task.violation?.severity === "medium" ? "text-amber-700 bg-amber-50 border-amber-200" :
                            "text-blue-700 bg-blue-50 border-blue-200"
                          )}>
                            {severity.label}
                          </span>
                          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium", fwColor)}>
                            {task.framework}
                          </span>
                          {isOverdue && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                              <Clock className="size-2.5" /> Overdue
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm font-semibold text-foreground leading-snug">{task.rule_name}</h3>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <FileText className="size-3 shrink-0" />
                          <span className="truncate">{task.document_name || `Document #${task.document_id}`}</span>
                        </p>
                      </div>
                      <StatusBadge variant={
                        task.status === "in_review" ? "info" :
                        task.status === "approved" || task.status === "resolved" ? "success" :
                        task.status === "dismissed" ? "pending" :
                        task.status === "changes_requested" ? "warning" :
                        "warning"
                      }>
                        {task.status === "in_review" ? "In Review" :
                         task.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <div className="flex size-6 items-center justify-center rounded-full bg-muted shrink-0">
                          <User className="size-2.5 text-muted-foreground" />
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
                          {task.assigned_to || "Unassigned"}
                        </span>
                      </div>
                      {task.due_date && (
                        <div className="flex items-center gap-1 shrink-0">
                          <Calendar className="size-3 text-muted-foreground" />
                          <span className={cn("text-xs", isOverdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                            {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </span>
                        </div>
                      )}
                      {task.ai_confidence != null && (
                        <span className={cn(
                          "text-xs font-medium",
                          task.ai_confidence >= 70 ? "text-success" :
                          task.ai_confidence >= 40 ? "text-warning" : "text-destructive"
                        )}>
                          AI {task.ai_confidence}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* ── RIGHT: Investigation Panel ────────────────────────── */}
      {selectedTask && (
        <ReviewPanel
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onApprove={handleApprove}
          onReject={handleReject}
          onNeedsFix={handleNeedsFix}
          onResolve={handleResolve}
          onStartReview={handleStartReview}
          notes={notes}
          onNotesChange={setNotes}
          actionLoading={actionLoading}
          users={users}
          selectedAssignee={selectedAssignee}
          onAssigneeChange={setSelectedAssignee}
          selectedDueDate={selectedDueDate}
          onDueDateChange={setSelectedDueDate}
          assignNote={assignNote}
          onAssignNoteChange={setAssignNote}
          onAssign={handleAssign}
          onRetry={handleRetry}
        />
      )}
    </div>
  );
}

function TimelineEntry({ icon: Icon, label, sub, timestamp, active, last }) {
  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <div className={cn("flex size-5 items-center justify-center rounded-full border", active ? "border-primary bg-primary/10" : "border-border bg-muted")}>
          <Icon className={cn("size-2.5", active ? "text-primary" : "text-muted-foreground")} />
        </div>
        {!last && <div className="w-px flex-1 bg-border my-0.5" />}
      </div>
      <div className={cn("pb-3", last && "pb-0")}>
        <p className="text-xs font-medium text-foreground">{label}</p>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
        {timestamp && <p className="text-[10px] text-muted-foreground/60">{timestamp}</p>}
      </div>
    </div>
  );
}

function SectionBlock({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}

function ReviewPanel({
  task, onClose, onApprove, onReject, onNeedsFix, onResolve, onStartReview,
  notes, onNotesChange, actionLoading, users,
  selectedAssignee, onAssigneeChange, selectedDueDate, onDueDateChange,
  assignNote, onAssignNoteChange, onAssign, onRetry,
}) {
  const isActionLoading = actionLoading === task?.id;
  if (!task) return null;

  const severity = SEVERITY_CONFIG[task.violation?.severity] || SEVERITY_CONFIG.low;
  const isInReview = task.status === "in_review";
  const isAssigned = task.status === "assigned";
  const isApproved = task.status === "approved";
  const isResolved = task.status === "resolved";
  const isDismissed = task.status === "dismissed";
  const isNeedsFix = task.status === "changes_requested";
  const isPending = task.status === "pending";
  const canReview = isInReview;
  const canStartReview = isAssigned;
  const canResolve = isApproved;
  const canAssign = !task.assigned_to && isPending;

  const sourceChunks = (() => {
    try {
      if (task.violation?.source_chunks) {
        return typeof task.violation.source_chunks === "string" ? JSON.parse(task.violation.source_chunks) : task.violation.source_chunks;
      }
    } catch {}
    return null;
  })();

  return (
    <aside className="w-[440px] shrink-0 border-l border-border bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{task.rule_name}</p>
          <p className="text-xs text-muted-foreground truncate mt-px">{task.document_name || `Document #${task.document_id}`}</p>
        </div>
        <button onClick={onClose} className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ml-2">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
      </div>

      {/* Badges */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border shrink-0 flex-wrap">
        <StatusBadge variant={severity.variant}>{severity.label}</StatusBadge>
        <span className={cn("inline-flex items-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium",
          task.framework === "GDPR" ? "text-indigo-600 bg-indigo-50 border-indigo-200" :
          task.framework === "HIPAA" ? "text-blue-600 bg-blue-50 border-blue-200" :
          task.framework === "SOC2" ? "text-purple-600 bg-purple-50 border-purple-200" :
          "text-gray-600 bg-gray-50 border-gray-200"
        )}>
          {task.framework}
        </span>
        <StatusBadge variant={
          isInReview ? "info" : isApproved || isResolved ? "success" : isDismissed ? "pending" : isNeedsFix ? "warning" : "warning"
        }>
          {isInReview ? "In Review" : task.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
        </StatusBadge>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* AI Analysis */}
        <SectionBlock title="AI Analysis">
          <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex size-12 items-center justify-center rounded-full border-2 text-sm font-bold shrink-0",
                task.ai_confidence >= 70 ? "border-success/30 bg-success/10 text-success" :
                task.ai_confidence >= 40 ? "border-warning/30 bg-warning/10 text-warning" :
                "border-destructive/30 bg-destructive/10 text-destructive"
              )}>
                {task.ai_confidence ?? "?"}%
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {task.ai_confidence >= 70 ? "AI is confident in this finding. Quick human review recommended."
                 : task.ai_confidence >= 40 ? "AI confidence is moderate. Please review carefully."
                 : "AI confidence is low. Thorough human review required."}
              </p>
            </div>
            {task.violation?.reasoning && (
              <div className="rounded bg-muted/30 p-2">
                <p className="text-[11px] text-foreground/80">{task.violation.reasoning}</p>
              </div>
            )}
          </div>
        </SectionBlock>

        {/* Evidence */}
        {sourceChunks && sourceChunks.length > 0 && (
          <SectionBlock title="Evidence">
            <div className="space-y-2">
              {sourceChunks.map((chunk, ci) => (
                <div key={ci} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-medium text-muted-foreground">Chunk #{chunk.chunk_index}</span>
                    {chunk.page_numbers?.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">— Page{chunk.page_numbers.length > 1 ? "s" : ""} {chunk.page_numbers.join(", ")}</span>
                    )}
                  </div>
                  <p className="text-xs text-foreground/70 font-mono leading-relaxed line-clamp-4">{chunk.text_snippet}</p>
                </div>
              ))}
            </div>
          </SectionBlock>
        )}

        {/* Matched Text / Excerpt */}
        {task.violation?.excerpt && (
          <SectionBlock title="Matched Text">
            <div className="rounded-lg bg-muted/20 border border-border p-3">
              <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">{task.violation.excerpt}</p>
            </div>
          </SectionBlock>
        )}

        {/* Page Number */}
        {task.violation?.page_number != null && (
          <SectionBlock title="Page Number">
            <div className="rounded-lg border border-border bg-muted/20 p-3">
              <p className="text-sm font-medium text-foreground">Page {task.violation.page_number}</p>
            </div>
          </SectionBlock>
        )}

        {/* Recommendation */}
        {task.violation?.recommendation && (
          <SectionBlock title="Recommendation">
            <div className="rounded-lg border border-success/20 bg-success/5 p-3">
              <p className="text-xs text-foreground/80">{task.violation.recommendation}</p>
            </div>
          </SectionBlock>
        )}

        {/* Reviewer Notes */}
        <SectionBlock title="Reviewer Notes">
          <textarea
            value={notes[task.id] || ""}
            onChange={(e) => onNotesChange((prev) => ({ ...prev, [task.id]: e.target.value }))}
            placeholder="Add review notes..."
            rows={3}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
        </SectionBlock>

        {/* Timeline */}
        <SectionBlock title="Timeline">
          <div className="mt-1">
            <TimelineEntry icon={FileText} label="Task Created" sub="AI evaluation completed" timestamp={task.created_at ? new Date(task.created_at).toLocaleString() : "—"} active last={!task.assigned_to && !isInReview && !isApproved && !isNeedsFix && !isResolved && !isDismissed} />
            {task.assigned_to && (
              <TimelineEntry icon={User} label="Assigned" sub={`To ${task.assigned_to}`} timestamp={task.updated_at ? new Date(task.updated_at).toLocaleString() : "—"} active={isAssigned} last={!isInReview && !isApproved && !isNeedsFix && !isResolved && !isDismissed} />
            )}
            {(isInReview || isApproved || isNeedsFix || isResolved || isDismissed) && (
              <TimelineEntry icon={Eye} label="Review Started" sub="Human review" timestamp="—" active={isInReview} last={!isApproved && !isNeedsFix && !isResolved && !isDismissed} />
            )}
            {(isApproved || isResolved) && (
              <TimelineEntry icon={CheckCircle2} label={isResolved ? "Resolved" : "Approved"} sub="Finding accepted" timestamp="—" active={isApproved} last={!isResolved} />
            )}
            {isResolved && (
              <TimelineEntry icon={CheckCircle2} label="Resolved" sub="Finding resolved" timestamp="—" active last />
            )}
            {isNeedsFix && (
              <TimelineEntry icon={AlertTriangle} label="Changes Requested" sub="Issues identified" timestamp="—" active={isNeedsFix} last />
            )}
            {isDismissed && (
              <TimelineEntry icon={ThumbsDown} label="Dismissed" sub="Finding dismissed" timestamp="—" active last />
            )}
          </div>
        </SectionBlock>
      </div>

      {/* Actions Footer */}
      <div className="border-t border-border p-3 shrink-0 space-y-2">
        {canAssign && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <select value={selectedAssignee[task.id] || ""} onChange={(e) => onAssigneeChange((prev) => ({ ...prev, [task.id]: e.target.value }))} className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs">
                <option value="">Assign to...</option>
                {users.map((u) => (<option key={u.id} value={String(u.id)}>{u.name}</option>))}
              </select>
              <input type="date" value={selectedDueDate[task.id] || ""} onChange={(e) => onDueDateChange((prev) => ({ ...prev, [task.id]: e.target.value }))} className="w-32 rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
            </div>
            <input type="text" value={assignNote[task.id] || ""} onChange={(e) => onAssignNoteChange((prev) => ({ ...prev, [task.id]: e.target.value }))} placeholder="Note..." className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs" />
            <Button size="sm" variant="default" className="w-full h-8 text-xs" disabled={!selectedAssignee[task.id] || !selectedDueDate[task.id] || isActionLoading} onClick={() => onAssign(task)}>
              {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : null}
              {isActionLoading ? "Assigning..." : "Assign & Set Due Date"}
            </Button>
          </div>
        )}

        {canStartReview && (
          <Button size="sm" variant="default" className="w-full h-8 text-xs" disabled={isActionLoading} onClick={() => onStartReview(task.id)}>
            {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : null}
            {isActionLoading ? "Starting..." : "Start Review"}
          </Button>
        )}

        {canReview && (
          <div className="space-y-2">
            <Button size="sm" variant="default" className="w-full h-8 text-xs bg-success hover:bg-success/90" disabled={isActionLoading} onClick={() => onApprove(task.id)}>
              {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              {isActionLoading ? "Approving..." : "Approve"}
            </Button>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-warning border-warning/30 hover:bg-warning/10" disabled={isActionLoading} onClick={() => onNeedsFix(task.id)}>
                {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : <AlertTriangle className="size-3.5" />}
                Needs Fix
              </Button>
              <Button size="sm" variant="outline" className="flex-1 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" disabled={isActionLoading} onClick={() => onReject(task.id)}>
                {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : null}
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {canResolve && (
          <Button size="sm" variant="default" className="w-full h-8 text-xs" disabled={isActionLoading} onClick={() => onResolve(task.id)}>
            {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            {isActionLoading ? "Resolving..." : "Resolve Finding"}
          </Button>
        )}

        {(isResolved || isDismissed || isNeedsFix || (isPending && task.assigned_to)) && !canAssign && !canStartReview && !canReview && !canResolve && (
          <p className="text-xs text-muted-foreground text-center py-2 italic">
            {isResolved ? "Finding resolved." : isDismissed ? "Finding dismissed." : "No actions available."}
          </p>
        )}
      </div>
    </aside>
  );
}

const ThumbsDown = ({ className }) => (
  <svg className={className} width="14" height="14" viewBox="0 0 14 14" fill="none">
    <path d="M2.5 8.5H4.5V2.5H2.5C2.22386 2.5 2 2.72386 2 3V8C2 8.27614 2.22386 8.5 2.5 8.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4.5 8.5L6.5 12.5C7.05228 12.5 7.5 12.0523 7.5 11.5V9.5H10.9714C11.3219 9.5 11.6182 9.26207 11.6914 8.91987L12.4697 5.41987C12.5716 4.95148 12.2102 4.5 11.7497 4.5H8.5V2C8.5 1.44772 8.05228 1 7.5 1H5.66667" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);
