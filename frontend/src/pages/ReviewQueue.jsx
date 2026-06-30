import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  FileText,
  Shield,
  User,
  ThumbsUp,
  ThumbsDown,
  Search,
  Calendar,
  Bell,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "@/components/ui/table";
import {
  listReviewTasks,
  getReviewStats,
  approveReviewTask,
  startReviewTask,
  rejectReviewTask,
  needsFixReviewTask,
  retryReviewTask,
  listUsers,
  assignReviewTask,
  setReviewDueDate,
  checkOverdue,
  resolveReviewTask,
} from "../lib/api";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "../context/AuthContext";
import ReviewDrawer from "@/components/ReviewDrawer";

const REASON_LABELS = {
  low_confidence: "Low Confidence — needs human review",
  evaluation_error: "AI evaluation failed unexpectedly",
  parse_error: "AI returned unparseable response",
  timeout: "AI evaluation timed out",
  rate_limited: "AI provider rate limit hit — auto-retrying",
  model_unavailable: "Model error — click Retry to re-evaluate",
};

const SEVERITY_COLORS = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

const REASON_COLORS = {
  low_confidence: "bg-amber-50 text-amber-700 border-amber-200",
  evaluation_error: "bg-red-50 text-red-700 border-red-200",
  parse_error: "bg-orange-50 text-orange-700 border-orange-200",
  timeout: "bg-purple-50 text-purple-700 border-purple-200",
  rate_limited: "bg-blue-50 text-blue-700 border-blue-200",
  model_unavailable: "bg-gray-50 text-gray-700 border-gray-200",
};

const STATUS_DISPLAY = {
  pending_review: { label: "Open", color: "bg-amber-100 text-amber-700 border-amber-200" },
  pending_assignment: { label: "Pending Assignment", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  assigned: { label: "Assigned", color: "bg-blue-100 text-blue-700 border-blue-200" },
  in_review: { label: "In Review", color: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "Approved", color: "bg-green-100 text-green-700 border-green-200" },
  waiting_for_fix: { label: "Waiting for Fix", color: "bg-purple-100 text-purple-700 border-purple-200" },
  resolved: { label: "Resolved", color: "bg-gray-100 text-gray-600 border-gray-200" },
  dismissed: { label: "Dismissed", color: "bg-gray-100 text-gray-600 border-gray-200" },
  needs_fix: { label: "Needs Fix", color: "bg-red-100 text-red-700 border-red-200" },
};

const FW_COLORS = {
  GDPR: "bg-indigo-50 text-indigo-700 border-indigo-200",
  HR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  HIPAA: "bg-blue-50 text-blue-700 border-blue-200",
  SOC2: "bg-purple-50 text-purple-700 border-purple-200",
  "PCI-DSS": "bg-red-50 text-red-700 border-red-200",
  ISO27001: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function ReviewQueue() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, hasRole } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [frameworkFilter, setFrameworkFilter] = useState("");
  const [notes, setNotes] = useState({});
  const [notesOpen, setNotesOpen] = useState(null);
  const [users, setUsers] = useState([]);
  const [reviewDrawerTask, setReviewDrawerTask] = useState(null);
  const [selectedAssignee, setSelectedAssignee] = useState({});
  const [selectedDueDate, setSelectedDueDate] = useState({});
  const [assignNote, setAssignNote] = useState({});
  const [showAllTasks, setShowAllTasks] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const taskId = searchParams.get("task_id");
    if (!taskId || !tasks.length) return;
    const task = tasks.find((t) => t.id === Number(taskId));
    if (task) {
      setReviewDrawerTask(task);
      setSearchParams({}, { replace: true });
    }
  }, [tasks, searchParams, setSearchParams]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const assignedTo = showAllTasks ? null : user?.id;
      const [tasksData, statsData, allUsers] = await Promise.all([
        listReviewTasks(statusFilter, frameworkFilter || null, assignedTo),
        getReviewStats(),
        listUsers().catch(() => []),
      ]);
      setTasks(tasksData);
      setStats(statsData);
      setUsers(allUsers || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, frameworkFilter, showAllTasks, user?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleApprove(taskId) {
    setActionLoading(taskId);
    try {
      await approveReviewTask(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "approved" } : t));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleStartReview(taskId) {
    setActionLoading(taskId);
    try {
      await startReviewTask(taskId);
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "in_review" } : t));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  function handleOpenReview(task) {
    setReviewDrawerTask(task);
  }

  async function handleReject(taskId, reason = "") {
    setActionLoading(taskId);
    try {
      const fullNotes = reason
        ? `[${reason}] ${notes[taskId] || ""}`.trim()
        : notes[taskId] || "";
      await rejectReviewTask(taskId, fullNotes);
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "dismissed" } : t));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleNeedsFix(taskId) {
    setActionLoading(taskId);
    try {
      await needsFixReviewTask(taskId, notes[taskId] || "");
      setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, status: "needs_fix" } : t));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleRetry(taskId) {
    setActionLoading(taskId);
    try {
      await retryReviewTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleResolve(taskId) {
    setActionLoading(taskId);
    try {
      await resolveReviewTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionLoading(null);
    }
  }

  const [overdueLoading, setOverdueLoading] = useState(false);

  async function handleSendOverdueReminders() {
    setOverdueLoading(true);
    try {
      const result = await checkOverdue();
      toast({
        title: "Overdue Reminders Sent",
        description: `${result.notifications_sent} reminder(s) sent for ${result.overdue_count} overdue task(s).`,
      });
    } catch (err) {
      toast({ title: "Failed to send reminders", description: err.message, variant: "destructive" });
    } finally {
      setOverdueLoading(false);
    }
  }

  const summaryCards = stats
    ? [
        { label: "Pending Review", count: stats.pending_review, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "Pending Assign", count: stats.pending_assignment, color: "text-indigo-600", bg: "bg-indigo-50" },
        { label: "In Review", count: stats.in_review, color: "text-amber-600", bg: "bg-amber-50" },
        { label: "Approved", count: stats.approved, color: "text-green-600", bg: "bg-green-50" },
        { label: "Waiting for Fix", count: stats.waiting_for_fix, color: "text-purple-600", bg: "bg-purple-50" },
      ]
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Human-in-the-loop review for low-confidence and failed AI evaluations
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={loadData} variant="outline" size="sm" disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={() => navigate("/compliance")} variant="outline" size="sm">
            <Shield className="size-4" />
            Compliance
          </Button>
          <Button onClick={handleSendOverdueReminders} variant="outline" size="sm" disabled={overdueLoading}>
            <Bell className={`size-4 ${overdueLoading ? "animate-pulse" : ""}`} />
            Remind Overdue
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {summaryCards.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {summaryCards.map((card) => (
            <div key={card.label} className={`rounded-lg border border-border ${card.bg} p-4`}>
              <p className={`text-2xl font-bold ${card.color}`}>{card.count}</p>
              <p className="text-xs text-muted-foreground mt-1">{card.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          {["pending_review", "pending_assignment", "assigned", "in_review", "approved", "waiting_for_fix", "needs_fix", "dismissed", ""].map((s) => (
            <button
              key={s || "all"}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-card text-card-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s ? s.replace("_", " ") : "All"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {hasRole("admin", "compliance_manager") && (
            <button
              onClick={() => setShowAllTasks((prev) => !prev)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                showAllTasks
                  ? "bg-card text-card-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {showAllTasks ? "My Tasks" : "All Tasks"}
            </button>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={frameworkFilter}
            onChange={(e) => setFrameworkFilter(e.target.value)}
            placeholder="Filter by framework..."
            className="rounded-lg border border-border bg-card pl-9 pr-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground w-48"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
          <CheckCircle2 className="mb-3 size-8 text-green-600" />
          <p className="text-sm font-medium text-foreground">No review tasks</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {statusFilter === "pending_review"
              ? "All AI evaluations completed successfully — no items need review."
              : statusFilter === "pending_assignment"
              ? "No violations have been submitted for review yet."
              : statusFilter === "waiting_for_fix"
              ? "No violations are waiting for fixes."
              : "No items match the current filter."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-[180px]">Violation</TableHead>
                <TableHead className="w-[72px]">Priority</TableHead>
                <TableHead className="w-[110px]">Framework</TableHead>
                <TableHead className="w-[105px]">Submitted By</TableHead>
                <TableHead className="w-[105px]">Assigned By</TableHead>
                    <TableHead className="w-[140px]">Assigned To</TableHead>
                <TableHead className="w-[120px]">Due Date</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const fwColor = FW_COLORS[task.framework] || "bg-gray-50 text-gray-700 border-gray-200";
                const reasonColor = REASON_COLORS[task.reason] || REASON_COLORS.evaluation_error;
                const isPending = task.status === "pending_review";
                const showNotes = notesOpen === task.id;
                const sd = STATUS_DISPLAY[task.status] || { label: task.status, color: "bg-gray-100 text-gray-600 border-gray-200" };
                const isInReview = task.status === "in_review";

                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate max-w-xs">
                          {task.rule_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="inline-flex items-center gap-1">
                            <FileText className="size-3" />
                            {task.document_name || `Document #${task.document_id}`}
                          </span>
                          <span className="ml-2 inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium capitalize bg-muted text-muted-foreground border-border">
                            {REASON_LABELS[task.reason] || task.reason}
                          </span>
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      {task.violation?.severity ? (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${SEVERITY_COLORS[task.violation.severity] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                          {task.violation.severity}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${fwColor}`}>
                        {task.framework}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{task.submitted_by || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">{task.assigned_by || "—"}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <User className="size-3 text-muted-foreground shrink-0" />
                        {task.assigned_to ? (
                          <span className="text-xs font-medium text-foreground">{task.assigned_to}</span>
                        ) : (
                          <select
                            className="w-full min-w-[100px] rounded-md border border-input bg-background px-2 py-1 text-xs"
                            value={selectedAssignee[task.id] || ""}
                            onChange={(e) => setSelectedAssignee((prev) => ({ ...prev, [task.id]: e.target.value }))}
                          >
                            <option value="">Select...</option>
                            {users.map((u) => (
                              <option key={u.id} value={u.id}>{u.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Calendar className="size-3 text-muted-foreground shrink-0" />
                        <input
                          type="date"
                          className="w-full min-w-[100px] rounded-md border border-input bg-background px-2 py-1 text-xs"
                          value={selectedDueDate[task.id] || (task.due_date ? task.due_date.split("T")[0] : "")}
                          onChange={(e) => setSelectedDueDate((prev) => ({ ...prev, [task.id]: e.target.value }))}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                        isInReview ? "bg-blue-100 text-blue-700 border-blue-200" : sd.color
                      }`}>
                        {isInReview ? "In Review" : sd.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {task.status === "pending_review" && !task.assigned_to_id && (
                        <div className="flex flex-col items-end gap-2">
                          <textarea
                            value={assignNote[task.id] || ""}
                            onChange={(e) => setAssignNote((prev) => ({ ...prev, [task.id]: e.target.value }))}
                            placeholder="Assignment note..."
                            rows={2}
                            className="w-full rounded-md border border-input bg-background px-2 py-1 text-xs placeholder:text-muted-foreground resize-none"
                          />
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-xs"
                              disabled={!selectedAssignee[task.id] || !selectedDueDate[task.id] || actionLoading === task.id}
                              onClick={async () => {
                                setActionLoading(task.id);
                                try {
                                  await setReviewDueDate(task.id, selectedDueDate[task.id]);
                                  await assignReviewTask(task.id, selectedAssignee[task.id], assignNote[task.id] || "");
                                  setSelectedAssignee((prev) => { const r = { ...prev }; delete r[task.id]; return r; });
                                  setSelectedDueDate((prev) => { const r = { ...prev }; delete r[task.id]; return r; });
                                  setAssignNote((prev) => { const r = { ...prev }; delete r[task.id]; return r; });
                                  await loadData();
                                } catch { /* ignore */ }
                                setActionLoading(null);
                              }}
                            >
                              Assign
                            </Button>
                          </div>
                        </div>
                      )}
                      {task.status === "pending_assignment" && (
                        <span className="text-xs text-muted-foreground italic">Awaiting assignment</span>
                      )}
                      {task.status === "assigned" && task.assigned_to_id === user?.id && (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs"
                            onClick={async () => {
                              await handleStartReview(task.id);
                              handleOpenReview(tasks.find((t) => t.id === task.id));
                            }}
                            disabled={actionLoading === task.id}
                            title="Start Review"
                          >
                            {actionLoading === task.id ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />}
                            Start Review
                          </Button>
                        </div>
                      )}
                      {task.status === "assigned" && task.assigned_to_id && task.assigned_to_id !== user?.id && (
                        <span className="text-xs text-muted-foreground italic">Assigned to {task.assigned_to}</span>
                      )}
                      {task.status === "in_review" && task.assigned_to_id === user?.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => handleOpenReview(task)}
                          title="Open Review"
                        >
                          <Eye className="size-3.5" />
                          Open Review
                        </Button>
                      )}
                      {task.status === "in_review" && task.assigned_to_id && task.assigned_to_id !== user?.id && (
                        <span className="text-xs text-muted-foreground italic">In review by {task.assigned_to}</span>
                      )}
                      {task.status === "approved" && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          onClick={() => handleResolve(task.id)}
                          disabled={actionLoading === task.id}
                        >
                          {actionLoading === task.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                          Resolve
                        </Button>
                      )}
                      {task.status === "waiting_for_fix" && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-7 text-xs"
                          onClick={() => handleResolve(task.id)}
                          disabled={actionLoading === task.id}
                        >
                          {actionLoading === task.id ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                          Resolve
                        </Button>
                      )}
                      {task.status !== "pending_review" && task.status !== "pending_assignment" && task.status !== "assigned" && task.status !== "in_review" && task.status !== "approved" && task.status !== "waiting_for_fix" && (
                        <span className="text-xs text-muted-foreground italic">{sd.label}</span>
                      )}
                      {showNotes && (
                        <div className="mt-2">
                          <textarea
                            value={notes[task.id] || ""}
                            onChange={(e) => setNotes((prev) => ({ ...prev, [task.id]: e.target.value }))}
                            placeholder="Add review notes..."
                            rows={2}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none"
                          />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <ReviewDrawer
        task={reviewDrawerTask}
        open={!!reviewDrawerTask}
        onClose={() => setReviewDrawerTask(null)}
        onApprove={async () => {
          await handleApprove(reviewDrawerTask?.id);
          setReviewDrawerTask(null);
        }}
        onReject={async (reason) => {
          await handleReject(reviewDrawerTask?.id, reason || "");
          setReviewDrawerTask(null);
        }}
        onNeedsFix={async () => {
          await handleNeedsFix(reviewDrawerTask?.id);
          setReviewDrawerTask(null);
        }}
        notes={notes}
        onNotesChange={setNotes}
        actionLoading={actionLoading}
      />
    </div>
  );
}
