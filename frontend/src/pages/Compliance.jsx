import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  TrendingUp,
  AlertTriangle,
  Clock,
  Activity,
  ArrowRight,
  Loader2,
  Eye,
  AlertCircle,
  Lightbulb,
  CheckCircle2,
  XCircle,
  ClipboardCheck,
} from "lucide-react";
import { listDocuments, listScans, getReviewStats, listAllViolations, listReviewTasks } from "../lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "../context/AuthContext";

const severityConfig = {
  critical: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", dot: "bg-red-500", badge: "bg-red-100 text-red-700 border-red-200" },
  high: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-500", badge: "bg-orange-100 text-orange-700 border-orange-200" },
  medium: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", dot: "bg-amber-500", badge: "bg-amber-100 text-amber-700 border-amber-200" },
  low: { bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700 border-blue-200" },
};

const ded = { critical: 20, high: 12, medium: 7, low: 3 };

function KpiCard({ icon: Icon, label, value, variant }) {
  const v = {
    default: { card: "", icon: "text-primary bg-primary/10", value: "text-foreground" },
    success: { card: "bg-green-50 border-green-200", icon: "text-green-600 bg-green-100", value: "text-green-600" },
    warning: { card: "bg-amber-50 border-amber-200", icon: "text-amber-600 bg-amber-100", value: "text-amber-600" },
    danger: { card: "bg-red-50 border-red-200", icon: "text-red-600 bg-red-100", value: "text-red-600" },
  }[variant] || {};
  return (
    <div className={`flex items-center gap-4 rounded-xl border p-5 ${v.card}`}>
      <div className={`flex size-12 shrink-0 items-center justify-center rounded-xl ${v.icon}`}>
        <Icon className="size-6" />
      </div>
      <div className="min-w-0">
        <p className={`text-2xl font-bold ${v.value}`}>{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function scoreColor(score) {
  if (score == null) return "text-muted-foreground";
  return score >= 75 ? "text-green-600" : score >= 45 ? "text-amber-600" : "text-red-600";
}

function scoreBg(score) {
  if (score == null) return "bg-gray-300";
  return score >= 75 ? "bg-green-500" : score >= 45 ? "bg-amber-500" : "bg-red-500";
}

export default function Compliance() {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();

  if (user?.role === "employee") return <EmployeeView />;
  if (user?.role === "reviewer") return <ReviewerView />;
  return <ManagerView />;
}


function EmployeeView() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [scansMap, setScansMap] = useState({});
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const documents = await listDocuments();
      setDocs(documents);
      const scanPromises = await Promise.all(documents.map(async (doc) => {
        try { const scans = await listScans(doc.id); return { docId: doc.id, scans }; }
        catch { return { docId: doc.id, scans: [] }; }
      }));
      const map = {};
      scanPromises.forEach(({ docId, scans }) => { map[docId] = scans; });
      setScansMap(map);
      const allViolations = await listAllViolations().catch(() => []);
      setViolations(allViolations);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { const t = setTimeout(loadData, 0); return () => clearTimeout(t); }, [loadData]);

  const latestScans = Object.values(scansMap).flatMap((scans) => scans || []);
  const openCount = violations.filter((v) => v.status !== "resolved" && v.status !== "dismissed").length;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">My Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your documents, scans, and violations</p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm"><Activity className="size-4" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard icon={FileText} label="My Documents" value={docs.length} variant={docs.length > 0 ? "success" : "default"} />
        <KpiCard icon={Activity} label="My Scans" value={latestScans.length} variant={latestScans.length > 0 ? "success" : "default"} />
        <KpiCard icon={AlertTriangle} label="Open Violations" value={openCount} variant={openCount > 0 ? "danger" : "success"} />
      </div>

      {/* My Recent Documents */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">My Recent Documents</h2>
        {docs.length > 0 ? (
          <div className="space-y-2">
            {docs.slice(0, 5).map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <p className="text-sm font-medium text-foreground truncate">{d.original_filename || d.filename}</p>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/compliance/details/${d.id}`)}>View</Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No documents yet. Upload a document to get started.</p>
        )}
        <Button variant="ghost" size="sm" onClick={() => navigate("/storage")} className="w-full mt-3 text-muted-foreground">
          Upload Document <ArrowRight className="size-3.5 ml-1" />
        </Button>
      </div>

      {/* My Open Violations */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">My Open Violations</h2>
        {violations.filter((v) => v.status !== "resolved" && v.status !== "dismissed").length > 0 ? (
          <div className="space-y-2">
            {violations.filter((v) => v.status !== "resolved" && v.status !== "dismissed").slice(0, 5).map((v) => (
              <div key={v.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{v.title}</p>
                  <p className="text-xs text-muted-foreground">{v.framework} · {v.severity}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/compliance/details/${v.document_id}?remediate=${v.id}`)}>Fix</Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No open violations — great job!</p>
        )}
        <Button variant="ghost" size="sm" onClick={() => navigate("/compliance/details?tab=violations")} className="w-full mt-3 text-muted-foreground">
          View All Violations <ArrowRight className="size-3.5 ml-1" />
        </Button>
      </div>
    </div>
  );
}


function ReviewerView() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [recentTasks, setRecentTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const s = await getReviewStats();
      setStats(s);
      const tasks = await listReviewTasks("", null, user?.name);
      setRecentTasks(tasks.slice(0, 5));
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [user?.name]);

  useEffect(() => { const t = setTimeout(loadData, 0); return () => clearTimeout(t); }, [loadData]);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div>;

  const pendingAssign = stats?.pending_assignment || 0;
  const assigned = stats?.assigned || 0;
  const inReview = stats?.in_review || 0;
  const approved = stats?.approved || 0;
  const dismissed = stats?.dismissed || 0;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Review Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">My assigned reviews and recent activity</p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm"><Activity className="size-4" /> Refresh</Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <KpiCard icon={ClipboardCheck} label="Pending Assign" value={pendingAssign} variant={pendingAssign > 0 ? "warning" : "default"} />
        <KpiCard icon={Eye} label="Assigned" value={assigned} variant={assigned > 0 ? "warning" : "default"} />
        <KpiCard icon={CheckCircle2} label="Approved" value={approved} variant={approved > 0 ? "success" : "default"} />
        <KpiCard icon={XCircle} label="Dismissed" value={dismissed} variant={dismissed > 0 ? "default" : "default"} />
      </div>

      {/* Open Review Queue */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Open Reviews</h2>
        <div className="space-y-2">
          {[
            { label: "Pending Assignment", count: pendingAssign, color: "text-indigo-600", dot: "bg-indigo-500" },
            { label: "Assigned", count: assigned, color: "text-blue-600", dot: "bg-blue-500" },
            { label: "In Review", count: inReview, color: "text-amber-600", dot: "bg-amber-500" },
          ].map(({ label, count, color, dot }) => (
            <div key={label} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div className="flex items-center gap-2">
                <span className={`size-2.5 rounded-full ${dot}`} />
                <span className="text-sm text-foreground">{label}</span>
              </div>
              <span className={`text-sm font-bold ${color}`}>{count}</span>
            </div>
          ))}
        </div>
        <Button variant="default" size="sm" onClick={() => navigate("/compliance/review")} className="w-full mt-3">
          Open Review Queue <ArrowRight className="size-3.5 ml-1" />
        </Button>
      </div>

      {/* Recent Tasks */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">Recent Tasks</h2>
        {recentTasks.length > 0 ? (
          <div className="space-y-2">
            {recentTasks.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-border p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{t.rule_name || t.rule_id}</p>
                  <p className="text-xs text-muted-foreground">{t.framework} · {t.status}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate("/compliance/review")}>View</Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No recent tasks</p>
        )}
      </div>
    </div>
  );
}


function ManagerView() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [scansMap, setScansMap] = useState({});
  const [reviewStats, setReviewStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const [allViolations, setAllViolations] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const documents = await listDocuments();
      setDocs(documents);

      const [scanPromises, stats, violations] = await Promise.all([
        Promise.all(documents.map(async (doc) => {
          try {
            const scans = await listScans(doc.id);
            return { docId: doc.id, scans };
          } catch {
            return { docId: doc.id, scans: [] };
          }
        })),
        getReviewStats().catch(() => null),
        listAllViolations().catch(() => []),
      ]);
      setReviewStats(stats);
      setAllViolations(violations);

      const map = {};
      scanPromises.forEach(({ docId, scans }) => {
        map[docId] = scans;
      });
      setScansMap(map);
    } catch (err) {
      console.error("Failed to load compliance data", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => { loadData(); }, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  // ── Derived Data ──────────────────────────────────────────

  const latestScans = Object.entries(scansMap).map(([docId, scans]) => {
    if (!scans || scans.length === 0) return null;
    const latest = scans.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
    return { docId: Number(docId), ...latest };
  }).filter(Boolean);

  const scannedDocIds = new Set(latestScans.map((s) => s.docId));
  const liveViolations = allViolations || [];

  const docNameMap = {};
  docs.forEach((d) => { docNameMap[d.id] = d.original_filename || d.filename || "Unknown"; });

  // KPI values
  const openViolations = liveViolations.filter((v) => v.status !== "resolved" && v.status !== "dismissed").length;
  const pendingReview = reviewStats?.pending_review ?? 0;

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  liveViolations.forEach((v) => { if (severityCounts[v.severity] != null) severityCounts[v.severity]++; });

  // Per-framework compliance score
  const frameworkViolations = {};
  liveViolations.forEach((v) => {
    if (!frameworkViolations[v.framework]) frameworkViolations[v.framework] = [];
    frameworkViolations[v.framework].push(v);
  });
  const frameworkScores = Object.entries(frameworkViolations)
    .map(([fw, vs]) => ({
      framework: fw,
      score: Math.max(0, 100 - vs.reduce((sum, v) => sum + (ded[v.severity] || 7), 0)),
      count: vs.length,
    }))
    .sort((a, b) => b.score - a.score);

  // Overall health score (average per-document score)
  const violationsByDoc = {};
  liveViolations.forEach((v) => {
    if (!violationsByDoc[v.document_id]) violationsByDoc[v.document_id] = [];
    violationsByDoc[v.document_id].push(v);
  });
  const docScores = Object.values(violationsByDoc).map((vs) =>
    Math.max(0, 100 - vs.reduce((sum, v) => sum + (ded[v.severity] || 7), 0))
  );
  const avgScore = docScores.length ? Math.round(docScores.reduce((a, b) => a + b, 0) / docScores.length) : null;

  // Action Required — top critical/high violations
  const actionRequired = liveViolations
    .filter((v) => v.severity === "critical" || v.severity === "high")
    .slice(0, 5);

  // Recent Scans — latest 5 by date
  const recentScans = [...latestScans]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 5);

  // AI Insight — riskiest framework
  const riskiest = frameworkScores.length > 0
    ? frameworkScores.reduce((a, b) => (a.count > b.count ? a : b))
    : null;
  const aiInsight = riskiest
    ? {
        framework: riskiest.framework,
        criticalHigh: liveViolations.filter(
          (v) => v.framework === riskiest.framework && (v.severity === "critical" || v.severity === "high")
        ).length,
        currentScore: riskiest.score,
        projectedScore: Math.min(100, riskiest.score + 15),
      }
    : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">ReguLens AI Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            How compliant are we? What needs attention? What should I do next?
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          <Activity className="size-4" />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={FileText} label="Documents Scanned" value={scannedDocIds.size} variant={scannedDocIds.size > 0 ? "success" : "default"} />
        <KpiCard icon={TrendingUp} label="Compliance Health" value={avgScore != null ? `${avgScore}%` : "N/A"} variant={avgScore >= 75 ? "success" : avgScore >= 45 ? "warning" : "danger"} />
        <KpiCard icon={AlertTriangle} label="Open Violations" value={openViolations} variant={openViolations > 0 ? "danger" : "success"} />
        <KpiCard icon={Clock} label="Pending Reviews" value={pendingReview} variant={pendingReview > 0 ? "warning" : "success"} />
      </div>

      {/* Compliance Health + Risk Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Compliance Health</h2>
          {frameworkScores.length > 0 ? (
            <div className="space-y-3">
              {frameworkScores.map(({ framework, score }) => (
                <div key={framework}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-foreground">{framework}</span>
                    <span className={scoreColor(score)}>{score}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className={`h-full rounded-full transition-all duration-500 ${scoreBg(score)}`} style={{ width: `${score}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No compliance data yet</p>
          )}
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Risk Distribution</h2>
          <div className="space-y-2">
            {["critical", "high", "medium", "low"].map((sev) => {
              const c = severityConfig[sev];
              return (
                <div key={sev} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${c.bg}`}>
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${c.dot}`} />
                    <span className={`text-sm font-medium capitalize ${c.text}`}>{sev}</span>
                  </div>
                  <span className={`text-sm font-bold ${c.text}`}>{severityCounts[sev]}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Required */}
      {actionRequired.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertCircle className="size-4 text-red-600" />
            <h2 className="text-sm font-semibold text-foreground">Action Required</h2>
          </div>
          <div className="space-y-3">
            {actionRequired.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-foreground">{v.title}</span>
                    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium capitalize ${severityConfig[v.severity]?.badge}`}>
                      {v.severity}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{docNameMap[v.document_id] || v.document_name || "Unknown"}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => navigate("/compliance/review")}>
                    <Eye className="size-3.5 mr-1" />
                    Review
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/compliance/details/${v.document_id}`)}>
                    View
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Scans + Review Queue */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Recent Scans</h2>
          {recentScans.length > 0 ? (
            <div className="space-y-2">
              {recentScans.map((s) => (
                <div key={s.scan_id || s.docId} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{docNameMap[s.docId] || "Unknown"}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className={`text-sm font-bold ${scoreColor(s.score)}`}>
                      {s.score != null ? `${s.score}%` : "---"}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => navigate(`/compliance/details/${s.docId}`)}>
                      View
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No scans yet</p>
          )}
          <Button variant="ghost" size="sm" onClick={() => navigate("/compliance/details")} className="w-full mt-3 text-muted-foreground">
            View All Documents
            <ArrowRight className="size-3.5 ml-1" />
          </Button>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Review Queue</h2>
          {reviewStats ? (
            <div className="space-y-2">
              {[
                { label: "Open Reviews", count: reviewStats.pending_review || 0, color: "text-amber-600", dot: "bg-amber-500" },
                { label: "Needs Fix", count: reviewStats.needs_fix || 0, color: "text-red-600", dot: "bg-red-500" },
                { label: "Approved", count: reviewStats.approved || 0, color: "text-green-600", dot: "bg-green-500" },
                { label: "Dismissed", count: reviewStats.dismissed || 0, color: "text-gray-600", dot: "bg-gray-500" },
              ].map(({ label, count, color, dot }) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${dot}`} />
                    <span className="text-sm text-foreground">{label}</span>
                  </div>
                  <span className={`text-sm font-bold ${color}`}>{count}</span>
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => navigate("/compliance/review")} className="w-full mt-2 text-muted-foreground">
                View All Reviews
                <ArrowRight className="size-3.5 ml-1" />
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No review data yet</p>
          )}
        </div>
      </div>

      {/* AI Insights */}
      {aiInsight && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="size-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-foreground">AI Compliance Insights</h2>
          </div>
          <p className="text-sm text-foreground">
            Your largest compliance risk is <strong>{aiInsight.framework}</strong> with{" "}
            <strong>{aiInsight.criticalHigh}</strong> critical or high findings. Fixing these could
            improve your compliance score from{" "}
            <span className={scoreColor(aiInsight.currentScore)}>{aiInsight.currentScore}%</span> →{" "}
            <span className="text-green-600">{aiInsight.projectedScore}%</span>.
          </p>
        </div>
      )}
    </div>
  );
}
