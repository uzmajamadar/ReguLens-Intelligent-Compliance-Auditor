import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  TrendingUp,
  AlertTriangle,
  Activity,
  ArrowRight,
  Loader2,
  Eye,
  CheckCircle2,
  Shield,
  Clock,
  BarChart3,
  Users,
} from "lucide-react";
import { listDocuments, listScans, getReviewStats, listAllViolations, listReviewTasks } from "../lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";
import { PageHeader } from "../components/shared/PageHeader";
import { KpiCard } from "../components/shared/KpiCard";
import { StatusBadge } from "../components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function scoreColor(score) {
  if (score == null) return "text-muted-foreground";
  return score >= 75 ? "text-success" : score >= 45 ? "text-warning" : "text-destructive";
}

function scoreBarColor(score) {
  if (score == null) return "bg-muted";
  return score >= 75 ? "bg-success" : score >= 45 ? "bg-warning" : "bg-destructive";
}

function OverallScoreCard({ score }) {
  const label = score >= 75 ? "Good" : score >= 45 ? "Fair" : "At Risk";
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2.5 text-muted-foreground mb-3">
        <Shield className="size-4 shrink-0" />
        <span className="text-[11px] font-semibold uppercase tracking-wider">Compliance Score</span>
      </div>
      <div className="flex items-end gap-3">
        <span className="text-4xl font-bold tracking-tight text-foreground leading-none">
          {score != null ? score : "—"}
          {score != null && <span className="text-lg font-medium text-muted-foreground ml-0.5">%</span>}
        </span>
        <span className={cn("text-xs font-semibold mb-1", scoreColor(score))}>{label}</span>
      </div>
      <div className="mt-3 h-2 w-full rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", scoreBarColor(score))}
          style={{ width: score != null ? `${score}%` : "0%" }}
        />
      </div>
    </div>
  );
}

function FrameworkBar({ framework, score, count, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left group block space-y-1.5 rounded-lg p-2 hover:bg-muted/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring/20"
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-foreground group-hover:text-primary transition-colors">{framework}</span>
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] text-muted-foreground">{count} {count === 1 ? "finding" : "findings"}</span>
          <span className={cn("text-xs font-semibold", scoreColor(score))}>{score}%</span>
        </div>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all duration-500", scoreBarColor(score))}
          style={{ width: `${score}%` }}
        />
      </div>
    </button>
  );
}

function QuickAction({ icon: Icon, label, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 text-left hover:bg-muted/50 transition-colors"
    >
      <div className="flex size-9 items-center justify-center rounded-lg bg-muted shrink-0">
        <Icon className="size-4 text-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-px">{description}</p>}
      </div>
      <ArrowRight className="size-4 text-muted-foreground shrink-0" />
    </button>
  );
}

const deductions = { critical: 20, high: 12, medium: 7, low: 3 };

function computeFrameworkScores(violations) {
  const groups = {};
  violations.forEach((v) => {
    const fw = v.framework || "Unknown";
    if (!groups[fw]) groups[fw] = [];
    groups[fw].push(v);
  });
  return Object.entries(groups)
    .map(([framework, vs]) => ({
      framework,
      score: Math.max(0, 100 - vs.reduce((s, v) => s + (deductions[v.severity] || 7), 0)),
      count: vs.length,
    }))
    .sort((a, b) => b.score - a.score);
}

function computeOverallScore(violations) {
  const byDoc = {};
  violations.forEach((v) => {
    if (!byDoc[v.document_id]) byDoc[v.document_id] = [];
    byDoc[v.document_id].push(v);
  });
  const scores = Object.values(byDoc).map((vs) =>
    Math.max(0, 100 - vs.reduce((s, v) => s + (deductions[v.severity] || 7), 0))
  );
  return scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-2 w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Compliance() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const [loading, setLoading] = useState(true);
  const [docs, setDocs] = useState([]);
  const [violations, setViolations] = useState([]);
  const [reviewStats, setReviewStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [scansMap, setScansMap] = useState({});

  const isAdmin = hasRole("admin");
  const isReviewer = hasRole("admin", "compliance_manager", "reviewer");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const documents = await listDocuments();
      setDocs(documents);

      const [scanResults, stats, allViolations, tasks] = await Promise.all([
        Promise.all(documents.map(async (doc) => {
          try { return { docId: doc.id, scans: await listScans(doc.id) }; }
          catch { return { docId: doc.id, scans: [] }; }
        })),
        getReviewStats().catch(() => null),
        listAllViolations().catch(() => []),
        isReviewer ? listReviewTasks("", null, isAdmin ? null : user?.id).catch(() => []) : Promise.resolve([]),
      ]);

      setReviewStats(stats);
      setViolations(allViolations);
      setRecentTasks(tasks.slice(0, 5));

      const map = {};
      scanResults.forEach(({ docId, scans }) => { map[docId] = scans; });
      setScansMap(map);
    } catch (err) {
      console.error("Failed to load compliance data", err);
    } finally {
      setLoading(false);
    }
  }, [user?.name, isAdmin, isReviewer]);

  useEffect(() => { const t = setTimeout(loadData, 0); return () => clearTimeout(t); }, [loadData]);

  const latestScans = Object.entries(scansMap).map(([docId, scans]) => {
    if (!scans || scans.length === 0) return null;
    const completed = scans.filter((s) => s.status === "completed");
    if (completed.length === 0) return null;
    const latest = completed.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
    return { docId: Number(docId), ...latest };
  }).filter(Boolean);

  const scannedDocIds = new Set(latestScans.map((s) => s.docId));
  const liveViolations = violations.filter((v) => v.status !== "resolved" && v.status !== "dismissed");
  const criticalViolations = liveViolations.filter((v) => v.severity === "critical");
  const actionRequired = liveViolations.filter((v) => v.severity === "critical" || v.severity === "high").slice(0, 5);

  const overallScore = computeOverallScore(liveViolations);
  const frameworkScores = computeFrameworkScores(liveViolations);
  const pendingReview = (reviewStats?.pending_review || 0) + (reviewStats?.pending_assignment || 0);
  const docNameMap = {};
  docs.forEach((d) => { docNameMap[d.id] = d.original_filename || d.filename || "Unknown"; });

  const recentDocs = [...latestScans]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  const recentDocsWithIssues = liveViolations
    .filter((v) => v.severity === "critical" || v.severity === "high")
    .reduce((acc, v) => {
      const name = docNameMap[v.document_id] || v.document_name || `Document #${v.document_id}`;
      if (!acc.find((a) => a.document_id === v.document_id)) {
        acc.push({ document_id: v.document_id, name, severity: v.severity });
      }
      return acc;
    }, [])
    .slice(0, 5);

  if (loading) return <LoadingSkeleton />;

  return (
    <div className="space-y-6">
      <PageHeader title="Compliance Health" description="Overview of your organization's compliance posture">
        <Button onClick={loadData} variant="outline" size="sm">
          <Loader2 className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <OverallScoreCard score={overallScore} />
        <KpiCard icon={FileText} label="Documents" value={scannedDocIds.size} />
        <KpiCard icon={AlertTriangle} label="Pending Reviews" value={pendingReview} />
        <KpiCard icon={AlertTriangle} label="Critical Findings" value={criticalViolations.length} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Framework Health</h2>
            <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/compliance/details")}>
              View details <ArrowRight className="size-3" />
            </Button>
          </div>
          {frameworkScores.length > 0 ? (
            <div className="space-y-2">
              {frameworkScores.map((fw) => (
                <FrameworkBar
                  key={fw.framework}
                  framework={fw.framework}
                  score={fw.score}
                  count={fw.count}
                  onClick={() => navigate(`/compliance/details?tab=regulations&framework=${encodeURIComponent(fw.framework)}`)}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No compliance data yet. Upload and scan a document to get started.</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-foreground">Recent Activity</h2>
            {isReviewer && (
              <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={() => navigate("/compliance/review")}>
                View queue <ArrowRight className="size-3" />
              </Button>
            )}
          </div>
          {recentTasks.length > 0 ? (
            <div className="space-y-1">
              {recentTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate("/compliance/review")}
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted shrink-0">
                    <FileText className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{task.rule_name}</p>
                    <p className="text-xs text-muted-foreground truncate">{task.document_name || `Document #${task.document_id}`}</p>
                  </div>
                  <StatusBadge variant={task.status === "in_review" ? "info" : task.status === "approved" || task.status === "resolved" ? "success" : task.status === "dismissed" ? "pending" : "warning"}>
                    {task.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                  </StatusBadge>
                </div>
              ))}
            </div>
          ) : liveViolations.length > 0 ? (
            <div className="space-y-1">
              {liveViolations.slice(0, 5).map((v) => (
                <div
                  key={v.id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/documents/${v.document_id}?tab=compliance`)}
                >
                  <div className={cn("flex size-8 items-center justify-center rounded-full shrink-0", v.severity === "critical" ? "bg-red-50" : v.severity === "high" ? "bg-orange-50" : "bg-amber-50")}>
                    <AlertTriangle className={cn("size-3.5", v.severity === "critical" ? "text-red-600" : v.severity === "high" ? "text-orange-600" : "text-amber-600")} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{v.title || v.rule_name || `Violation #${v.id}`}</p>
                    <p className="text-xs text-muted-foreground truncate">{v.framework}</p>
                  </div>
                  <StatusBadge variant={v.severity === "critical" ? "critical" : v.severity === "high" ? "high" : v.severity === "medium" ? "medium" : "low"}>
                    {v.severity}
                  </StatusBadge>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">All clear — no recent activity.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {actionRequired.length > 0 && (
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Documents Requiring Attention</h2>
            <div className="space-y-1">
              {recentDocsWithIssues.map((d) => (
                <div
                  key={d.document_id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/compliance/details/${d.document_id}`)}
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-red-50 shrink-0">
                    <AlertTriangle className="size-3.5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{d.name}</p>
                    <p className="text-xs text-muted-foreground">Has critical or high severity findings</p>
                  </div>
                  <StatusBadge variant={d.severity === "critical" ? "critical" : "high"}>{d.severity}</StatusBadge>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/compliance/details?tab=violations")} className="w-full mt-3 text-muted-foreground text-xs">
              View all violations <ArrowRight className="size-3 ml-1" />
            </Button>
          </div>
        )}

        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Recent Documents</h2>
          {recentDocs.length > 0 ? (
            <div className="space-y-1">
              {recentDocs.map((s) => (
                <div
                  key={s.scan_id || s.docId}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/documents/${s.docId}?tab=compliance`)}
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted shrink-0">
                    <FileText className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{docNameMap[s.docId] || `Document #${s.docId}`}</p>
                    <p className="text-xs text-muted-foreground">{s.created_at ? new Date(s.created_at).toLocaleDateString() : ""}</p>
                  </div>
                  <span className={cn("text-xs font-semibold", scoreColor(s.score))}>{s.score != null ? `${s.score}%` : "—"}</span>
                </div>
              ))}
            </div>
          ) : docs.length > 0 ? (
            <div className="space-y-1">
              {docs.slice(0, 5).map((d) => (
                <div
                  key={d.id}
                  className="flex items-center gap-3 rounded-lg p-2 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => navigate(`/documents/${d.id}?tab=compliance`)}
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted shrink-0">
                    <FileText className="size-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{d.original_filename || d.filename}</p>
                    <p className="text-xs text-muted-foreground">Not yet scanned</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-6">No documents uploaded yet.</p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            icon={FileText}
            label="Upload Document"
            description="Add a new document for scanning"
            onClick={() => navigate("/documents")}
          />
          <QuickAction
            icon={Shield}
            label="Run Compliance Scan"
            description="Scan documents for compliance gaps"
            onClick={() => navigate("/compliance/details")}
          />
          {isReviewer && (
            <QuickAction
              icon={Eye}
              label="Review Queue"
              description={`${pendingReview} item${pendingReview !== 1 ? "s" : ""} pending review`}
              onClick={() => navigate("/compliance/review")}
            />
          )}
          <QuickAction
            icon={BarChart3}
            label="View Reports"
            description="Compliance reporting and analytics"
            onClick={() => navigate("/reports")}
          />
        </div>
      </div>
    </div>
  );
}
