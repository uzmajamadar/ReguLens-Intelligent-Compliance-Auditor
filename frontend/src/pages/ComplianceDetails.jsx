import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Shield, FileText, CheckCircle2, XCircle,
  Loader2, ExternalLink, User,
  Sparkles, Send, Search, Eye,
} from "lucide-react";
import {
  listDocuments, listScans, getComplianceRules, listAllViolations,
  rejectReviewTask, submitForReview,
} from "../lib/api";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "../components/shared/PageHeader";
import { StatusBadge } from "../components/shared/StatusBadge";
import { EmptyState } from "../components/shared/EmptyState";
import RemediationCopilot from "../components/RemediationCopilot";
import { cn } from "@/lib/utils";
import { scoreColor, scoreBg, SeverityDot, SeverityIcon } from "../components/compliance/compliance-helpers";
import PassedControlsTable from "../components/compliance/PassedControlsTable";
import ViolationsTable from "../components/compliance/ViolationsTable";
import ScoreSummary from "../components/compliance/ScoreSummary";
import ActivityTimeline from "../components/compliance/ActivityTimeline";
import ViolationInspector from "../components/compliance/ViolationInspector";

const deductions = { critical: 20, high: 12, medium: 7, low: 3 };

function computeScore(violations) {
  return Math.max(0, 100 - violations.reduce((s, v) => s + (deductions[v.severity] || 7), 0));
}

export default function ComplianceDetails() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const frameworkParam = searchParams.get("framework");

  const [docs, setDocs] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedDocId, setSelectedDocId] = useState(searchParams.get("document") || "");
  const [selectedFramework, setSelectedFramework] = useState(frameworkParam || "");
  const [violations, setViolations] = useState([]);
  const [scans, setScans] = useState([]);
  const [violationsLoading, setViolationsLoading] = useState(false);

  const [expandedViolation, setExpandedViolation] = useState(null);
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [showCopilot, setShowCopilot] = useState(false);
  const [assigningId, setAssigningId] = useState(null);
  const [assignName, setAssignName] = useState("");
  const [submittingId, setSubmittingId] = useState(null);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "overview");

  function handleTabChange(tab) {
    setActiveTab(tab);
    updateUrl({ tab: tab === "overview" ? undefined : tab });
  }

  function updateUrl(params) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(params).forEach(([k, v]) => {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      });
      return next;
    }, { replace: true });
  }

  function handleDocChange(id) {
    setSelectedDocId(id);
    setSelectedFramework("");
    setSelectedViolation(null);
    setShowCopilot(false);
    setActiveTab("overview");
    updateUrl({ document: id || undefined, framework: undefined, violation: undefined, tab: undefined });
  }

  function handleFrameworkChange(fw) {
    setSelectedFramework(fw);
    setSelectedViolation(null);
    setShowCopilot(false);
    setActiveTab("overview");
    updateUrl({ framework: fw || undefined, violation: undefined, tab: undefined });
  }

  function handleSelectViolation(v) {
    setExpandedViolation(null);
    setSelectedViolation(v);
    setShowCopilot(false);
    setActiveTab("violations");
    updateUrl({ violation: String(v.id), tab: "violations" });
  }

  function handleCloseInspector() {
    setSelectedViolation(null);
    setShowCopilot(false);
    updateUrl({ violation: undefined });
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [complianceRules, documents] = await Promise.all([
          getComplianceRules(),
          listDocuments(),
        ]);
        setRules(complianceRules);
        setDocs(documents);
        if (searchParams.get("document")) {
          setSelectedDocId(searchParams.get("document"));
        }
      } catch (err) {
        console.error("Failed to load data", err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedDocId) {
      setViolations([]);
      setScans([]);
      setSelectedFramework("");
      updateUrl({ document: undefined, framework: undefined, violation: undefined, tab: undefined });
      return;
    }
    (async () => {
      setViolationsLoading(true);
      try {
        const [violationsData, scansData] = await Promise.all([
          listAllViolations({ document_id: selectedDocId }),
          listScans(selectedDocId).catch(() => []),
        ]);
        setViolations(violationsData);
        setScans(scansData);
        let autoFramework = null;
        if (frameworkParam && violationsData.some((v) => v.framework === frameworkParam)) {
          autoFramework = frameworkParam;
        } else if (!selectedFramework && violationsData.length > 0) {
          const fws = [...new Set(violationsData.map((v) => v.framework))];
          autoFramework = fws[0] || "";
        }
        if (autoFramework !== null) {
          setSelectedFramework(autoFramework);
          if (!frameworkParam) {
            setSearchParams((prev) => {
              const next = new URLSearchParams(prev);
              if (autoFramework) next.set("framework", autoFramework);
              else next.delete("framework");
              return next;
            }, { replace: true });
          }
        }
        const violationParam = searchParams.get("violation");
        if (violationParam) {
          const v = violationsData.find((x) => String(x.id) === violationParam);
          if (v) setSelectedViolation(v);
        }
      } catch (err) {
        console.error("Failed to load violations", err);
      } finally {
        setViolationsLoading(false);
      }
    })();
  }, [selectedDocId]);

  const selectedDoc = docs.find((d) => String(d.id) === String(selectedDocId));

  const availableFrameworks = useMemo(() => {
    const fws = new Set(violations.map((v) => v.framework));
    if (selectedDoc?.frameworks) {
      selectedDoc.frameworks.forEach((fw) => fws.add(fw));
    }
    return [...fws].sort();
  }, [violations, selectedDoc]);

  const filteredViolations = useMemo(() => {
    if (!selectedFramework) return violations;
    return violations.filter((v) => v.framework === selectedFramework);
  }, [violations, selectedFramework]);

  const frameworkViolations = useMemo(() => {
    if (!selectedFramework) return [];
    return violations.filter((v) => v.framework === selectedFramework);
  }, [violations, selectedFramework]);

  const otherFrameworkViolations = useMemo(() => {
    if (!selectedFramework) return violations;
    return violations.filter((v) => v.framework !== selectedFramework);
  }, [violations, selectedFramework]);

  const score = useMemo(() => {
    if (frameworkViolations.length === 0 && selectedFramework) return 100;
    return computeScore(frameworkViolations);
  }, [frameworkViolations, selectedFramework]);

  const frameworkHealth = useMemo(() => {
    const counts = {};
    violations.forEach((v) => {
      if (!counts[v.framework]) counts[v.framework] = { total: 0, critical: 0, high: 0 };
      counts[v.framework].total++;
      if (v.severity === "critical") counts[v.framework].critical++;
      if (v.severity === "high") counts[v.framework].high++;
    });
    return Object.entries(counts)
      .map(([fw, c]) => ({ framework: fw, ...c, score: computeScore(violations.filter((v) => v.framework === fw)) }))
      .sort((a, b) => a.score - b.score);
  }, [violations]);

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    frameworkViolations.forEach((v) => { if (counts[v.severity] != null) counts[v.severity]++; });
    return counts;
  }, [frameworkViolations]);

  const passedControls = useMemo(() => {
    const failedRuleIds = new Set(frameworkViolations.map((v) => v.rule_id));
    return rules.filter((r) => !failedRuleIds.has(r.id) && (!selectedFramework || r.regulation === selectedFramework));
  }, [rules, frameworkViolations, selectedFramework]);

  const failedControls = useMemo(() => {
    const seen = new Set();
    return frameworkViolations.filter((v) => {
      if (seen.has(v.rule_id)) return false;
      seen.add(v.rule_id);
      return true;
    });
  }, [frameworkViolations]);

  const latestScanScore = useMemo(() => {
    const completed = scans.filter((s) => s.status === "completed" && (!selectedFramework || s.framework === selectedFramework));
    if (completed.length === 0) return null;
    const latest = completed.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
    return latest?.score ?? null;
  }, [scans, selectedFramework]);

  const allScannedFrameworks = useMemo(() => {
    return [...new Set(scans.filter((s) => s.status === "completed").map((s) => s.framework).filter(Boolean))];
  }, [scans]);

  const activityItems = useMemo(() => {
    const items = [];

    scans.filter((s) => s.status === "completed").forEach((s) => {
      const scanType = s.scan_type === "selective" ? " (Selective)" : "";
      const rulesInfo = s.rules_evaluated != null
        ? ` | ${s.rules_evaluated} rules evaluated`
        : "";
      const changedInfo = s.changed_percentage != null && s.changed_percentage > 0
        ? ` | ${Math.round(s.changed_percentage)}% changed`
        : "";
      items.push({
        id: `scan-${s.id}`,
        type: "scan",
        timestamp: s.created_at,
        label: `${s.framework ? `Scan completed for ${s.framework}` : "Scan completed"}${scanType}`,
        detail: `${s.score != null ? `Score: ${s.score}/100` : ""}${rulesInfo}${changedInfo}`,
      });
    });

    frameworkViolations.forEach((v) => {
      if (v.assigned_to) {
        items.push({
          id: `assign-${v.id}`,
          type: "assigned",
          timestamp: v.created_at,
          label: "Reviewer assigned",
          detail: `${v.assigned_to} assigned to "${v.title}"`,
        });
      }
      if (v.status === "pending_review" || v.status === "under_review") {
        items.push({
          id: `review-${v.id}`,
          type: "review",
          timestamp: v.created_at,
          label: "Review submitted",
          detail: `"${v.title}"`,
        });
      }
      if (v.status === "dismissed") {
        items.push({
          id: `dismiss-${v.id}`,
          type: "dismissed",
          timestamp: v.created_at,
          label: "Violation dismissed",
          detail: `"${v.title}"`,
        });
      }
      if (v.status === "resolved" || v.status === "approved") {
        items.push({
          id: `resolve-${v.id}`,
          type: "resolved",
          timestamp: v.created_at,
          label: "Violation resolved",
          detail: `"${v.title}"`,
        });
      }
    });

    items.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(b.timestamp) - new Date(a.timestamp);
    });

    return items;
  }, [scans, frameworkViolations]);

  const docNameMap = {};
  docs.forEach((d) => { docNameMap[d.id] = d.original_filename || d.filename || "Unknown"; });

  async function handleSubmitReview(v) {
    setSubmittingId(v.id);
    try {
      await submitForReview(v.id);
      setViolations((prev) => prev.map((x) => x.id === v.id ? { ...x, status: "pending_review" } : x));
    } catch (err) {
      console.error("Failed to submit for review", err);
    } finally {
      setSubmittingId(null);
    }
  }

  async function handleAssign(v) {
    if (!assignName.trim()) return;
    try {
      if (v.review_task_id) {
        await submitForReview(v.id);
        setViolations((prev) => prev.map((x) => x.id === v.id ? { ...x, status: "pending" } : x));
      } else {
        await submitForReview(v.id);
        setViolations((prev) => prev.map((x) => x.id === v.id ? { ...x, status: "pending" } : x));
      }
      setAssigningId(null);
      setAssignName("");
    } catch (err) {
      console.error("Failed to assign", err);
    }
  }

  async function handleDismiss(v) {
    try {
      if (v.review_task_id) {
        await rejectReviewTask(v.review_task_id, "Dismissed from compliance investigation");
        setViolations((prev) => prev.map((x) => x.id === v.id ? { ...x, status: "dismissed" } : x));
      } else {
        await submitForReview(v.id);
        setViolations((prev) => prev.map((x) => x.id === v.id ? { ...x, status: "pending" } : x));
      }
    } catch (err) {
      console.error("Failed to dismiss", err);
    }
  }

  function formatEvidence(v) {
    if (v.source_chunks) {
      try {
        const chunks = typeof v.source_chunks === "string" ? JSON.parse(v.source_chunks) : v.source_chunks;
        if (Array.isArray(chunks) && chunks.length > 0) {
          return chunks.map((c) => c.text_snippet).filter(Boolean).join("\n\n");
        }
      } catch {}
    }
    return v.excerpt || v.description || "";
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-12 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
      <PageHeader
        title="Investigation Workspace"
        description="Select a document and framework to investigate compliance findings"
      />

      {/* ── Step 1 & 2: Select Document + Framework ──────────────── */}
      <div className="rounded-xl border bg-card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Step 1: Select Document</label>
            <Select value={selectedDocId} onValueChange={handleDocChange}>
              <SelectTrigger className="w-full h-10">
                <SelectValue placeholder="Choose a document..." />
              </SelectTrigger>
              <SelectContent>
                {docs.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>
                    <span className="flex items-center gap-2">
                      <FileText className="size-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{d.original_filename || d.filename || "Untitled"}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-semibold text-foreground mb-1.5 block">Step 2: Select Framework</label>
            <Select
              value={selectedFramework}
              onValueChange={handleFrameworkChange}
              disabled={!selectedDocId || availableFrameworks.length === 0}
            >
              <SelectTrigger className="w-full h-10">
                <SelectValue placeholder={!selectedDocId ? "Select a document first..." : "Choose a framework..."} />
              </SelectTrigger>
              <SelectContent>
                {availableFrameworks.map((fw) => {
                  const count = violations.filter((v) => v.framework === fw).length;
                  return (
                    <SelectItem key={fw} value={fw}>
                      <span className="flex items-center gap-2">
                        <Shield className="size-3.5 text-muted-foreground shrink-0" />
                        <span>{fw}</span>
                        <span className={cn("text-xs ml-auto", count > 0 ? "text-destructive font-medium" : "text-muted-foreground")}>
                          {count} violation{count !== 1 ? "s" : ""}
                        </span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

      </div>

      {/* ── Three-Column Investigation Layout ────────────────────── */}
      {selectedDocId && selectedFramework && (
        violationsLoading ? (
          <div className="flex gap-6 items-start">
            <div className="w-64 shrink-0 space-y-4">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-48 rounded-xl" />
            </div>
            <div className="flex-1 space-y-4">
              <Skeleton className="h-40 rounded-xl" />
              <Skeleton className="h-64 rounded-xl" />
            </div>
            <div className="w-80 shrink-0">
              <Skeleton className="h-32 rounded-xl" />
            </div>
          </div>
        ) : (
          <div className="flex gap-6 items-start">

            {/* ── Left Sidebar ──────────────────────────────────── */}
            <div className="w-64 shrink-0 space-y-4 sticky top-6">
              {/* Document info */}
              {selectedDoc && (
                <div className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-start gap-2.5">
                    <FileText className="size-4 text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{selectedDoc.original_filename || selectedDoc.filename}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{selectedDoc.page_count || "—"} pages</p>
                      {selectedDoc.uploaded_by_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">Uploaded by {selectedDoc.uploaded_by_name}</p>
                      )}
                    </div>
                  </div>
                  {allScannedFrameworks.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Scanned Frameworks</p>
                      <div className="flex flex-wrap gap-1">
                        {allScannedFrameworks.map((fw) => (
                          <span key={fw} className="text-[11px] bg-muted rounded px-1.5 py-0.5 text-foreground/80">{fw}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs gap-1"
                    onClick={() => navigate(`/documents/${selectedDocId}`)}
                  >
                    <ExternalLink className="size-3" /> View Document
                  </Button>
                </div>
              )}

              {/* Framework Health */}
              <div className="rounded-xl border bg-card p-4">
                <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Framework Health</h3>
                <div className="space-y-1">
                  {frameworkHealth.length > 0 ? (
                    frameworkHealth.map((fw) => (
                      <button
                        key={fw.framework}
                        onClick={() => handleFrameworkChange(fw.framework)}
                        className={cn(
                          "w-full text-left flex items-center gap-2 rounded-lg p-2 transition-colors",
                          fw.framework === selectedFramework ? "bg-primary/5 ring-1 ring-primary/20" : "hover:bg-muted/50"
                        )}
                      >
                        <span className={cn("size-2 rounded-full shrink-0", fw.score >= 75 ? "bg-success" : fw.score >= 45 ? "bg-warning" : "bg-destructive")} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-foreground truncate">{fw.framework}</span>
                            <span className={cn("text-xs font-semibold ml-2", scoreColor(fw.score))}>{fw.score}</span>
                          </div>
                          <div className="mt-1 h-1 rounded-full bg-muted">
                            <div className={cn("h-full rounded-full", scoreBg(fw.score))} style={{ width: `${fw.score}%` }} />
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-4">No violations data</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Center Investigation List ──────────────────────── */}
            <div className="flex-1 min-w-0 space-y-6">

              <ScoreSummary
                score={score}
                latestScanScore={latestScanScore}
                failedCount={failedControls.length}
                passedCount={passedControls.length}
                totalViolations={frameworkViolations.length}
                severityCounts={severityCounts}
              />

              {/* Passed Controls / Failed Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <PassedControlsTable passedControls={passedControls} />

                <ViolationsTable violations={failedControls} onSelectViolation={handleSelectViolation} />
              </div>

              {/* AI Insights */}
              <div className="rounded-xl border bg-card p-5">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">AI Insights</h3>
                {frameworkViolations.length > 0 ? (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {frameworkViolations.slice(0, 5).map((v) => (
                      <div
                        key={v.id}
                        onClick={() => handleSelectViolation(v)}
                        className="rounded-lg border border-border p-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <Sparkles className="size-3 text-primary shrink-0" />
                          <span className="text-xs font-medium text-foreground line-clamp-1">{v.title}</span>
                        </div>
                        {v.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-2">{v.description}</p>
                        )}
                        {v.recommendation && (
                          <div className="mt-1 flex items-start gap-1">
                            <CheckCircle2 className="size-3 text-success shrink-0 mt-px" />
                            <span className="text-[11px] text-success line-clamp-1">{v.recommendation}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-6 text-center">
                    <Sparkles className="size-6 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground">No insights available</p>
                    <p className="text-[11px] text-muted-foreground/60 mt-0.5">Violations will appear here with AI-generated recommendations.</p>
                  </div>
                )}
              </div>

              <ActivityTimeline items={activityItems} />

              {/* Violation Details */}
              {expandedViolation && (() => {
                const v = frameworkViolations.find((x) => x.id === expandedViolation) || failedControls.find((x) => x.id === expandedViolation);
                if (!v) return null;
                const sourceChunks = (() => {
                  try {
                    if (v.source_chunks) {
                      return typeof v.source_chunks === "string" ? JSON.parse(v.source_chunks) : v.source_chunks;
                    }
                  } catch {}
                  return null;
                })();
                return (
                  <div className="rounded-xl border bg-card overflow-hidden">
                    <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/20">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <SeverityIcon severity={v.severity} />
                        <h3 className="text-sm font-semibold text-foreground truncate">{v.title}</h3>
                        <StatusBadge variant={v.severity === "critical" ? "critical" : v.severity === "high" ? "high" : v.severity === "medium" ? "medium" : "low"}>{v.severity}</StatusBadge>
                      </div>
                      <button onClick={() => setExpandedViolation(null)} className="text-xs text-muted-foreground hover:text-foreground shrink-0">Close</button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Status</p>
                          <StatusBadge variant={
                            v.status === "resolved" || v.status === "approved" ? "success" :
                            v.status === "under_review" || v.status === "in_review" ? "info" :
                            v.status === "pending_review" ? "warning" :
                            v.status === "dismissed" ? "pending" : "info"
                          }>
                            {v.status?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) || "Open"}
                          </StatusBadge>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Confidence</p>
                          <p className={cn("text-sm font-semibold", v.confidence >= 80 ? "text-success" : v.confidence >= 60 ? "text-warning" : "text-destructive")}>
                            {v.confidence != null ? `${v.confidence}%` : "—"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Page</p>
                          <p className="text-sm font-medium text-foreground">{v.page_number != null ? `Page ${v.page_number}` : "—"}</p>
                        </div>
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Reviewer</p>
                          <div className="flex items-center gap-1">
                            {assigningId === v.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={assignName}
                                  onChange={(e) => setAssignName(e.target.value)}
                                  placeholder="Name"
                                  className="w-24 rounded border border-border px-1.5 py-0.5 text-xs"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleAssign(v);
                                    if (e.key === "Escape") { setAssigningId(null); setAssignName(""); }
                                  }}
                                />
                                <button onClick={() => handleAssign(v)} className="text-[10px] text-primary hover:text-primary/80">Save</button>
                                <button onClick={() => { setAssigningId(null); setAssignName(""); }} className="text-[10px] text-muted-foreground">Esc</button>
                              </div>
                            ) : (
                              <span
                                onClick={() => { setAssigningId(v.id); setAssignName(v.assigned_to || ""); }}
                                className="text-sm font-medium text-foreground cursor-pointer hover:text-primary"
                              >
                                {v.assigned_to || <span className="text-muted-foreground italic text-xs">Assign</span>}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {v.description && (
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Description</p>
                          <p className="text-sm text-foreground/80">{v.description}</p>
                        </div>
                      )}

                      {v.clause && (
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Regulation Clause</p>
                          <code className="text-xs bg-muted rounded px-2 py-0.5 text-foreground">{v.clause}</code>
                        </div>
                      )}

                      {v.excerpt && (
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Matched Text</p>
                          <div className="rounded-lg bg-muted/30 border border-border p-3">
                            <p className="text-xs font-mono text-foreground/80 whitespace-pre-wrap leading-relaxed">{v.excerpt}</p>
                          </div>
                        </div>
                      )}

                      {sourceChunks && sourceChunks.length > 0 && (
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Evidence ({sourceChunks.length} chunk{sourceChunks.length > 1 ? "s" : ""})</p>
                          <div className="space-y-2">
                            {sourceChunks.map((chunk, ci) => (
                              <div key={ci} className="rounded-lg bg-muted/30 border border-border p-3">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-[10px] font-medium text-muted-foreground">Chunk #{chunk.chunk_index}</span>
                                  {chunk.page_numbers?.length > 0 && (
                                    <span className="text-[10px] text-muted-foreground">— Page{chunk.page_numbers.length > 1 ? "s" : ""} {chunk.page_numbers.join(", ")}</span>
                                  )}
                                </div>
                                <p className="text-xs font-mono text-foreground/70 leading-relaxed line-clamp-4">{chunk.text_snippet}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {v.recommendation && (
                        <div>
                          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Recommended Action</p>
                          <div className="rounded-lg bg-success/5 border border-success/20 p-3">
                            <div className="flex items-start gap-2">
                              <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
                              <p className="text-sm text-foreground/80">{v.recommendation}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        {sourceChunks && sourceChunks.length > 0 && (
                          <Button variant="outline" size="sm" className="text-xs gap-1.5">
                            <Eye className="size-3.5" /> View Evidence
                          </Button>
                        )}
                        {(v.status !== "pending_review" && v.status !== "under_review" && v.status !== "resolved" && v.status !== "approved" && v.status !== "dismissed") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1.5"
                            onClick={() => handleSubmitReview(v)}
                            disabled={submittingId === v.id}
                          >
                            {submittingId === v.id ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                            Submit Review
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5"
                          onClick={() => { setAssigningId(v.id); setAssignName(v.assigned_to || ""); }}
                        >
                          <User className="size-3.5" /> Assign Reviewer
                        </Button>
                        {(v.status !== "dismissed" && v.status !== "resolved") && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs gap-1.5 text-destructive hover:text-destructive"
                            onClick={() => handleDismiss(v)}
                          >
                            <XCircle className="size-3.5" /> Dismiss
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1.5 ml-auto"
                          onClick={() => navigate(`/documents/${selectedDocId}?tab=compliance&remediate=${v.id}`)}
                        >
                          <Sparkles className="size-3.5" /> Generate Fix
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Other frameworks summary */}
              {otherFrameworkViolations.length > 0 && (
                <div className="rounded-xl border bg-card p-5">
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    Other Frameworks ({otherFrameworkViolations.length} violation{otherFrameworkViolations.length !== 1 ? "s" : ""})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {[...new Set(otherFrameworkViolations.map((v) => v.framework))].map((fw) => {
                      const count = otherFrameworkViolations.filter((v) => v.framework === fw).length;
                      const hasCritical = otherFrameworkViolations.some((v) => v.framework === fw && v.severity === "critical");
                      return (
                        <button
                          key={fw}
                          onClick={() => handleFrameworkChange(fw)}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors",
                            hasCritical ? "border-destructive/20 bg-destructive/5 text-destructive" : "border-border hover:bg-muted/50 text-foreground"
                          )}
                        >
                          <Shield className="size-3" />
                          {fw}
                          <span className={cn("font-medium", hasCritical ? "text-destructive" : "text-muted-foreground")}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <ViolationInspector
              violation={selectedViolation}
              onClose={handleCloseInspector}
              onSubmitReview={handleSubmitReview}
              submittingId={submittingId}
              assigningId={assigningId}
              assignName={assignName}
              setAssigningId={setAssigningId}
              setAssignName={setAssignName}
              onDismiss={handleDismiss}
              showCopilot={showCopilot}
              onToggleCopilot={() => setShowCopilot(!showCopilot)}
            />

          </div>
        )
      )}

      {!selectedDocId && !violationsLoading && (
        <EmptyState
          icon={Search}
          title="Select a document to begin"
          description="Choose a document from Step 1, then select a compliance framework to investigate findings."
        />
      )}

      {selectedDocId && !selectedFramework && !violationsLoading && availableFrameworks.length === 0 && (
        <EmptyState
          icon={Shield}
          title="No compliance data found"
          description="This document has no compliance scans. Run a scan first."
          action={
            <Button onClick={() => navigate(`/documents/${selectedDocId}`)} variant="outline" size="sm">
              <ExternalLink className="size-3.5" /> View Document Details
            </Button>
          }
        />
      )}
    </div>
  );
}
