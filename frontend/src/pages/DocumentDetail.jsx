import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  FileText,
  ArrowLeft,
  Shield,
  MessageSquare,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Layers,
  GitCompare,
  ChevronRight,
  Sparkles,
} from "lucide-react";

import { fetchDocument, listScans, getScanDetail, runScan } from "../lib/api";
import { Button } from "@/components/ui/button";
import RemediationCopilot from "../components/RemediationCopilot";

const ALL_FRAMEWORKS = [
  { id: "GDPR", label: "GDPR" },
  { id: "HR", label: "HR" },
  { id: "HIPAA", label: "HIPAA" },
  { id: "SOC2", label: "SOC2" },
  { id: "PCI-DSS", label: "PCI-DSS" },
  { id: "ISO27001", label: "ISO27001" },
];

const FW_DOT_COLORS = {
  GDPR: "bg-indigo-500",
  HR: "bg-emerald-500",
  HIPAA: "bg-blue-500",
  SOC2: "bg-purple-500",
  "PCI-DSS": "bg-red-500",
  ISO27001: "bg-amber-500",
};

const FW_BG_COLORS = {
  GDPR: "bg-indigo-50 text-indigo-700 border-indigo-200",
  HR: "bg-emerald-50 text-emerald-700 border-emerald-200",
  HIPAA: "bg-blue-50 text-blue-700 border-blue-200",
  SOC2: "bg-purple-50 text-purple-700 border-purple-200",
  "PCI-DSS": "bg-red-50 text-red-700 border-red-200",
  ISO27001: "bg-amber-50 text-amber-700 border-amber-200",
};

const scanStatusConfig = {
  completed: { icon: CheckCircle2, class: "text-green-600" },
  running: { icon: Loader2, class: "text-blue-600 animate-spin" },
  failed: { icon: XCircle, class: "text-red-600" },
  pending: { icon: Clock, class: "text-yellow-600" },
};

const evalStatusConfig = {
  passed: { icon: CheckCircle2, class: "text-green-600" },
  failed: { icon: XCircle, class: "text-red-600" },
  warning: { icon: AlertTriangle, class: "text-amber-600" },
  error: { icon: XCircle, class: "text-red-600 bg-red-50" },
  pending: { icon: Clock, class: "text-yellow-600" },
  skipped: { icon: Clock, class: "text-gray-400" },
};

// eslint-disable-next-line no-unused-vars
function FrameworkCard({ name, report }) {
  const colors = FW_BG_COLORS[name] || "bg-gray-50 text-gray-700 border-gray-200";
  const dot = FW_DOT_COLORS[name] || "bg-gray-500";
  const gradeBg = report.grade >= "A" ? "bg-green-100 text-green-700" : report.grade >= "C" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`size-2.5 rounded-full ${dot}`} />
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colors}`}>
            {name}
          </span>
        </div>
        <div className={`flex size-9 items-center justify-center rounded-full text-sm font-bold ${gradeBg}`}>
          {report.grade}
        </div>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold ${report.score >= 75 ? "text-green-600" : report.score >= 45 ? "text-amber-600" : "text-red-600"}`}>
          {report.score.toFixed(0)}
        </span>
        <span className="text-xs text-muted-foreground">/100</span>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>{report.rules_passed}/{report.total_rules} passed</span>
        <span className={report.violations_found > 0 ? "text-red-600 font-medium" : "text-green-600"}>
          {report.violations_found} violation(s)
        </span>
      </div>
    </div>
  );
}

function ConflictCard({ conflict }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
      <button onClick={() => setExpanded(!expanded)} className="w-full flex items-start gap-3 p-3 text-left hover:bg-amber-100/50 transition-colors">
        <GitCompare className="size-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-900">{conflict.topic}</p>
          <p className="text-xs text-amber-700 mt-0.5">{conflict.framework_a} vs {conflict.framework_b}</p>
        </div>
        <span className="text-xs text-amber-700 shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="border-t border-amber-200 px-3 py-2 space-y-2 text-xs text-amber-800">
          <p><span className="font-medium">{conflict.framework_a}:</span> {conflict.rule_name_a}</p>
          <p><span className="font-medium">{conflict.framework_b}:</span> {conflict.rule_name_b}</p>
          <p className="text-amber-700">{conflict.description}</p>
          {conflict.recommendation && (
            <div className="rounded bg-white/60 p-2 border border-amber-200">
              <p className="font-medium mb-0.5">Recommendation:</p>
              <p>{conflict.recommendation}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DocumentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState(null);
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanning, setScanning] = useState(false);

  const [selectedFrameworks, setSelectedFrameworks] = useState(new Set());
  const [customChecked, setCustomChecked] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customDescription, setCustomDescription] = useState("");

  const [multiScanResult, setMultiScanResult] = useState(null);
  const [scanDetails, setScanDetails] = useState({});
  const [expandedScanId, setExpandedScanId] = useState(null);
  const [remediateViolation, setRemediateViolation] = useState(null);

  async function loadScanDetail(scanId) {
    if (scanDetails[scanId]) return;
    try {
      const detail = await getScanDetail(id, scanId);
      setScanDetails((prev) => ({ ...prev, [scanId]: detail }));
    } catch (err) {
      console.error("Failed to load scan detail", err);
    }
  }

  function toggleScan(scanId) {
    if (expandedScanId === scanId) {
      setExpandedScanId(null);
    } else {
      setExpandedScanId(scanId);
      loadScanDetail(scanId);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [docData, scansData] = await Promise.all([
          fetchDocument(id),
          listScans(id),
        ]);
        if (!cancelled) {
          setDoc(docData);
          setScans(scansData);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  function toggleFramework(fwId) {
    setSelectedFrameworks((prev) => {
      const next = new Set(prev);
      if (next.has(fwId)) next.delete(fwId);
      else next.add(fwId);
      return next;
    });
  }

  function selectAll() {
    setSelectedFrameworks(new Set(ALL_FRAMEWORKS.map((f) => f.id)));
  }

  function clearAll() {
    setSelectedFrameworks(new Set());
  }

  async function handleScan() {
    const fwArray = [...selectedFrameworks];
    if (customChecked && customName.trim()) {
      fwArray.push(customName.trim());
    }
    if (fwArray.length === 0) return;

    setScanning(true);
    setError(null);
    setMultiScanResult(null);

    try {
      if (fwArray.length === 1 && !customChecked) {
        const newScan = await runScan(id, fwArray[0]);
        setScans((prev) => [newScan, ...prev]);
      } else {
        const result = await runScan(
          id,
          fwArray,
          customChecked ? customName.trim() : null,
          customChecked ? customDescription.trim() : null,
        );
        setMultiScanResult(result);
        setScans((prev) => [...result.scans, ...prev]);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setScanning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <button
          onClick={() => navigate("/documents")}
          className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Back to Documents
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  if (!doc) return null;

  const groupedScans = scans.reduce((acc, s) => {
    const key = s.scan_group_id || `single_${s.scan_id}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-4xl">
      <button
        onClick={() => navigate("/documents")}
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to Documents
      </button>

      <div className="mb-8">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="size-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {doc.original_filename || doc.filename}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                {doc.page_count != null && <span>{doc.page_count} pages</span>}
                {doc.upload_time && (
                  <span>Uploaded {new Date(doc.upload_time).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Scan Action Panel ─────────────────────────────────────── */}
      <div className="mb-8 rounded-lg border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="size-5 text-primary" />
            <span className="text-sm font-medium text-card-foreground">Scan Against</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={selectAll}>Select All</Button>
            <Button variant="ghost" size="sm" onClick={clearAll}>Clear All</Button>
            <Button
              onClick={() => navigate(`/auditor-ai?documentId=${doc.id}`)}
              variant="outline"
              size="sm"
            >
              <MessageSquare className="size-4" />
              Chat
            </Button>
            <Button
              onClick={handleScan}
              disabled={scanning || (selectedFrameworks.size === 0 && !(customChecked && customName.trim()))}
              size="sm"
            >
              {scanning ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {scanning ? "Scanning..." : "Run Scan"}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {ALL_FRAMEWORKS.map((fw) => {
            const checked = selectedFrameworks.has(fw.id);
            const dot = FW_DOT_COLORS[fw.id] || "bg-gray-500";
            return (
              <label
                key={fw.id}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors text-sm ${
                  checked
                    ? "border-primary bg-primary/5 text-card-foreground"
                    : "border-border text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleFramework(fw.id)}
                  className="size-4 accent-primary"
                />
                <span className={`size-2 rounded-full ${dot}`} />
                {fw.label}
              </label>
            );
          })}
          <label
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer transition-colors text-sm ${
              customChecked
                ? "border-primary bg-primary/5 text-card-foreground"
                : "border-border text-muted-foreground hover:bg-muted/50"
            }`}
          >
            <input
              type="checkbox"
              checked={customChecked}
              onChange={() => setCustomChecked(!customChecked)}
              className="size-4 accent-primary"
            />
            Custom
          </label>
        </div>

        {customChecked && (
          <div className="space-y-3 pl-1">
            <input
              type="text"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Regulation name (e.g., CCPA)"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
            />
            <textarea
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="What should we check? (e.g., Verify data deletion rights and opt-out requirements)"
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground resize-none"
            />
          </div>
        )}
      </div>

      {/* ── Multi-Framework Result ───────────────────────────────── */}
      {multiScanResult && (
        <div className="mb-8 rounded-xl border border-primary-border bg-card p-6">
          {multiScanResult.unified_score != null && (
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Layers className="size-5 text-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-card-foreground">Multi-Framework Audit</h2>
                  <p className="text-sm text-muted-foreground">
                    {multiScanResult.frameworks.join(", ")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="text-2xl font-bold text-card-foreground">{multiScanResult.unified_score}/100</p>
                  <p className="text-sm text-muted-foreground">Unified Score</p>
                </div>
                <div className={`flex size-12 items-center justify-center rounded-full text-lg font-bold ${
                  multiScanResult.unified_grade >= "A" ? "bg-green-100 text-green-700" :
                  multiScanResult.unified_grade >= "C" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                }`}>
                  {multiScanResult.unified_grade}
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
            {multiScanResult.scans.map((s) => (
              <div key={s.scan_id} className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`size-2.5 rounded-full ${FW_DOT_COLORS[s.framework] || "bg-gray-500"}`} />
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${FW_BG_COLORS[s.framework] || "bg-gray-50 text-gray-700 border-gray-200"}`}>
                      {s.framework}
                    </span>
                  </div>
                  <div className={`flex size-9 items-center justify-center rounded-full text-sm font-bold ${
                    s.grade >= "A" ? "bg-green-100 text-green-700" :
                    s.grade >= "C" ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {s.grade}
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-xl font-bold ${s.score >= 75 ? "text-green-600" : s.score >= 45 ? "text-amber-600" : "text-red-600"}`}>
                    {s.score}
                  </span>
                  <span className="text-xs text-muted-foreground">/100</span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  <span className={s.violation_count > 0 ? "text-red-600 font-medium" : "text-green-600"}>
                    {s.violation_count} violation(s)
                  </span>
                </div>
              </div>
            ))}
          </div>

          {multiScanResult.conflicts?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <GitCompare className="size-4 text-amber-600" />
                <span className="text-sm font-medium text-amber-800">
                  {multiScanResult.conflicts.length} Cross-Framework Conflict(s)
                </span>
              </div>
              {multiScanResult.conflicts.map((c, i) => (
                <ConflictCard key={i} conflict={c} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Scan History ─────────────────────────────────────────── */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">Scan History</h2>

        {scans.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
            <Shield className="mb-3 size-8 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">No scans yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Select frameworks above and click Run Scan.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupedScans).map(([groupId, group]) => {
              const isMulti = group.length > 1 || group[0]?.scan_group_id;
              return (
                <div key={groupId} className="rounded-lg border border-border bg-card overflow-hidden">
                  {isMulti && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-muted/30 border-b border-border">
                      <Layers className="size-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">Multi-Framework Scan</span>
                    </div>
                  )}
                  <div className="divide-y divide-border">
                    {group.map((scan) => {
                      const Config = scanStatusConfig[scan.status] || scanStatusConfig.pending;
                      const Icon = Config.icon;
                      const detail = scanDetails[scan.scan_id];
                      const isExpanded = expandedScanId === scan.scan_id;
                      return (
                        <div key={scan.scan_id}>
                          <button
                            onClick={() => toggleScan(scan.scan_id)}
                            className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/30 transition-colors"
                          >
                            <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted ${Config.class}`}>
                              <Icon className="size-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${FW_BG_COLORS[scan.framework] || "bg-gray-50 text-gray-700 border-gray-200"}`}>
                                  {scan.framework}
                                </span>
                                <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize text-muted-foreground">
                                  {scan.status}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                {scan.score != null && <span>Score: {scan.score}/100</span>}
                                {scan.grade && <span>Grade: {scan.grade}</span>}
                                {scan.violation_count > 0 && (
                                  <span className="text-red-600 font-medium">{scan.violation_count} violation(s)</span>
                                )}
                                <span>{new Date(scan.created_at).toLocaleString()}</span>
                              </div>
                            </div>
                            <ChevronRight className={`size-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </button>
                          {isExpanded && (
                            <div className="border-t border-border px-4 py-3 space-y-3">
                              {detail ? (
                                <>
                                  {/* ── Violations ───────────────────────────── */}
                                  {detail.violations?.length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold text-red-700 uppercase tracking-wider">
                                        Violations ({detail.violations.length})
                                      </p>
                                      {detail.violations.map((v, i) => {
                                        let sourceChunks = null;
                                        try {
                                          if (v.source_chunks) {
                                            sourceChunks = typeof v.source_chunks === "string"
                                              ? JSON.parse(v.source_chunks)
                                              : v.source_chunks;
                                          }
                                        } catch { sourceChunks = null; }
                                        return (
                                        <div key={`v-${v.id || i}`} className="rounded-lg border border-red-200 bg-red-50 overflow-hidden">
                                          <div className="p-3 space-y-3">
                                            {/* Header row */}
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                  <p className="text-sm font-medium text-red-800">{v.title}</p>
                                                  <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${
                                                    v.severity === "critical" || v.severity === "high"
                                                      ? "text-red-700 bg-red-100 border-red-300"
                                                      : v.severity === "medium"
                                                      ? "text-amber-700 bg-amber-100 border-amber-300"
                                                      : "text-blue-700 bg-blue-100 border-blue-300"
                                                  }`}>{v.severity}</span>
                                                  {v.confidence != null && (
                                                    <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${
                                                      v.confidence >= 80 ? "text-green-700 bg-green-100 border-green-300" :
                                                      v.confidence >= 60 ? "text-amber-700 bg-amber-100 border-amber-300" :
                                                      "text-red-700 bg-red-100 border-red-300"
                                                    }`}>{v.confidence}% confident</span>
                                                  )}
                                                  {v.page_number != null && (
                                                    <span className="inline-flex items-center rounded-full border border-red-200 px-1.5 py-0.5 text-xs text-red-600">
                                                      Page {v.page_number}
                                                    </span>
                                                  )}
                                                </div>
                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1 text-xs text-red-600/70">
                                                  {v.clause && <span>Regulation: {v.clause}</span>}
                                                  {v.rule_id && <span>Rule: {v.rule_id}</span>}
                                                </div>
                                              </div>
                                              <Button
                                                onClick={() => setRemediateViolation(remediateViolation?.id === v.id ? null : v)}
                                                size="sm"
                                                variant="outline"
                                                className="shrink-0"
                                              >
                                                <Sparkles className="size-3.5" />
                                                Remediate
                                              </Button>
                                            </div>

                                            {/* Why it was flagged */}
                                            <div>
                                              <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-1">Why It Was Flagged</p>
                                              <p className="text-xs text-red-700">{v.description}</p>
                                            </div>

                                            {/* Source Evidence with page references */}
                                            {sourceChunks && sourceChunks.length > 0 && (
                                              <div>
                                                <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-1">
                                                  Source Evidence ({sourceChunks.length} chunk{sourceChunks.length > 1 ? "s" : ""})
                                                </p>
                                                <div className="space-y-1.5">
                                                  {sourceChunks.map((chunk, ci) => (
                                                    <div key={ci} className="rounded bg-white/60 border border-red-200 p-2">
                                                      <div className="flex items-center gap-1.5 mb-1">
                                                        <span className="text-xs font-medium text-red-700">Chunk #{chunk.chunk_index}</span>
                                                        {chunk.page_numbers && chunk.page_numbers.length > 0 && (
                                                          <span className="text-xs text-red-500">
                                                            — Page{chunk.page_numbers.length > 1 ? "s" : ""} {chunk.page_numbers.join(", ")}
                                                          </span>
                                                        )}
                                                      </div>
                                                      <p className="text-xs text-red-600 font-mono leading-relaxed line-clamp-3">{chunk.text_snippet}</p>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}

                                            {/* Fallback excerpt if no structured chunks */}
                                            {!sourceChunks && v.excerpt && (
                                              <div>
                                                <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-1">Supporting Evidence</p>
                                                <div className="rounded bg-white/60 border border-red-200 p-2">
                                                  <p className="text-xs text-red-600 font-mono">{v.excerpt}</p>
                                                </div>
                                              </div>
                                            )}

                                            {/* Recommendation */}
                                            {v.recommendation && (
                                              <div>
                                                <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Recommended Fix</p>
                                                <div className="rounded bg-green-50 border border-green-200 p-2">
                                                  <p className="text-xs text-green-600">{v.recommendation}</p>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                          {remediateViolation?.id === v.id && (
                                            <div className="border-t border-red-200">
                                              <RemediationCopilot violation={v} />
                                            </div>
                                          )}
                                        </div>
                                        );})}
                                    </div>
                                  )}

                                  {/* ── Evaluations ─────────────────────────── */}
                                  {detail.evaluations?.length > 0 && (
                                    <div className="space-y-2">
                                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                        All Rule Results ({detail.evaluations.length})
                                      </p>
                                      {detail.evaluations.map((evalRow) => {
                                        const EIcon = evalStatusConfig[evalRow.status]?.icon || Clock;
                                        const EClass = evalStatusConfig[evalRow.status]?.class || "text-muted-foreground";
                                        return (
                                          <div key={evalRow.id} className="flex items-start gap-3 rounded-lg bg-muted/30 p-3">
                                            <div className={`flex size-6 shrink-0 items-center justify-center rounded-full ${EClass} mt-0.5`}>
                                              <EIcon className="size-3.5" />
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <div className="flex items-center gap-2">
                                                <p className="text-sm font-medium text-card-foreground">{evalRow.rule_name}</p>
                                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium capitalize ${
                                                  evalRow.status === "passed" ? "text-green-600 bg-green-50 border-green-200" :
                                                  evalRow.status === "failed" ? "text-red-600 bg-red-50 border-red-200" :
                                                  evalRow.status === "warning" ? "text-amber-600 bg-amber-50 border-amber-200" :
                                                  evalRow.status === "error" ? "text-red-600 bg-red-50 border-red-200" :
                                                  evalRow.status === "pending" ? "text-yellow-600 bg-yellow-50 border-yellow-200" :
                                                  "text-muted-foreground bg-muted border-border"
                                                }`}>
                                                  {evalRow.status === "pending" ? "Processing..." : evalRow.status}
                                                </span>
                                                {evalRow.confidence != null && (
                                                  <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${
                                                    evalRow.confidence >= 80 ? "text-green-600 bg-green-50 border-green-200" :
                                                    evalRow.confidence >= 60 ? "text-amber-600 bg-amber-50 border-amber-200" :
                                                    "text-red-600 bg-red-50 border-red-200"
                                                  }`}>
                                                    {evalRow.confidence}%
                                                  </span>
                                                )}
                                              </div>
                                              {evalRow.status === "pending" && (
                                                <p className="mt-1 text-xs text-yellow-600">The AI engine is currently processing this rule.</p>
                                              )}
                                              {evalRow.explanation && evalRow.status !== "pending" && (
                                                <p className="mt-1 text-xs text-muted-foreground">{evalRow.explanation}</p>
                                              )}
                                              {evalRow.error && (
                                                <p className="mt-1 text-xs text-red-600">{evalRow.error}</p>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  )}

                                  {(!detail.violations || detail.violations.length === 0) && (!detail.evaluations || detail.evaluations.length === 0) && (
                                    <div className="flex items-center gap-2 py-2">
                                      <CheckCircle2 className="size-4 text-green-600" />
                                      <p className="text-sm text-green-600 font-medium">All rules passed</p>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center justify-center py-4">
                                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
