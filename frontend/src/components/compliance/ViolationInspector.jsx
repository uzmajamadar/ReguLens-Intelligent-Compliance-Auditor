import { Search, Send, User, XCircle, Sparkles, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "../shared/StatusBadge";
import { SeverityDot, SeverityIcon } from "./compliance-helpers";
import RemediationCopilot from "../RemediationCopilot";

export function ViolationInspectorEmpty() {
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Search className="size-8 text-muted-foreground/40 mb-3" />
        <p className="text-sm font-medium text-foreground">Violation Inspector</p>
        <p className="text-xs text-muted-foreground mt-1">Select a violation to investigate.</p>
      </div>
    </div>
  );
}

export default function ViolationInspector({
  violation,
  onClose,
  onSubmitReview,
  submittingId,
  assigningId,
  assignName,
  setAssigningId,
  setAssignName,
  onDismiss,
  showCopilot,
  onToggleCopilot,
}) {
  if (!violation) return <ViolationInspectorEmpty />;

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2 min-w-0">
          <SeverityIcon severity={violation.severity} />
          <h3 className="text-sm font-semibold text-foreground truncate">Violation Inspector</h3>
        </div>
        <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground shrink-0">
          Close
        </button>
      </div>
      <div className="p-4 space-y-4">
        {/* Severity */}
        <div>
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Severity</p>
          <div className="flex items-center gap-2">
            <SeverityDot severity={violation.severity} />
            <StatusBadge variant={
              violation.severity === "critical" ? "critical" :
              violation.severity === "high" ? "high" :
              violation.severity === "medium" ? "medium" : "low"
            }>
              {violation.severity}
            </StatusBadge>
          </div>
        </div>

        {/* Title */}
        <p className="text-sm font-semibold text-foreground leading-snug">{violation.title}</p>

        {/* Status */}
        <div>
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Status</p>
          <StatusBadge variant={
            violation.status === "resolved" || violation.status === "approved" ? "success" :
            violation.status === "under_review" || violation.status === "in_review" ? "info" :
            violation.status === "pending_review" ? "warning" :
            violation.status === "dismissed" ? "pending" : "info"
          }>
            {violation.status?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Open"}
          </StatusBadge>
        </div>

        {/* Confidence */}
        <div>
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Confidence</p>
          <p className={cn("text-sm font-semibold", violation.confidence >= 80 ? "text-success" : violation.confidence >= 60 ? "text-warning" : "text-destructive")}>
            {violation.confidence != null ? `${violation.confidence}%` : "—"}
          </p>
        </div>

        {/* Description */}
        {violation.description && (
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Description</p>
            <p className="text-sm text-foreground/80 leading-relaxed">{violation.description}</p>
          </div>
        )}

        {/* Recommendation */}
        {violation.recommendation && (
          <div>
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Recommended Action</p>
            <div className="rounded-lg bg-success/5 border border-success/20 p-3">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
                <p className="text-sm text-foreground/80">{violation.recommendation}</p>
              </div>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="pt-2 border-t border-border space-y-2">
          {(violation.status !== "pending_review" && violation.status !== "under_review" && violation.status !== "resolved" && violation.status !== "approved" && violation.status !== "dismissed") && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5"
              onClick={() => onSubmitReview(violation)}
              disabled={submittingId === violation.id}
            >
              {submittingId === violation.id ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Submit Review
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5"
            onClick={() => { setAssigningId(violation.id); setAssignName(violation.assigned_to || ""); }}
          >
            <User className="size-3.5" /> Assign Reviewer
          </Button>
          {(violation.status !== "dismissed" && violation.status !== "resolved") && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs gap-1.5 text-destructive hover:text-destructive"
              onClick={() => onDismiss(violation)}
            >
              <XCircle className="size-3.5" /> Dismiss
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs gap-1.5"
            onClick={onToggleCopilot}
          >
            <Sparkles className={cn("size-3.5", showCopilot && "text-primary")} />
            {showCopilot ? "Hide Fix" : "Generate Fix"}
          </Button>
        </div>

        {showCopilot && (
          <RemediationCopilot violation={violation} />
        )}
      </div>
    </div>
  );
}
