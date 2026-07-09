import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText, AlertTriangle, CheckCircle2, Shield, Activity, BarChart3,
  Users, Loader2, ArrowRight, Download, FileDown, FileUp, Clock,
  Eye, XCircle, Info, BookOpen, ExternalLink, RefreshCw, Plus,
} from "lucide-react";
import {
  getReviewStats, listReviewTasks, listAllViolations, listDocuments,
  listAuditLogs, getAdminStats, getAvailableFrameworks, listUsers,
} from "../lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../components/shared/PageHeader";
import { KpiCard } from "../components/shared/KpiCard";
import { EmptyState } from "../components/shared/EmptyState";
import { StatusBadge } from "../components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";

const deductions = { critical: 20, high: 12, medium: 7, low: 3 };

function computeScore(violations) {
  return Math.max(0, 100 - violations.reduce((s, v) => (s + (deductions[v.severity] || 7)), 0));
}

function scoreColor(score) {
  if (score == null) return "text-muted-foreground";
  return score >= 75 ? "text-success" : score >= 45 ? "text-warning" : "text-destructive";
}

function scoreBg(score) {
  if (score == null) return "bg-muted";
  return score >= 75 ? "bg-success" : score >= 45 ? "bg-warning" : "bg-destructive";
}

const severityConfig = {
  critical: { label: "Critical", icon: XCircle, color: "text-destructive", bg: "bg-destructive/10 border-destructive/20", bar: "bg-destructive" },
  high: { label: "High", icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50 border-orange-200", bar: "bg-orange-500" },
  medium: { label: "Medium", icon: AlertTriangle, color: "text-warning", bg: "bg-warning/10 border-warning/20", bar: "bg-warning" },
  low: { label: "Low", icon: Info, color: "text-blue-600", bg: "bg-blue-50 border-blue-200", bar: "bg-blue-500" },
};

const FW_COLORS = {
  GDPR: "text-indigo-600 bg-indigo-50 border-indigo-200",
  HIPAA: "text-blue-600 bg-blue-50 border-blue-200",
  SOC2: "text-purple-600 bg-purple-50 border-purple-200",
  "PCI-DSS": "text-red-600 bg-red-50 border-red-200",
  ISO27001: "text-amber-600 bg-amber-50 border-amber-200",
  HR: "text-emerald-600 bg-emerald-50 border-emerald-200",
};

const FW_DOT_COLORS = {
  GDPR: "bg-indigo-500", HIPAA: "bg-blue-500", SOC2: "bg-purple-500",
  "PCI-DSS": "bg-red-500", ISO27001: "bg-amber-500", HR: "bg-emerald-500",
};

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function getFwStyle(framework) {
  return FW_COLORS[framework] || "text-gray-600 bg-gray-50 border-gray-200";
}

function getFwDot(framework) {
  return FW_DOT_COLORS[framework] || "bg-gray-400";
}

function loadRecentReports() {
  try {
    return JSON.parse(localStorage.getItem("recentReports") || "[]");
  } catch { return []; }
}

function saveRecentReports(reports) {
  try {
    localStorage.setItem("recentReports", JSON.stringify(reports.slice(0, 10)));
  } catch { /* ignore */ }
}

function SectionCard({ title, description, action, children, className }) {
  return (
    <div className={cn("rounded-xl border bg-card", className)}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function OverallScoreCard({ score, label }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2.5 text-muted-foreground mb-3">
        <Shield className="size-4 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Overall Compliance</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold tracking-tight text-foreground leading-none">
          {score != null ? score : "—"}
          {score != null && <span className="text-lg font-medium text-muted-foreground ml-0.5">%</span>}
        </span>
        <span className={cn("text-xs font-semibold mb-1", scoreColor(score))}>{label}</span>
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-500", scoreBg(score))} style={{ width: score != null ? `${score}%` : "0%" }} />
      </div>
    </div>
  );
}

function StatRow({ label, value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex-1 h-5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color || "bg-primary")} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-xs font-semibold w-10 text-right", color?.replace("bg-", "text-"))}>{value}</span>
    </div>
  );
}

function FrameworkCard({ framework, score, violations, onClick }) {
  const total = violations.length;
  const liveCount = violations.filter((v) => !["resolved", "dismissed"].includes(v.status)).length;
  return (
    <button onClick={onClick} className="rounded-xl border bg-card p-4 text-left hover:shadow-sm hover:border-foreground/20 transition-all w-full">
      <div className="flex items-center gap-2 mb-3">
        <span className={cn("size-2 rounded-full shrink-0", getFwDot(framework))} />
        <span className="text-sm font-semibold text-foreground">{framework}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={cn("text-2xl font-bold", scoreColor(score))}>{score != null ? score : "—"}</span>
        <span className="text-xs text-muted-foreground">%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted mb-3">
        <div className={cn("h-full rounded-full transition-all", scoreBg(score))} style={{ width: score != null ? `${score}%` : "0%" }} />
      </div>
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span>{total} {total === 1 ? "finding" : "findings"}</span>
        {liveCount > 0 && <span className="font-medium text-foreground">{liveCount} open</span>}
      </div>
    </button>
  );
}

function SeverityBar({ severity, count, total }) {
  const cfg = severityConfig[severity];
  const Icon = cfg.icon;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className={cn("flex size-8 items-center justify-center rounded-lg", cfg.bg)}>
        <Icon className={cn("size-4", cfg.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-foreground">{cfg.label}</span>
          <span className="text-xs text-muted-foreground">{count} ({pct}%)</span>
        </div>
        <div className="h-2 w-full rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", cfg.bar)} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

function ExportCSV({ data, filename }) {
  function handleExport() {
    if (!data || data.length === 0) return;
    const headers = Object.keys(data[0]);
    const csv = [
      headers.join(","),
      ...data.map((row) =>
        headers.map((h) => {
          const val = row[h];
          const s = val == null ? "" : String(val);
          return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(",")
      ),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${filename || "report"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={!data || data.length === 0} className="gap-1.5">
      <FileDown className="size-3.5" />
      CSV
    </Button>
  );
}

export default function Reports() {
  const navigate = useNavigate();
  const [adminStats, setAdminStats] = useState(null);
  const [reviewStats, setReviewStats] = useState(null);
  const [violations, setViolations] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [recentTasks, setRecentTasks] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [frameworks, setFrameworks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [recentReports, setRecentReports] = useState([]);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setRecentReports(loadRecentReports());
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [admStats, revStats, allViolations, docs, tasks, logs, fws, allUsers] = await Promise.all([
        getAdminStats().catch(() => null),
        getReviewStats().catch(() => null),
        listAllViolations().catch(() => []),
        listDocuments().catch(() => []),
        listReviewTasks("", null, null).catch(() => []),
        listAuditLogs({ limit: 200, offset: 0 }).catch(() => []),
        getAvailableFrameworks().catch(() => []),
        listUsers().catch(() => []),
      ]);
      setAdminStats(admStats);
      setReviewStats(revStats);
      setViolations(allViolations);
      setDocuments(docs);
      setRecentTasks(tasks.slice(0, 8));
      setAuditLogs(logs);
      setFrameworks(fws);
      setUsers(allUsers);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const activeViolations = useMemo(() => violations.filter((v) => !["resolved", "dismissed"].includes(v.status)), [violations]);
  const totalScore = useMemo(() => computeScore(violations), [violations]);

  const frameworkData = useMemo(() => {
    const groups = {};
    for (const v of violations) {
      const fw = v.framework || "Unknown";
      if (!groups[fw]) groups[fw] = [];
      groups[fw].push(v);
    }
    return Object.entries(groups)
      .map(([framework, vlist]) => ({ framework, score: computeScore(vlist), violations: vlist }))
      .sort((a, b) => a.score - b.score);
  }, [violations]);

  const severityBreakdown = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const v of violations) {
      if (counts[v.severity] != null) counts[v.severity]++;
    }
    return counts;
  }, [violations]);

  const totalViolations = useMemo(() => Object.values(severityBreakdown).reduce((a, b) => a + b, 0), [severityBreakdown]);

  const reviewFlowStats = useMemo(() => {
    const s = reviewStats || {};
    return {
      pending: (s.pending_review || 0) + (s.pending_assignment || 0),
      assigned: s.assigned || 0,
      inReview: s.in_review || 0,
      approved: (s.approved || 0) + (s.resolved || 0),
      needsFix: (s.needs_fix || 0) + (s.waiting_for_fix || 0),
      dismissed: s.dismissed || 0,
    };
  }, [reviewStats]);
  const totalReviewTasks = reviewFlowStats.pending + reviewFlowStats.assigned + reviewFlowStats.inReview + reviewFlowStats.approved + reviewFlowStats.needsFix + reviewFlowStats.dismissed;

  const auditActionCounts = useMemo(() => {
    const counts = {};
    for (const log of auditLogs) {
      counts[log.action] = (counts[log.action] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [auditLogs]);

  function generateExecutiveReport() {
    setGenerating(true);
    setTimeout(() => {
      const report = {
        id: Date.now(),
        title: `Executive Compliance Report — ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`,
        type: "executive",
        generatedAt: new Date().toISOString(),
        summary: {
          overallScore: totalScore,
          totalViolations,
          activeViolations: activeViolations.length,
          totalDocuments: documents.length,
          frameworksAssessed: frameworkData.length,
          pendingReviews: reviewFlowStats.pending,
        },
      };
      const reports = [report, ...loadRecentReports()];
      saveRecentReports(reports);
      setRecentReports(reports);
      setGenerating(false);
    }, 1200);
  }

  const csvData = useMemo(() => {
    if (violations.length === 0) return [];
    return violations.map((v) => ({
      "Violation ID": v.id,
      Title: v.title || v.rule_name || "",
      Framework: v.framework || "",
      Severity: v.severity || "",
      Status: v.status || "",
      Document: v.document_name || "",
      "Assigned To": v.assigned_to || "",
      "Created At": v.created_at ? new Date(v.created_at).toISOString() : "",
    }));
  }, [violations]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
        <div className="space-y-1"><Skeleton className="h-8 w-48" /><Skeleton className="h-4 w-72" /></div>
        <div className="flex gap-2"><Skeleton className="h-9 w-28 rounded-lg" /><Skeleton className="h-9 w-28 rounded-lg" /><Skeleton className="h-9 w-48 rounded-lg" /></div>
        <Skeleton className="h-20 rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-28 rounded-xl" /><Skeleton className="h-28 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[1,2,3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}</div>
      </div>
    );
  }

  const scoreLabel = totalScore >= 75 ? "Good" : totalScore >= 45 ? "Fair" : "At Risk";

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
      {/* ── Header ─────────────────────────────────────────────── */}
      <PageHeader title="Reports" description="Compliance reporting, risk analysis, and activity overview.">
        <div className="flex items-center gap-2">
          <ExportCSV data={csvData} filename="compliance-violations" />
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
            <Download className="size-3.5" />
            PDF
          </Button>
          <Button variant="default" size="sm" className="gap-1.5" onClick={generateExecutiveReport} disabled={generating}>
            {generating ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />}
            {generating ? "Generating..." : "Executive Report"}
          </Button>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          </Button>
        </div>
      </PageHeader>

      {/* ── Recent Generated Reports ───────────────────────────── */}
      {recentReports.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">Recent Reports</h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recentReports.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3 min-w-[240px] shrink-0">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 shrink-0">
                  <FileText className="size-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground truncate">{r.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(r.generatedAt)}</p>
                </div>
                <StatusBadge variant="success">Ready</StatusBadge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Compliance Summary ─────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Shield className="size-4 text-muted-foreground" />
          Compliance Summary
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          <OverallScoreCard score={totalScore} label={scoreLabel} />
          <KpiCard icon={FileText} label="Total Documents" value={documents.length} />
          <KpiCard icon={AlertTriangle} label="Open Violations" value={activeViolations.length} />
          <KpiCard icon={Activity} label="Pending Reviews" value={reviewFlowStats.pending} />
        </div>
      </div>

      {/* ── Framework Reports ──────────────────────────────────── */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <BookOpen className="size-4 text-muted-foreground" />
          Framework Reports
        </h2>
        {frameworkData.length === 0 ? (
          <div className="rounded-xl border bg-card p-8">
            <EmptyState icon={Shield} title="No framework data" description="Run compliance scans to generate framework reports." />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {frameworkData.map((fw) => (
              <FrameworkCard key={fw.framework} {...fw} />
            ))}
          </div>
        )}
      </div>

      {/* ── Risk & Review Reports ──────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Report */}
        <SectionCard title="Risk Report" description="Violations grouped by severity level.">
          {totalViolations === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No violations recorded.</p>
          ) : (
            <div className="space-y-3">
              {["critical", "high", "medium", "low"].map((sev) => (
                <SeverityBar key={sev} severity={sev} count={severityBreakdown[sev]} total={totalViolations} />
              ))}
            </div>
          )}
        </SectionCard>

        {/* Review Report */}
        <SectionCard
          title="Review Report"
          description="Review queue status and recent activity."
          action={
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/compliance/review")}>
              View all <ArrowRight className="size-3" />
            </Button>
          }
        >
          {totalReviewTasks === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No review activity.</p>
          ) : (
            <div className="space-y-3 mb-4">
              <StatRow label="Pending" value={reviewFlowStats.pending} total={totalReviewTasks} color="bg-amber-500" />
              <StatRow label="Assigned" value={reviewFlowStats.assigned} total={totalReviewTasks} color="bg-blue-500" />
              <StatRow label="In Review" value={reviewFlowStats.inReview} total={totalReviewTasks} color="bg-violet-500" />
              <StatRow label="Approved" value={reviewFlowStats.approved} total={totalReviewTasks} color="bg-success" />
              <StatRow label="Needs Fix" value={reviewFlowStats.needsFix} total={totalReviewTasks} color="bg-orange-500" />
              <StatRow label="Dismissed" value={reviewFlowStats.dismissed} total={totalReviewTasks} color="bg-muted-foreground" />
            </div>
          )}

          {recentTasks.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider mb-2">Recent Activity</h4>
              <div className="space-y-1">
                {recentTasks.slice(0, 4).map((task) => (
                  <div key={task.id} className="flex items-center gap-2.5 rounded-md p-2 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate("/compliance/review")}>
                    <div className={cn(
                      "flex size-6 items-center justify-center rounded-full shrink-0",
                      task.status === "in_review" ? "bg-violet-50" :
                      task.status === "approved" || task.status === "resolved" ? "bg-green-50" :
                      task.status === "needs_fix" ? "bg-orange-50" : "bg-muted"
                    )}>
                      <FileText className={cn(
                        "size-3",
                        task.status === "in_review" ? "text-violet-600" :
                        task.status === "approved" || task.status === "resolved" ? "text-success" :
                        task.status === "needs_fix" ? "text-orange-600" : "text-muted-foreground"
                      )} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{task.rule_name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{task.document_name || `Document #${task.document_id}`}</p>
                    </div>
                    <StatusBadge variant={
                      task.status === "in_review" ? "info" :
                      task.status === "approved" || task.status === "resolved" ? "success" :
                      task.status === "dismissed" ? "pending" : "warning"
                    } className="text-[10px]">
                      {task.status === "in_review" ? "In Review" :
                       task.status === "needs_fix" ? "Needs Fix" :
                       task.status === "pending_review" ? "Open" :
                       task.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                    </StatusBadge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      {/* ── Audit Report ───────────────────────────────────────── */}
      {auditLogs.length > 0 && (
        <SectionCard
          title="Audit Report"
          description="Most frequent activities across the organization."
          action={
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/admin/audit-logs")}>
              Full audit log <ArrowRight className="size-3" />
            </Button>
          }
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {auditActionCounts.map(([action, count]) => (
              <div key={action} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-primary/5 shrink-0">
                  <Activity className="size-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</p>
                  <p className="text-[11px] text-muted-foreground">{count} {count === 1 ? "event" : "events"}</p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}
