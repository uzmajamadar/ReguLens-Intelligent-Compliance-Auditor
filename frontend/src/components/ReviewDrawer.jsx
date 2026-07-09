import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, X, ThumbsUp, ThumbsDown, AlertTriangle, FileText, Shield } from "lucide-react";

const DISMISS_REASONS = [
  { value: "false_positive", label: "False Positive" },
  { value: "rule_not_applicable", label: "Rule Not Applicable" },
  { value: "duplicate", label: "Duplicate Finding" },
  { value: "other", label: "Other" },
];

const SEVERITY_COLORS = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

const STATUS_DISPLAY = {
  pending_review: { label: "Open", color: "bg-amber-100 text-amber-700 border-amber-200" },
  pending_assignment: { label: "Pending Assignment", color: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  assigned: { label: "Assigned", color: "bg-blue-100 text-blue-700 border-blue-200" },
  in_review: { label: "In Review", color: "bg-amber-100 text-amber-700 border-amber-200" },
  approved: { label: "Approved", color: "bg-green-100 text-green-700 border-green-200" },
  waiting_for_fix: { label: "Waiting for Fix", color: "bg-purple-100 text-purple-700 border-purple-200" },
  dismissed: { label: "Dismissed", color: "bg-gray-100 text-gray-600 border-gray-200" },
  needs_fix: { label: "Needs Fix", color: "bg-red-100 text-red-700 border-red-200" },
};

export default function ReviewDrawer({ task, open, onClose, onApprove, onReject, onNeedsFix, notes, onNotesChange, actionLoading }) {
  const [showDismissReason, setShowDismissReason] = useState(false);
  const [dismissReason, setDismissReason] = useState("");

  useEffect(() => {
    setShowDismissReason(false);
    setDismissReason("");
  }, [task]);

  if (!open || !task) return null;

  const v = task.violation;
  const isInReview = task.status === "in_review";
  const sd = STATUS_DISPLAY[task.status] || { label: task.status, color: "bg-gray-100 text-gray-600 border-gray-200" };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-xl border-l border-border bg-card shadow-xl flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-foreground truncate">{v?.title || task.rule_name}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${sd.color}`}>
                {sd.label}
              </span>
              {task.framework && (
                <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  <Shield className="size-3" />
                  {task.framework}
                </span>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon" className="size-8 shrink-0" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5 text-sm">
          <Section label="Document">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <FileText className="size-4" />
              <span className="text-foreground">{task.document_name || `Document #${task.document_id}`}</span>
            </div>
          </Section>

          {task.submitted_by && (
            <Section label="Submitted By">
              <p className="text-foreground">{task.submitted_by}</p>
            </Section>
          )}

          {task.assigned_by && (
            <Section label="Assigned By">
              <p className="text-foreground">{task.assigned_by}</p>
            </Section>
          )}

          {v?.severity && (
            <Section label="Severity">
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${SEVERITY_COLORS[v.severity] || "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {v.severity}
              </span>
            </Section>
          )}

          {v?.confidence != null && (
            <Section label="AI Confidence">
              <div className="flex items-center gap-2">
                <div className="h-2 w-full max-w-40 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full transition-all ${
                      v.confidence >= 80 ? "bg-green-500" : v.confidence >= 50 ? "bg-amber-500" : "bg-red-500"
                    }`}
                    style={{ width: `${v.confidence}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{v.confidence}%</span>
              </div>
            </Section>
          )}

          {v?.clause && (
            <Section label="Clause / Article">
              <p className="text-foreground">{v.clause}</p>
            </Section>
          )}

          {v?.description && (
            <Section label="AI Explanation">
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">{v.description}</p>
            </Section>
          )}

          {v?.excerpt && (
            <Section label="Document Snippet">
              <pre className="rounded-lg border border-border bg-muted p-3 text-xs leading-relaxed text-foreground overflow-x-auto whitespace-pre-wrap">
                {v.excerpt}
              </pre>
            </Section>
          )}

          {v?.recommendation && (
            <Section label="AI Suggested Fix">
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">{v.recommendation}</p>
            </Section>
          )}

          <Section label="Reason for Review">
            <p className="text-muted-foreground">
              {REASON_LABELS[task.reason] || task.reason}
            </p>
          </Section>

          <Section label="Reviewer Notes">
            <Textarea
              value={notes[task.id] || ""}
              onChange={(e) => onNotesChange((prev) => ({ ...prev, [task.id]: e.target.value }))}
              placeholder="Add your review notes here..."
              rows={4}
            />
          </Section>
        </div>

        <div className="border-t border-border px-5 py-4 flex items-center gap-2">
          {isInReview ? (
            <>
              <Button
                variant="outline"
                size="sm"
                className="text-green-600 border-green-200 hover:bg-green-50"
                onClick={onApprove}
                disabled={actionLoading === task.id}
              >
                {actionLoading === task.id ? <Loader2 className="size-4 animate-spin" /> : <ThumbsUp className="size-4" />}
                Approve
              </Button>
              {showDismissReason ? (
                <div className="flex items-center gap-1">
                  <Select
                    value={dismissReason}
                    onValueChange={setDismissReason}
                  >
                    <SelectTrigger className="h-7 text-xs w-36">
                      <SelectValue placeholder="Reason..." />
                    </SelectTrigger>
                    <SelectContent>
                      {DISMISS_REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50 h-7 text-xs"
                    onClick={() => {
                      if (!dismissReason) return;
                      onReject(dismissReason);
                      setShowDismissReason(false);
                      setDismissReason("");
                    }}
                    disabled={actionLoading === task.id || !dismissReason}
                  >
                    {actionLoading === task.id ? <Loader2 className="size-4 animate-spin" /> : null}
                    Confirm
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setShowDismissReason(false)}
                  >
                    Back
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => setShowDismissReason(true)}
                  disabled={actionLoading === task.id}
                >
                  {actionLoading === task.id ? <Loader2 className="size-4 animate-spin" /> : <ThumbsDown className="size-4" />}
                  Dismiss
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={onNeedsFix}
                disabled={actionLoading === task.id}
              >
                {actionLoading === task.id ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
                Needs Fix
              </Button>
            </>
          ) : task.status === "assigned" ? (
            <Button
              variant="default"
              size="sm"
              onClick={onApprove}
              disabled={actionLoading === task.id}
            >
              {actionLoading === task.id ? <Loader2 className="size-4 animate-spin" /> : null}
              Start Review
            </Button>
          ) : null}
          <div className="flex-1" />
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}

function Section({ label, children }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</p>
      {children}
    </div>
  );
}

const REASON_LABELS = {
  low_confidence: "Low Confidence — needs human review",
  evaluation_error: "AI evaluation failed unexpectedly",
  parse_error: "AI returned unparseable response",
  timeout: "AI evaluation timed out",
  rate_limited: "AI provider rate limit hit — auto-retrying",
  model_unavailable: "AI model temporarily unavailable",
};
