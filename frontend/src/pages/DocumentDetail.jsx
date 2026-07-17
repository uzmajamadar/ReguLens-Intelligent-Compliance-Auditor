import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  FileText, ArrowLeft, Shield, MessageSquare, Play, Loader2,
  CheckCircle2, XCircle, Clock, AlertTriangle, ChevronRight,
  Sparkles, Eye, Scan, Download, FileCheck, User, Calendar,
  ArrowUpRight, Upload,
} from "lucide-react";
import { fetchDocument, listScans, getScanDetail, runScan, listAllViolations, getDocumentDiff } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import RemediationCopilot from "../components/RemediationCopilot";
import UploadDialog from "../components/UploadDialog";
import { StatusBadge } from "../components/shared/StatusBadge";
import { cn } from "@/lib/utils";

const ALL_FRAMEWORKS = [
  { id: "GDPR", label: "GDPR" },
  { id: "HIPAA", label: "HIPAA" },
  { id: "SOC2", label: "SOC2" },
  { id: "PCI-DSS", label: "PCI-DSS" },
  { id: "ISO27001", label: "ISO27001" },
  { id: "HR", label: "HR" },
  { id: "Guardrails & Safety", label: "Guardrails & Safety" },
  { id: "Document Lifecycle & Grounding", label: "Document Lifecycle & Grounding" },
];

const FW_DOT_COLORS = {
  GDPR: "bg-indigo-500", HIPAA: "bg-blue-500", SOC2: "bg-purple-500",
  "PCI-DSS": "bg-red-500", ISO27001: "bg-amber-500", HR: "bg-emerald-500",
  "Guardrails & Safety": "bg-orange-500",
  "Document Lifecycle & Grounding": "bg-teal-500",
};

const FW_COLORS = {
  GDPR: "text-indigo-600 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-900/20 dark:border-indigo-800",
  HIPAA: "text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-300 dark:bg-blue-900/20 dark:border-blue-800",
  SOC2: "text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-900/20 dark:border-purple-800",
  "PCI-DSS": "text-red-600 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/20 dark:border-red-800",
  ISO27001: "text-amber-600 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-900/20 dark:border-amber-800",
  HR: "text-emerald-600 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-800",
  "Guardrails & Safety": "text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-900/20 dark:border-orange-800",
  "Document Lifecycle & Grounding": "text-teal-600 bg-teal-50 border-teal-200 dark:text-teal-300 dark:bg-teal-900/20 dark:border-teal-800",
};

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
  catch { return "—"; }
}

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  try { return new Date(dateStr).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return "—"; }
}

function scoreClass(score) {
  if (score == null) return "text-muted-foreground";
  return score >= 75 ? "text-success" : score >= 45 ? "text-warning" : "text-destructive";
}

function scoreBgClass(score) {
  if (score == null) return "bg-muted";
  return score >= 75 ? "bg-success" : score >= 45 ? "bg-warning" : "bg-destructive";
}

function ScanStatusIcon({ status }) {
  if (status === "completed") return <CheckCircle2 className="size-4 text-success" />;
  if (status === "running") return <Loader2 className="size-4 text-info animate-spin" />;
  if (status === "failed") return <XCircle className="size-4 text-destructive" />;
  return <Clock className="size-4 text-muted-foreground" />;
}

function SummaryRow({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <Icon className="size-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground min-w-24">{label}</span>
      <span className="text-xs font-medium text-foreground">{value}</span>
    </div>
  );
}

function FrameworkBadge({ name }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium", FW_COLORS[name] || "text-muted-foreground bg-muted border-border")}>
      <span className={cn("size-1.5 rounded-full mr-1.5", FW_DOT_COLORS[name] || "bg-muted-foreground")} />
      {name}
    </span>
  );
}

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [doc, setDoc] = useState(null);
  const [scans, setScans] = useState([]);
  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(tabParam === "compliance" ? "compliance" : "overview");
  const [selectedFramework, setSelectedFramework] = useState(null);
  const [scanDetails, setScanDetails] = useState({});
  const [remediateViolation, setRemediateViolation] = useState(null);
  const [selectedFrameworks, setSelectedFrameworks] = useState(new Set());
  const [customChecked, setCustomChecked] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [diffOldVer, setDiffOldVer] = useState(null);
  const [diffNewVer, setDiffNewVer] = useState(null);
  const [diffData, setDiffData] = useState(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState(null);

  async function loadScanDetail(scanId) {
    if (scanDetails[scanId]) return;
    try {
      const detail = await getScanDetail(id, scanId);
      setScanDetails((prev) => ({ ...prev, [scanId]: detail }));
    } catch (err) { console.error("Failed to load scan detail", err); }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [docData, scansData, violationsData] = await Promise.all([
          fetchDocument(id),
          listScans(id),
          listAllViolations({ document_id: id }).catch(() => []),
        ]);
        if (!cancelled) {
          setDoc(docData);
          setScans(scansData);
          setViolations(violationsData);
          if (scansData.length > 0) {
            loadScanDetail(scansData[0].scan_id || scansData[0].id);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const remediateId = searchParams.get("remediate");
    if (remediateId && violations.length > 0) {
      const target = violations.find((v) => v.id === Number(remediateId) || v.violation_id === Number(remediateId));
      if (target) {
        // schedule state update async to avoid synchronous setState inside effect
        // which can cause cascading renders
        setTimeout(() => setRemediateViolation(target), 0);
      }
    }
  }, [searchParams, violations]);

  function toggleFramework(fwId) {
    setSelectedFrameworks((prev) => {
      const next = new Set(prev);
      next.has(fwId) ? next.delete(fwId) : next.add(fwId);
      return next;
    });
  }

  function selectAll() { setSelectedFrameworks(new Set(ALL_FRAMEWORKS.map((f) => f.id))); }
  function clearAll() { setSelectedFrameworks(new Set()); }

  async function handleScan() {
    const fwArray = [...selectedFrameworks];
    if (customChecked && customName.trim()) fwArray.push(customName.trim());
    if (fwArray.length === 0) return;
    setScanning(true);
    setError(null);
    try {
      if (fwArray.length === 1 && !customChecked) {
        const newScan = await runScan(id, fwArray[0]);
        setScans((prev) => [newScan, ...prev]);
      } else {
        const result = await runScan(id, fwArray, customChecked ? customName.trim() : null, customChecked ? customDescription.trim() : null);
        setScans((prev) => [...(result.scans || [result]), ...prev]);
      }
    } catch (err) { setError(err.message); }
    finally { setScanning(false); }
  }

  const groupedScans = useMemo(() => {
    const groups = {};
    scans.forEach((s) => {
      const key = s.scan_group_id || `single_${s.scan_id}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(s);
    });
    return groups;
  }, [scans]);

  const scanVersions = useMemo(() => {
    return Object.entries(groupedScans)
      .map(([groupId, group]) => {
        const completed = group.filter((s) => s.status === "completed");
        const avgScore = completed.length > 0
          ? Math.round(completed.reduce((sum, s) => sum + (s.score || 0), 0) / completed.length)
          : null;
        return {
          groupId,
          scans: group,
          score: avgScore,
          date: group.reduce((latest, s) => {
            const d = new Date(s.created_at || 0);
            return d > latest ? d : latest;
          }, new Date(0)),
          frameworks: [...new Set(group.map((s) => s.framework).filter(Boolean))],
          isRunning: group.some((s) => s.status === "running"),
          violations: group.reduce((sum, s) => sum + (s.violation_count || 0), 0),
        };
      })
      .sort((a, b) => b.date - a.date);
  }, [groupedScans]);

  const latestScan = scanVersions[0] || null;

  const frameworkScores = useMemo(() => {
    if (!latestScan) return [];
    return latestScan.scans
      .filter((s) => s.score != null)
      .map((s) => ({
        framework: s.framework,
        score: s.score,
        grade: s.grade,
        violations: s.violation_count || 0,
        scanId: s.scan_id || s.id,
      }));
  }, [latestScan]);

  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    violations.forEach((v) => { if (counts[v.severity] != null) counts[v.severity]++; });
    return counts;
  }, [violations]);

  const selectedFrameworkDetail = selectedFramework
    ? frameworkScores.find((f) => f.framework === selectedFramework)
    : frameworkScores[0];

  function handleFrameworkClick(fw) {
    setSelectedFramework(fw.framework);
    loadScanDetail(fw.scanId);
    setActiveTab("compliance");
  }

  async function handleCompareDiff(v1, v2) {
    setDiffOldVer(v1);
    setDiffNewVer(v2);
    setDiffLoading(true);
    setDiffError(null);
    try {
      const data = await getDocumentDiff(id, v1, v2);
      setDiffData(data);
    } catch (err) {
      setDiffError(err.message);
      setDiffData(null);
    } finally {
      setDiffLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-7 w-72" />
            <Skeleton className="h-4 w-48" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-9 w-24" />
            <Skeleton className="h-9 w-28" />
          </div>
        </div>
        <div className="flex gap-1 rounded-lg bg-muted p-0.5 w-fit">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-24 rounded-md" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-48 rounded-xl col-span-1 lg:col-span-2" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-2">
          <AlertTriangle className="size-4" /> {error}
        </div>
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted mb-4">
          <FileText className="size-6 text-muted-foreground" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">Document not found</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md">The document you're looking for doesn't exist or you don't have access to it.</p>
        <Button onClick={() => navigate("/documents")} className="mt-4 gap-2" size="sm">
          <ArrowLeft className="size-4" /> Back to Documents
        </Button>
      </div>
    );
  }

  const versionCount = scanVersions.length;
  const docFrameworks = doc.frameworks || [];

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-6">
      {/* ── Page Header ─────────────────────────────────────────── */}
      <div className="mb-6">
        <button onClick={() => navigate("/documents")} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-2">
          <ArrowLeft className="size-3.5" /> Back to Documents
        </button>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">
              {doc.original_filename || doc.filename || "Untitled"}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              <span>v{versionCount || 1}</span>
              <span>·</span>
              <span>{doc.page_count ? `${doc.page_count} pages` : "—"}</span>
              <span>·</span>
              <span>{formatDate(doc.upload_time || doc.created_at)}</span>
              {doc.uploaded_by_name && (
                <>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <User className="size-3" /> {doc.uploaded_by_name}
                  </span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mt-2.5">
              {latestScan && (
                <span className={cn("text-lg font-bold leading-none", scoreClass(latestScan.score))}>
                  {latestScan.score}<span className="text-xs font-medium text-muted-foreground ml-0.5">%</span>
                </span>
              )}
              {latestScan ? (
                <StatusBadge variant={latestScan.isRunning ? "info" : "success"}>
                  {latestScan.isRunning ? "Scanning" : "Scanned"}
                </StatusBadge>
              ) : doc.status === "error" ? (
                <StatusBadge variant="destructive">Error</StatusBadge>
              ) : (
                <StatusBadge variant="pending">{doc.status || "Uploaded"}</StatusBadge>
              )}
              {latestScan && latestScan.frameworks.map((fw) => (
                <FrameworkBadge key={fw} name={fw} />
              ))}
              {!latestScan && docFrameworks.map((fw) => (
                <FrameworkBadge key={fw} name={fw} />
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="size-3.5" /> New Version
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate(`/auditor-ai?documentId=${doc.id}`)}>
              <MessageSquare className="size-3.5" /> Chat
            </Button>
            <Button onClick={() => setActiveTab("compliance")} variant="outline" size="sm">
              <Eye className="size-3.5" /> Compliance
            </Button>
          </div>
        </div>
      </div>

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={() => window.location.reload()} />

      {/* ── Scan Action Bar ─────────────────────────────────────── */}
      <div className="mb-6 rounded-lg border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            <span className="text-sm font-medium">Run Compliance Scan</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll} className="text-xs h-7">Select All</Button>
            <Button variant="ghost" size="sm" onClick={clearAll} className="text-xs h-7">Clear</Button>
            <Button
              onClick={handleScan}
              disabled={scanning || (selectedFrameworks.size === 0 && !(customChecked && customName.trim()))}
              size="sm"
              className="gap-1.5 h-7 text-xs"
            >
              {scanning ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
              {scanning ? "Scanning..." : "Run Scan"}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_FRAMEWORKS.map((fw) => {
            const checked = selectedFrameworks.has(fw.id);
            return (
              <label
                key={fw.id}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer transition-colors text-xs",
                  checked ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50"
                )}
              >
                <input type="checkbox" checked={checked} onChange={() => toggleFramework(fw.id)} className="size-3 accent-primary" />
                <span className={cn("size-1.5 rounded-full", FW_DOT_COLORS[fw.id] || "bg-gray-500")} />
                {fw.label}
              </label>
            );
          })}
          <label
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 cursor-pointer transition-colors text-xs",
              customChecked ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted/50"
            )}
          >
            <input type="checkbox" checked={customChecked} onChange={() => setCustomChecked(!customChecked)} className="size-3 accent-primary" />
            Custom
          </label>
        </div>
        {customChecked && (
          <div className="mt-3 space-y-2">
            <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Regulation name (e.g., CCPA)" className="h-8 text-xs" />
            <Textarea value={customDescription} onChange={(e) => setCustomDescription(e.target.value)} placeholder="What should we check?" rows={1} className="text-xs min-h-0" />
          </div>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="compliance" className="text-xs">Compliance</TabsTrigger>
          <TabsTrigger value="versions" className="text-xs">Versions</TabsTrigger>
          <TabsTrigger value="activity" className="text-xs">Activity</TabsTrigger>
          <TabsTrigger value="review-history" className="text-xs">Review History</TabsTrigger>
        </TabsList>

        {/* ═══ OVERVIEW TAB ═══════════════════════════════════════ */}
        <TabsContent value="overview" className="mt-0 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Summary</h2>
              {latestScan ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-2xl font-bold", scoreClass(latestScan.score))}>{latestScan.score}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                    <div className="h-2 w-32 rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", scoreBgClass(latestScan.score))} style={{ width: `${latestScan.score}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{latestScan.violations}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Violations</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-2xl font-bold text-foreground">{latestScan.frameworks.length}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Frameworks</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-2xl font-bold text-success">{severityCounts.critical}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Critical</p>
                    </div>
                    <div className="rounded-lg bg-muted/30 p-3 text-center">
                      <p className="text-2xl font-bold text-warning">{severityCounts.high + severityCounts.medium}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Medium/High</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {latestScan.frameworks.map((fw) => (
                      <button
                        key={fw}
                        onClick={() => {
                          const fws = frameworkScores.find((f) => f.framework === fw);
                          if (fws) handleFrameworkClick(fws);
                        }}
                        className="flex items-center gap-1.5 rounded-md border border-border bg-muted/20 px-2 py-1 text-xs hover:bg-muted/50 transition-colors"
                      >
                        <FrameworkBadge name={fw} />
                        <ArrowUpRight className="size-3 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Shield className="size-8 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">No scans yet. Select frameworks above and run a scan.</p>
                </div>
              )}
            </div>

            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Document Info</h2>
              <SummaryRow icon={FileText} label="Name" value={doc.original_filename || doc.filename || "—"} />
              <SummaryRow icon={Calendar} label="Uploaded" value={formatDate(doc.upload_time || doc.created_at)} />
              <SummaryRow icon={User} label="Owner" value={doc.uploaded_by_name || "—"} />
              <SummaryRow icon={FileText} label="Pages" value={String(doc.page_count || "—")} />
              <SummaryRow icon={FileText} label="Size" value={doc.file_size ? `${(doc.file_size / 1024).toFixed(1)} KB` : "—"} />
              <SummaryRow icon={Shield} label="Scans" value={String(scanVersions.length)} />
              <SummaryRow icon={Shield} label="Frameworks" value={String(docFrameworks.length || latestScan?.frameworks.length || 0)} />
              <SummaryRow icon={CheckCircle2} label="Status" value={doc.status || "—"} />
            </div>
          </div>

          {latestScan && (
            <div className="rounded-xl border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground mb-4">Recent Scan Results</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {latestScan.scans.filter((s) => s.score != null).map((s) => (
                  <div
                    key={s.scan_id || s.id}
                    onClick={() => {
                      const fws = frameworkScores.find((f) => f.framework === s.framework);
                      if (fws) handleFrameworkClick(fws);
                    }}
                    className="rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <FrameworkBadge name={s.framework} />
                      {s.grade && (
                        <span className={cn(
                          "flex size-7 items-center justify-center rounded-full text-xs font-bold",
                          s.grade === "A" ? "bg-success/10 text-success" :
                          s.grade === "B" ? "bg-success/10 text-success" :
                          s.grade === "C" ? "bg-warning/10 text-warning" :
                          "bg-destructive/10 text-destructive"
                        )}>
                          {s.grade}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={cn("text-lg font-bold", scoreClass(s.score))}>{s.score}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                    <p className={cn("text-xs mt-1 font-medium", (s.violation_count || 0) > 0 ? "text-destructive" : "text-success")}>
                      {(s.violation_count || 0) > 0 ? `${s.violation_count} violation(s)` : "No violations"}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══ COMPLIANCE TAB ═════════════════════════════════════ */}
        <TabsContent value="compliance" className="mt-0 space-y-6">
          {frameworkScores.length > 0 ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                {frameworkScores.map((fw) => (
                  <div
                    key={fw.framework}
                    onClick={() => {
                      setSelectedFramework(fw.framework);
                      loadScanDetail(fw.scanId);
                    }}
                    className={cn(
                      "rounded-xl border p-4 cursor-pointer transition-all",
                      selectedFramework === fw.framework ? "border-primary bg-primary/5 shadow-sm" : "border-border bg-card hover:border-primary/30 hover:shadow-sm"
                    )}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <FrameworkBadge name={fw.framework} />
                      {fw.grade && (
                        <span className={cn(
                          "flex size-8 items-center justify-center rounded-full text-sm font-bold",
                          fw.grade === "A" ? "bg-success/10 text-success" :
                          fw.grade === "B" ? "bg-success/10 text-success" :
                          fw.grade === "C" ? "bg-warning/10 text-warning" :
                          "bg-destructive/10 text-destructive"
                        )}>
                          {fw.grade}
                        </span>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className={cn("text-xl font-bold", scoreClass(fw.score))}>{fw.score}</span>
                      <span className="text-xs text-muted-foreground">/100</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", scoreBgClass(fw.score))} style={{ width: `${fw.score}%` }} />
                    </div>
                    <p className={cn("text-xs mt-2", fw.violations > 0 ? "text-destructive" : "text-success")}>
                      {fw.violations > 0 ? `${fw.violations} violation(s)` : "All passed"}
                    </p>
                  </div>
                ))}
              </div>

              {selectedFrameworkDetail && (() => {
                const detail = scanDetails[selectedFrameworkDetail.scanId];
                const violations_list = detail?.violations || [];
                const evaluations = detail?.evaluations || [];
                const passed = evaluations.filter((e) => e.status === "passed");
                const failed = evaluations.filter((e) => e.status === "failed" || e.status === "warning" || e.status === "error");

                return (
                  <div className="space-y-4">
                    <div className="rounded-xl border bg-card p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-foreground">
                          Controls — <FrameworkBadge name={selectedFrameworkDetail.framework} />
                        </h2>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><CheckCircle2 className="size-3.5 text-success" /> {passed.length} passed</span>
                          <span className="flex items-center gap-1"><XCircle className="size-3.5 text-destructive" /> {failed.length} failed</span>
                        </div>
                      </div>

                      {evaluations.length > 0 ? (
                        <div className="space-y-1">
                          {evaluations.map((evalRow) => (
                            <div key={evalRow.id} className="flex items-start gap-3 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                              {evalRow.status === "passed" ? (
                                <CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" />
                              ) : evalRow.status === "failed" ? (
                                <XCircle className="size-4 text-destructive shrink-0 mt-0.5" />
                              ) : evalRow.status === "warning" ? (
                                <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
                              ) : (
                                <Clock className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-foreground">{evalRow.rule_name}</span>
                                  <StatusBadge variant={
                                    evalRow.status === "passed" ? "success" :
                                    evalRow.status === "failed" ? "destructive" :
                                    evalRow.status === "warning" ? "warning" : "pending"
                                  }>
                                    {evalRow.status === "pending" ? "Processing" : evalRow.status}
                                  </StatusBadge>
                                  {evalRow.confidence != null && (
                                    <span className={cn("text-[10px] font-medium", evalRow.confidence >= 80 ? "text-success" : evalRow.confidence >= 60 ? "text-warning" : "text-destructive")}>
                                      {evalRow.confidence}% confidence
                                    </span>
                                  )}
                                </div>
                                {evalRow.explanation && evalRow.status !== "pending" && (
                                  <p className="text-xs text-muted-foreground mt-0.5">{evalRow.explanation}</p>
                                )}
                                {evalRow.error && (
                                  <p className="text-xs text-destructive mt-0.5">{evalRow.error}</p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center py-8">
                          {detail ? (
                            <div className="text-center">
                              <CheckCircle2 className="size-8 text-success mx-auto mb-2" />
                              <p className="text-sm font-medium text-foreground">All controls passed</p>
                              <p className="text-xs text-muted-foreground mt-0.5">No violations found for this framework.</p>
                            </div>
                          ) : (
                            <Loader2 className="size-5 animate-spin text-muted-foreground" />
                          )}
                        </div>
                      )}
                    </div>

                    {violations_list.length > 0 && (
                      <div className="rounded-xl border bg-card p-5">
                        <h2 className="text-sm font-semibold text-foreground mb-4">Failed Controls & Evidence</h2>
                        <div className="space-y-3">
                          {violations_list.map((v, i) => {
                            let sourceChunks = null;
                            try {
                              if (v.source_chunks) {
                                sourceChunks = typeof v.source_chunks === "string" ? JSON.parse(v.source_chunks) : v.source_chunks;
                              }
                            } catch { sourceChunks = null; }

                            return (
                              <div key={`v-${v.id || i}`} className="rounded-lg border border-border overflow-hidden">
                                <div className="p-3 space-y-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <p className="text-sm font-medium text-foreground">{v.title}</p>
                                        <StatusBadge variant={
                                          v.severity === "critical" ? "critical" :
                                          v.severity === "high" ? "high" :
                                          v.severity === "medium" ? "medium" : "low"
                                        }>{v.severity}</StatusBadge>
                                        {v.confidence != null && (
                                          <span className="text-[10px] text-muted-foreground">{v.confidence}% confidence</span>
                                        )}
                                        {v.page_number != null && (
                                          <span className="text-[10px] text-muted-foreground">Page {v.page_number}</span>
                                        )}
                                      </div>
                                      {v.clause && <p className="text-[11px] text-muted-foreground mt-0.5">Clause: {v.clause}</p>}
                                    </div>
                                    <Button
                                      onClick={() => setRemediateViolation(remediateViolation?.id === v.id ? null : v)}
                                      size="sm"
                                      variant="outline"
                                      className="shrink-0 h-7 text-xs gap-1"
                                    >
                                      <Sparkles className="size-3" /> Fix
                                    </Button>
                                  </div>

                                  {v.description && (
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-0.5">Why It Was Flagged</p>
                                      <p className="text-xs text-foreground/80">{v.description}</p>
                                    </div>
                                  )}

                                  {sourceChunks && sourceChunks.length > 0 && (
                                    <div>
                                      <p className="text-xs font-semibold text-muted-foreground mb-1">Evidence ({sourceChunks.length} chunk{sourceChunks.length > 1 ? "s" : ""})</p>
                                      <div className="space-y-1">
                                        {sourceChunks.map((chunk, ci) => (
                                          <div key={ci} className="rounded-lg bg-muted/30 border border-border p-2">
                                            <div className="flex items-center gap-2 mb-0.5">
                                              <span className="text-[10px] font-medium text-muted-foreground">Chunk #{chunk.chunk_index}</span>
                                              {chunk.page_numbers?.length > 0 && (
                                                <span className="text-[10px] text-muted-foreground">— Page{chunk.page_numbers.length > 1 ? "s" : ""} {chunk.page_numbers.join(", ")}</span>
                                              )}
                                            </div>
                                            <p className="text-xs text-foreground/70 font-mono leading-relaxed line-clamp-2">{chunk.text_snippet}</p>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {v.recommendation && (
                                    <div>
                                      <p className="text-xs font-semibold text-success mb-0.5">Recommendation</p>
                                      <div className="rounded-lg bg-success/5 border border-success/20 p-2">
                                        <p className="text-xs text-foreground/80">{v.recommendation}</p>
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {remediateViolation?.id === v.id && (
                                  <div className="border-t border-border">
                                    <RemediationCopilot violation={v} />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {!detail && (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                );
              })()}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border bg-card">
              <Shield className="size-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No compliance data</p>
              <p className="text-sm text-muted-foreground mt-1">Run a scan to see compliance results.</p>
            </div>
          )}
        </TabsContent>

        {/* ═══ VERSIONS TAB ════════════════════════════════════════ */}
        <TabsContent value="versions" className="mt-0 space-y-6">
          {scanVersions.length > 0 ? (
            <>
              <div className="rounded-xl border bg-card p-5">
                <h2 className="text-sm font-semibold text-foreground mb-4">Scan Version Timeline</h2>
                <div className="relative">
                  <div className="absolute left-[17px] top-2 bottom-2 w-px bg-border" />
                  <div className="space-y-4">
                    {scanVersions.map((version, idx) => {
                      const verNum = scanVersions.length - idx;
                      return (
                        <div key={version.groupId} className="flex gap-4">
                          <div className="flex flex-col items-center shrink-0">
                            <div className={cn(
                              "flex size-9 items-center justify-center rounded-full border-2 z-10",
                              version.isRunning
                                ? "border-info bg-info/10"
                                : version.score >= 75
                                ? "border-success bg-success/10"
                                : version.score >= 45
                                ? "border-warning bg-warning/10"
                                : "border-destructive bg-destructive/10"
                            )}>
                              {version.isRunning ? (
                                <Loader2 className="size-4 text-info animate-spin" />
                              ) : (
                                <Shield className={cn("size-4", scoreClass(version.score))} />
                              )}
                            </div>
                            {idx < scanVersions.length - 1 && <div className="flex-1 w-px bg-border" />}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  Scan v{verNum}
                                  {idx === 0 && <span className="text-xs text-muted-foreground ml-2 font-normal">(Latest)</span>}
                                </p>
                                <p className="text-xs text-muted-foreground">{formatDateTime(version.date.toISOString())}</p>
                              </div>
                              <div className="flex items-center gap-3">
                                {version.score != null && (
                                  <div className="flex items-center gap-1">
                                    <span className={cn("text-sm font-bold", scoreClass(version.score))}>{version.score}</span>
                                    <span className="text-xs text-muted-foreground">%</span>
                                  </div>
                                )}
                                <div className="flex gap-1">
                                  {version.frameworks.map((fw) => (
                                    <FrameworkBadge key={fw} name={fw} />
                                  ))}
                                </div>
                                {version.violations > 0 && (
                                  <span className="text-xs text-destructive font-medium">{version.violations} violation(s)</span>
                                )}
                              </div>
                            </div>
                            <div className="mt-2 h-1.5 w-full max-w-xs rounded-full bg-muted">
                              <div className={cn("h-full rounded-full", scoreBgClass(version.score))} style={{ width: `${version.score || 0}%` }} />
                            </div>
                            {idx < scanVersions.length - 1 && (
                              <div className="mt-2 flex gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className={cn("h-6 text-[10px] px-2", diffOldVer === verNum ? "bg-primary/10 text-primary" : "")}
                                  onClick={() => handleCompareDiff(verNum, verNum - 1)}
                                >
                                  Compare with next
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ═══ DIFF VIEW ════════════════════════════════════ */}
              {diffData && (
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-foreground">
                      Diff: v{diffData.old_version} → v{diffData.new_version}
                    </h2>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="text-success font-medium">+{diffData.stats.additions}</span>
                      <span className="text-destructive font-medium">-{diffData.stats.deletions}</span>
                      <span className="text-muted-foreground">{diffData.stats.unchanged} unchanged</span>
                      <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setDiffData(null)}>
                        Close
                      </Button>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border max-h-96 overflow-auto">
                    {diffData.lines.map((line, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex items-start gap-3 px-3 py-0.5 text-xs font-mono leading-relaxed",
                          line.kind === "insert" ? "bg-success/5" :
                          line.kind === "delete" ? "bg-destructive/5" : ""
                        )}
                      >
                        <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums">
                          {line.line_number_old || ""}
                        </span>
                        <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums">
                          {line.line_number_new || ""}
                        </span>
                        <span className={cn(
                          "shrink-0 w-4",
                          line.kind === "insert" ? "text-success" :
                          line.kind === "delete" ? "text-destructive" :
                          "text-muted-foreground"
                        )}>
                          {line.kind === "insert" ? "+" : line.kind === "delete" ? "-" : " "}
                        </span>
                        <span className="flex-1 whitespace-pre-wrap break-all">{line.content}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diffLoading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {diffError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                  {diffError}
                </div>
              )}

              {scanVersions.length >= 2 && (
                <div className="rounded-xl border bg-card p-5">
                  <h2 className="text-sm font-semibold text-foreground mb-4">Compliance Improvement Over Time</h2>
                  <div className="flex items-end gap-3 h-32">
                    {[...scanVersions].reverse().map((version, idx) => {
                      const height = version.score != null ? `${Math.max(version.score, 5)}%` : "5%";
                      return (
                        <div key={version.groupId} className="flex-1 flex flex-col items-center gap-1">
                          <span className={cn("text-xs font-semibold", scoreClass(version.score))}>{version.score ?? "—"}</span>
                          <div className="w-full rounded-t-md relative" style={{ height }}>
                            <div className={cn("absolute bottom-0 w-full rounded-t-md h-full", scoreBgClass(version.score))} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">v{scanVersions.length - idx}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center rounded-xl border bg-card">
              <Clock className="size-8 text-muted-foreground mb-3" />
              <p className="text-sm font-medium text-foreground">No scan versions yet</p>
              <p className="text-sm text-muted-foreground mt-1">Each scan creates a new version.</p>
            </div>
          )}
        </TabsContent>

        {/* ═══ ACTIVITY TAB ════════════════════════════════════════ */}
        <TabsContent value="activity" className="mt-0 space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Activity Timeline</h2>
            <div className="space-y-1">
              {[...scanVersions].sort((a, b) => b.date - a.date).map((version) => (
                <div key={version.groupId} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                  <ScanStatusIcon status={version.isRunning ? "running" : "completed"} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      Scan {version.isRunning ? "started" : "completed"} — {version.frameworks.join(", ")}
                      {version.score != null && !version.isRunning && (
                        <span className="text-muted-foreground"> (Score: {version.score}%)</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(version.date.toISOString())}</p>
                  </div>
                </div>
              ))}
              {violations.filter((v) => v.status === "resolved" || v.status === "dismissed" || v.status === "approved").map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                  {v.status === "approved" ? (
                    <Shield className="size-4 text-success" />
                  ) : (
                    <CheckCircle2 className="size-4 text-success" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      Violation {v.status} — {v.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{v.framework}{v.assigned_to ? ` · reviewed by ${v.assigned_to}` : ""}</p>
                  </div>
                </div>
              ))}
              {violations.filter((v) => v.status === "under_review").map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                  <Clock className="size-4 text-warning" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      Violation submitted for review — {v.title}
                    </p>
                    <p className="text-xs text-muted-foreground">{v.framework}</p>
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3 rounded-lg p-2.5 hover:bg-muted/30 transition-colors">
                <FileText className="size-4 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">Document uploaded</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(doc.upload_time || doc.created_at)}</p>
                </div>
              </div>
              {scans.length === 0 && violations.filter((v) => v.status === "resolved" || v.status === "dismissed" || v.status === "approved" || v.status === "under_review").length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No activity yet.</p>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ═══ REVIEW HISTORY TAB ══════════════════════════════════ */}
        <TabsContent value="review-history" className="mt-0 space-y-6">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Review History</h2>
            {violations.filter((v) => v.status === "under_review" || v.status === "resolved" || v.status === "dismissed" || v.status === "approved").length > 0 ? (
              <div className="space-y-2">
                {violations.filter((v) => v.status === "under_review" || v.status === "resolved" || v.status === "dismissed" || v.status === "approved").map((v) => (
                  <div key={v.id} className="rounded-lg border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <FileCheck className="size-4 text-muted-foreground shrink-0" />
                        <p className="text-sm font-medium text-foreground truncate">{v.title}</p>
                      </div>
                      <StatusBadge variant={
                        v.status === "resolved" || v.status === "approved" ? "success" :
                        v.status === "under_review" ? "info" : "pending"
                      }>
                        {v.status === "under_review" ? "Under Review" : v.status}
                      </StatusBadge>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>Framework: {v.framework}</span>
                      <StatusBadge variant={
                        v.severity === "critical" ? "critical" :
                        v.severity === "high" ? "high" :
                        v.severity === "medium" ? "medium" : "low"
                      }>{v.severity}</StatusBadge>
                    </div>
                    {v.assigned_to && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="size-3" /> Assigned to: {v.assigned_to}
                      </p>
                    )}
                    {v.reviewer_notes && (
                      <div className="rounded-lg bg-muted/30 p-2">
                        <p className="text-xs font-medium text-muted-foreground mb-0.5">Reviewer notes:</p>
                        <p className="text-xs text-foreground/80">{v.reviewer_notes}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <FileCheck className="size-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No review history yet.</p>
                <p className="text-xs text-muted-foreground mt-0.5">Review items will appear here once they are submitted for review.</p>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
