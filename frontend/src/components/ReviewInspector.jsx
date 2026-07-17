import { useState } from "react";
import { X, Loader2, CheckCircle2, ThumbsDown, AlertTriangle, ExternalLink, FileText, User, Shield, Scale, MessageSquare, Activity, RotateCcw, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { cn } from "@/lib/utils";

const REASON_LABELS = {
  low_confidence: "Low Confidence — needs human review",
  evaluation_error: "AI evaluation failed unexpectedly",
  parse_error: "AI returned unparseable response",
  timeout: "AI evaluation timed out",
  rate_limited: "AI provider rate limit hit — auto-retrying",
  model_unavailable: "Model error — click Retry to re-evaluate",
};

const SEVERITY_CONFIG = {
  critical: { label: "Critical", variant: "critical" },
  high: { label: "High", variant: "high" },
  medium: { label: "Medium", variant: "medium" },
  low: { label: "Low", variant: "low" },
};

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex size-6 items-center justify-center rounded-md bg-muted">
        <Icon className="size-3.5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    </div>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between py-1.5">
      <span className="text-xs text-muted-foreground shrink-0 min-w-[100px]">{label}</span>
      <span className="text-xs font-medium text-foreground text-right">{value || "—"}</span>
    </div>
  );
}

function Badge({ children, className }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium", className)}>
      {children}
    </span>
  );
}

function TimelineEntry({ icon: Icon, label, description, timestamp, isActive, isLast }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn("flex size-6 items-center justify-center rounded-full border", isActive ? "border-primary bg-primary/10" : "border-border bg-muted")}>
          <Icon className={cn("size-3", isActive ? "text-primary" : "text-muted-foreground")} />
        </div>
        {!isLast && <div className="w-px flex-1 bg-border my-1" />}
      </div>
      <div className={cn("pb-4", isLast && "pb-0")}>
        <p className="text-xs font-medium text-foreground">{label}</p>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
        {timestamp && <p className="text-[10px] text-muted-foreground/60 mt-0.5">{timestamp}</p>}
      </div>
    </div>
  );
}

const FW_COLORS = {
  GDPR: "bg-indigo-50 text-indigo-700 border-indigo-200",
  HR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  HIPAA: "bg-blue-50 text-blue-700 border-blue-200",
  SOC2: "bg-purple-50 text-purple-700 border-purple-200",
  "PCI-DSS": "bg-red-50 text-red-700 border-red-200",
  ISO27001: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function ReviewInspector({
  task,
  onClose,
  onApprove,
  onReject,
  onNeedsFix,
  onResolve,
  onStartReview,
  notes,
  onNotesChange,
  actionLoading,
  users,
  selectedAssignee,
  onAssigneeChange,
  selectedDueDate,
  onDueDateChange,
  assignNote,
  onAssignNoteChange,
  onAssign,
  onRetry,
}) {
  const [activeTab, setActiveTab] = useState("overview");
  const isActionLoading = actionLoading === task?.id;

  if (!task) return null;

  const severity = SEVERITY_CONFIG[task.violation?.severity] || SEVERITY_CONFIG.low;
  const fwColor = FW_COLORS[task.framework] || "bg-gray-50 text-gray-700 border-gray-200";
  const isInReview = task.status === "in_review";
  const isAssigned = task.status === "assigned";
  const isApproved = task.status === "approved";
  const isChangesRequested = task.status === "changes_requested";
  const isPending = task.status === "pending";
  const isResolved = task.status === "resolved";
  const isDismissed = task.status === "dismissed";

  const canReview = isInReview;
  const canStartReview = isAssigned;
  const canResolve = isApproved;
  const canAssign = !task.assigned_to && isPending;

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "ai_analysis", label: "AI Analysis" },
    { id: "evidence", label: "Evidence" },
    { id: "notes", label: "Notes" },
  ];

  return (
    <div className="flex h-full flex-col bg-card border-l border-border">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground truncate">{task.rule_name}</p>
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            <span className="inline-flex items-center gap-1">
              <FileText className="size-3" />
              {task.document_name || `Document #${task.document_id}`}
            </span>
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-7 shrink-0 ml-2" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-2 px-5 py-2 border-b border-border shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "text-xs font-medium px-2.5 py-1.5 rounded-md transition-colors shrink-0",
              activeTab === tab.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "overview" && (
          <div className="p-5 space-y-5">
            <div className="flex items-center gap-2">
              <StatusBadge variant={severity.variant}>{severity.label}</StatusBadge>
              <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium", fwColor)}>
                {task.framework}
              </span>
              <StatusBadge variant={isInReview ? "info" : isApproved || isResolved ? "success" : isDismissed ? "pending" : isChangesRequested ? "warning" : "warning"}>
                {isInReview ? "In Review" : task.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </StatusBadge>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
              <DetailRow label="Document" value={task.document_name || `Document #${task.document_id}`} />
              <DetailRow label="Framework" value={task.framework} />
              <DetailRow label="Rule" value={task.rule_name} />
              <DetailRow label="Submitted By" value={task.submitted_by || "—"} />
              <DetailRow label="Assigned To" value={task.assigned_to || "Unassigned"} />
              <DetailRow label="Due Date" value={task.due_date ? new Date(task.due_date).toLocaleDateString() : "—"} />
              <DetailRow label="Created" value={task.created_at ? new Date(task.created_at).toLocaleDateString() : "—"} />
              <DetailRow label="Updated" value={task.updated_at ? new Date(task.updated_at).toLocaleDateString() : "—"} />
            </div>

            {task.reason && (
              <div>
                <SectionHeader icon={AlertTriangle} title="Review Reason" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {REASON_LABELS[task.reason] || task.reason}
                </p>
                {task.reason === "model_unavailable" && (
                  <Button variant="outline" size="sm" className="mt-2 h-7 text-xs" onClick={() => onRetry?.(task.id)} disabled={isActionLoading}>
                    {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                    Retry Evaluation
                  </Button>
                )}
              </div>
            )}

            <div>
              <SectionHeader icon={Scale} title="Compliance Score" />
              <div className="flex items-center gap-3">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-foreground">{task.compliance_score ?? "—"}</span>
                  {task.compliance_score != null && <span className="text-xs text-muted-foreground">/ 100</span>}
                </div>
                {task.ai_confidence != null && (
                  <div className="flex items-baseline gap-1">
                    <span className="text-lg font-semibold text-muted-foreground">AI {task.ai_confidence}%</span>
                    <span className="text-xs text-muted-foreground">confidence</span>
                  </div>
                )}
              </div>
            </div>

            <div>
              <SectionHeader icon={Activity} title="Activity Timeline" />
              <div className="mt-2">
                <TimelineEntry icon={FileText} label="Task Created" description="AI evaluation completed" timestamp={task.created_at ? new Date(task.created_at).toLocaleString() : "—"} isActive isLast={!task.assigned_to && !isInReview && !isApproved && !isChangesRequested && !isResolved && !isDismissed} />
                {task.assigned_to && (
                  <TimelineEntry icon={User} label="Assigned" description={`Assigned to ${task.assigned_to}`} timestamp={task.updated_at ? new Date(task.updated_at).toLocaleString() : "—"} isActive={isAssigned} isLast={!isInReview && !isApproved && !isChangesRequested && !isResolved && !isDismissed} />
                )}
                {(isInReview || isApproved || isChangesRequested || isResolved || isDismissed) && (
                  <TimelineEntry icon={Eye} label="Review Started" description="Human review in progress" timestamp="—" isActive={isInReview} isLast={!isApproved && !isChangesRequested && !isResolved && !isDismissed} />
                )}
                {(isApproved || isResolved) && (
                  <TimelineEntry icon={CheckCircle2} label="Approved" description="Finding accepted" timestamp="—" isActive={isApproved} isLast={!isResolved} />
                )}
                {isResolved && (
                  <TimelineEntry icon={CheckCircle2} label="Resolved" description="Finding has been resolved" timestamp="—" isActive isLast />
                )}
                {isChangesRequested && (
                  <TimelineEntry icon={AlertTriangle} label="Changes Requested" description="Issues identified for remediation" timestamp="—" isActive isLast />
                )}
                {isDismissed && (
                  <TimelineEntry icon={ThumbsDown} label="Dismissed" description="Finding dismissed" timestamp="—" isActive isLast />
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === "ai_analysis" && (
          <div className="p-5 space-y-5">
            <div>
              <SectionHeader icon={Shield} title="AI Confidence" />
              <div className="flex items-center gap-4">
                <div className={cn("flex size-16 items-center justify-center rounded-full border-2 text-lg font-bold", task.ai_confidence >= 70 ? "border-green-200 bg-green-50 text-green-700" : task.ai_confidence >= 40 ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700")}>
                  {task.ai_confidence ?? "?"}%
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {task.ai_confidence >= 70 ? "AI is reasonably confident in this evaluation. A quick human review is recommended."
                    : task.ai_confidence >= 40 ? "AI confidence is moderate. Please review carefully."
                    : "AI confidence is low. Thorough human review required."}
                </p>
              </div>
            </div>

            <div>
              <SectionHeader icon={AlertTriangle} title="Areas of Concern" />
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">
                  {task.violation?.reasoning || task.reason === "low_confidence"
                    ? "The AI identified potential compliance gaps that require human verification."
                    : "No specific areas of concern were identified beyond the confidence threshold."}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "evidence" && (
          <div className="p-5 space-y-5">
            <div>
              <SectionHeader icon={FileText} title="Document Evidence" />
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <p className="text-xs font-medium text-foreground mb-1">
                  {task.document_name || `Document #${task.document_id}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  Relevant clauses and sections will be displayed here when available.
                </p>
                {task.violation?.evidence_url && (
                  <a href={task.violation.evidence_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-2 text-xs font-medium text-primary hover:underline">
                    <ExternalLink className="size-3" />
                    View source document
                  </a>
                )}
              </div>
            </div>

            <div>
              <SectionHeader icon={Scale} title="Regulatory Context" />
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-1">
                <DetailRow label="Framework" value={task.framework} />
                <DetailRow label="Rule" value={task.rule_name} />
                {task.rule_id && <DetailRow label="Rule ID" value={task.rule_id} />}
              </div>
            </div>
          </div>
        )}

        {activeTab === "notes" && (
          <div className="p-5 space-y-5">
            <div>
              <SectionHeader icon={MessageSquare} title="Review Notes" />
              <Textarea
                value={notes[task.id] || ""}
                onChange={(e) => onNotesChange((prev) => ({ ...prev, [task.id]: e.target.value }))}
                placeholder="Add your review notes here..."
                rows={6}
                className="text-sm"
              />
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-3 shrink-0">
        {canAssign && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <select
                  value={selectedAssignee[task.id] || ""}
                  onChange={(e) => onAssigneeChange((prev) => ({ ...prev, [task.id]: e.target.value }))}
                  className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
                >
                  <option value="">Assign to...</option>
                  {users.map((u) => (
                    <option key={u.id} value={String(u.id)}>{u.name}</option>
                  ))}
                </select>
              </div>
              <input
                type="date"
                value={selectedDueDate[task.id] || ""}
                onChange={(e) => onDueDateChange((prev) => ({ ...prev, [task.id]: e.target.value }))}
                className="w-36 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
              />
            </div>
            <input
              type="text"
              value={assignNote[task.id] || ""}
              onChange={(e) => onAssignNoteChange((prev) => ({ ...prev, [task.id]: e.target.value }))}
              placeholder="Assignment note (optional)..."
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs"
            />
            <Button
              size="sm"
              variant="default"
              className="w-full h-8 text-xs"
              disabled={!selectedAssignee[task.id] || !selectedDueDate[task.id] || isActionLoading}
              onClick={() => onAssign(task)}
            >
              {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : null}
              {isActionLoading ? "Assigning..." : "Assign Task"}
            </Button>
          </div>
        )}

        {canStartReview && (
          <Button
            size="sm"
            variant="default"
            className="w-full h-8 text-xs"
            disabled={isActionLoading}
            onClick={() => onStartReview(task.id)}
          >
            {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : <Eye className="size-3.5" />}
            {isActionLoading ? "Starting..." : "Start Review"}
          </Button>
        )}

        {canReview && (
          <div className="space-y-2">
            <Button
              size="sm"
              variant="default"
              className="w-full h-8 text-xs bg-green-600 hover:bg-green-700"
              disabled={isActionLoading}
              onClick={() => onApprove(task.id)}
            >
              {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              {isActionLoading ? "Approving..." : "Approve"}
            </Button>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs text-amber-600 border-amber-200 hover:bg-amber-50"
                disabled={isActionLoading}
                onClick={() => onNeedsFix(task.id)}
              >
                {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : <AlertTriangle className="size-3.5" />}
                Needs Fix
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                disabled={isActionLoading}
                onClick={() => onReject(task.id)}
              >
                {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : <ThumbsDown className="size-3.5" />}
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {canResolve && (
          <Button
            size="sm"
            variant="default"
            className="w-full h-8 text-xs"
            disabled={isActionLoading}
            onClick={() => onResolve(task.id)}
          >
            {isActionLoading ? <Loader2 className="size-3 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            {isActionLoading ? "Resolving..." : "Resolve Finding"}
          </Button>
        )}

        {(isResolved || isDismissed || isChangesRequested) && !canAssign && !canStartReview && !canReview && !canResolve && (
          <p className="text-xs text-muted-foreground text-center py-2 italic">
            {isResolved ? "Finding has been resolved." : isDismissed ? "Finding has been dismissed." : "No actions available."}
          </p>
        )}
      </div>
    </div>
  );
}
