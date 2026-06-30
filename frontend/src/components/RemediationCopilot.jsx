import { useState } from "react";
import { Sparkles, CheckCircle2, XCircle, Edit3, FileCheck, ChevronDown, ChevronUp, Loader2, Send, UserCheck } from "lucide-react";
import { generateRemediation, acceptRemediation, rejectRemediation, editRemediation, applyRemediation, listViolationRemediations, submitForReview } from "../lib/api";
import { Button } from "@/components/ui/button";

const statusBadge = {
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  accepted: "bg-blue-100 text-blue-700 border-blue-200",
  rejected: "bg-gray-100 text-gray-500 border-gray-200",
  modified: "bg-purple-100 text-purple-700 border-purple-200",
  under_review: "bg-indigo-100 text-indigo-700 border-indigo-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  applied: "bg-green-100 text-green-700 border-green-200",
};

export default function RemediationCopilot({ violation }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(null);
  const [error, setError] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [prevSuggestions, setPrevSuggestions] = useState([]);
  const [showPrev, setShowPrev] = useState(false);
  const [applyResult, setApplyResult] = useState(null);
  const [submitResult, setSubmitResult] = useState(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await generateRemediation(violation.id);
      setSuggestion(res.suggestion);
      setEditedText(res.suggestion.suggested_clause);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAccept() {
    if (!suggestion) return;
    setSaving("accept");
    try {
      await acceptRemediation(suggestion.id);
      setSuggestion((prev) => ({ ...prev, status: "accepted" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleReject() {
    if (!suggestion) return;
    setSaving("reject");
    try {
      await rejectRemediation(suggestion.id);
      setSuggestion((prev) => ({ ...prev, status: "rejected" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleEdit() {
    if (!suggestion || !editedText.trim()) return;
    setSaving("edit");
    try {
      await editRemediation(suggestion.id, editedText);
      setSuggestion((prev) => ({ ...prev, status: "modified", user_modified_text: editedText, suggested_clause: editedText }));
      setEditing(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleSubmitForReview() {
    if (!suggestion) return;
    setSaving("submit");
    try {
      const res = await submitForReview(violation.id, suggestion.id);
      setSubmitResult(res);
      setSuggestion((prev) => ({ ...prev, status: "under_review" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function handleApply() {
    if (!suggestion) return;
    setSaving("apply");
    try {
      const res = await applyRemediation(suggestion.id);
      setApplyResult(res);
      setSuggestion((prev) => ({ ...prev, status: "applied" }));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function loadPrev() {
    try {
      const list = await listViolationRemediations(violation.id);
      setPrevSuggestions(list.filter((s) => !suggestion || s.id !== suggestion.id));
      setShowPrev(!showPrev);
    } catch {
      setPrevSuggestions([]);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-linear-to-r from-primary/5 to-transparent px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <span className="text-sm font-semibold text-card-foreground">AI Remediation Copilot</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Severity: <span className={`font-medium ${violation.severity === "critical" || violation.severity === "high" ? "text-red-600" : violation.severity === "medium" ? "text-amber-600" : "text-blue-600"}`}>{violation.severity}</span>
        </div>
      </div>

      {/* Violation context */}
      <div className="px-4 py-3 border-b border-border bg-muted/20">
        <p className="text-sm font-medium text-card-foreground">{violation.title}</p>
        <p className="text-xs text-muted-foreground mt-1">{violation.description}</p>
        {violation.excerpt && (
          <div className="mt-2 rounded-lg bg-red-50 border border-red-200 p-2">
            <p className="text-xs font-medium text-red-700 mb-0.5">Original Excerpt:</p>
            <p className="text-xs text-red-600 font-mono">{violation.excerpt}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="px-4 py-3">
        {!suggestion ? (
          <div>
            <Button onClick={handleGenerate} disabled={loading} size="sm" className="w-full">
              {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {loading ? "Generating fix..." : "Generate Suggested Fix"}
            </Button>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Status badge */}
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge[suggestion.status] || "bg-gray-100"}`}>
                {suggestion.status}
              </span>
              {suggestion.section_reference && (
                <span className="text-xs text-muted-foreground">{suggestion.section_reference}</span>
              )}
            </div>

            {/* Original vs Suggested diff */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-red-200 bg-red-50 p-2.5">
                <p className="text-xs font-medium text-red-700 mb-1">Original</p>
                <p className="text-xs text-red-600 font-mono whitespace-pre-wrap">{suggestion.original_clause}</p>
              </div>
              <div className="rounded-lg border border-green-200 bg-green-50 p-2.5">
                <p className="text-xs font-medium text-green-700 mb-1">Suggested Fix</p>
                {editing ? (
                  <textarea
                    value={editedText}
                    onChange={(e) => setEditedText(e.target.value)}
                    className="w-full text-xs font-mono bg-white border border-border rounded p-1 resize-none text-foreground"
                    rows={8}
                  />
                ) : (
                  <div className="text-xs text-green-800 leading-relaxed whitespace-pre-wrap">
                    {suggestion.suggested_clause.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
                      part.startsWith("**") && part.endsWith("**") ? (
                        <span key={i} className="font-semibold text-green-900 block mt-2 mb-1">{part.slice(2, -2)}</span>
                      ) : part.startsWith("- ") ? (
                        <span key={i} className="block ml-2">{part}</span>
                      ) : part.startsWith("  ") ? (
                        <span key={i} className="block ml-4 text-green-700">{part.trim()}</span>
                      ) : (
                        <span key={i}>{part}</span>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Reasoning */}
            {suggestion.reasoning && (
              <div className="rounded-lg bg-muted/30 p-2.5">
                <p className="text-xs font-medium text-card-foreground mb-0.5">Why this fix works</p>
                <p className="text-xs text-muted-foreground">{suggestion.reasoning}</p>
              </div>
            )}

            {/* Action buttons */}
            {suggestion.status === "pending" && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleAccept} disabled={saving === "accept"} size="sm" variant="default">
                  {saving === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                  Accept
                </Button>
                <Button onClick={handleReject} disabled={saving === "reject"} size="sm" variant="outline">
                  {saving === "reject" ? <Loader2 className="size-3.5 animate-spin" /> : <XCircle className="size-3.5" />}
                  Reject
                </Button>
                {editing ? (
                  <Button onClick={handleEdit} disabled={saving === "edit" || !editedText.trim()} size="sm" variant="secondary">
                    {saving === "edit" ? <Loader2 className="size-3.5 animate-spin" /> : <FileCheck className="size-3.5" />}
                    Save
                  </Button>
                ) : (
                  <Button onClick={() => setEditing(true)} size="sm" variant="secondary">
                    <Edit3 className="size-3.5" />
                    Edit
                  </Button>
                )}
              </div>
            )}

            {suggestion.status === "modified" && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleAccept} disabled={saving === "accept"} size="sm" variant="default">
                  {saving === "accept" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
                  Accept Modified
                </Button>
                <Button onClick={handleReject} disabled={saving === "reject"} size="sm" variant="outline">
                  Reject
                </Button>
              </div>
            )}

            {(suggestion.status === "accepted" || suggestion.status === "modified") && !submitResult && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSubmitForReview} disabled={saving === "submit"} size="sm" variant="default">
                  {saving === "submit" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                  Submit for Review
                </Button>
              </div>
            )}

            {submitResult && (
              <div className="text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <p className="text-sm font-semibold">Review Request Created</p>
                </div>
                <div className="ml-6 text-xs text-blue-700 space-y-1">
                  <p><span className="font-medium">Document:</span> {violation.docName || violation.document_name || "---"}</p>
                  <p><span className="font-medium">Violation:</span> {violation.title}</p>
                  <p><span className="font-medium">Priority:</span> <span className="capitalize">{violation.severity}</span></p>
                  <p><span className="font-medium">Status:</span> Pending Assignment</p>
                  <p><span className="font-medium">Submitted:</span> {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <p className="text-xs text-blue-600 mt-1">A compliance manager will assign a reviewer to validate this finding.</p>
              </div>
            )}

            {suggestion.status === "approved" && !submitResult && (
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleApply} disabled={saving === "apply"} size="sm" variant="default">
                  {saving === "apply" ? <Loader2 className="size-3.5 animate-spin" /> : <FileCheck className="size-3.5" />}
                  Apply Approved Fix
                </Button>
              </div>
            )}

            {suggestion.status === "approved" && submitResult && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg p-2.5">
                  <UserCheck className="size-4 shrink-0" />
                  <p className="text-xs font-medium">Approved by Compliance Manager</p>
                </div>
                <Button onClick={handleApply} disabled={saving === "apply"} size="sm" variant="default" className="w-full">
                  {saving === "apply" ? <Loader2 className="size-3.5 animate-spin" /> : <FileCheck className="size-3.5" />}
                  Apply Approved Fix
                </Button>
              </div>
            )}

            {suggestion.status === "applied" && (
              <div className="text-green-700 bg-green-50 border border-green-200 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <p className="text-sm font-semibold">Applied Successfully</p>
                </div>
                <div className="ml-6 text-xs text-green-700 space-y-0.5">
                  <p><span className="font-medium">Document Version:</span> v{applyResult?.version || "2.1"}</p>
                  <p className="font-medium mt-1">Changes:</p>
                  <p className="ml-2">+ Added compliant clause</p>
                </div>
              </div>
            )}

            {suggestion.status === "rejected" && (
              <div className="flex items-center gap-2 text-gray-500 bg-gray-50 border border-gray-200 rounded-lg p-2.5">
                <XCircle className="size-4 shrink-0" />
                <p className="text-xs font-medium">Remediation rejected.</p>
              </div>
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}

            {/* Previous suggestions */}
            <button onClick={loadPrev} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {showPrev ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              Previous suggestions ({prevSuggestions.length > 0 ? prevSuggestions.length : "show"})
            </button>
            {showPrev && prevSuggestions.length === 0 && (
              <p className="text-xs text-muted-foreground">No previous suggestions.</p>
            )}
            {showPrev && prevSuggestions.map((s) => (
              <div key={s.id} className="rounded-lg border border-border p-2 space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${statusBadge[s.status] || "bg-gray-100"}`}>{s.status}</span>
                  <span className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">{s.suggested_clause}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
