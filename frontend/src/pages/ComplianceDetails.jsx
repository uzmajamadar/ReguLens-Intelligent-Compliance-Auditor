import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Shield,
  FileText,
  AlertTriangle,
  Info,
  Search,
  CheckCircle2,
  XCircle,
  Loader2,
  Activity,
  BarChart3,
  Users,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { listDocuments, listScans, getComplianceRules, listAllViolations, getReviewStats, listReviewTasks, updateViolationStatus, assignViolation, generateRemediation } from "../lib/api";
import { Button } from "@/components/ui/button";

const severityConfig = {
  critical: { color: "text-red-600 bg-red-50 border-red-200", icon: XCircle, label: "Critical" },
  high: { color: "text-orange-600 bg-orange-50 border-orange-200", icon: AlertTriangle, label: "High" },
  medium: { color: "text-amber-600 bg-amber-50 border-amber-200", icon: AlertTriangle, label: "Medium" },
  low: { color: "text-yellow-600 bg-yellow-50 border-yellow-200", icon: Info, label: "Low" },
};



export default function ComplianceDetails() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [rules, setRules] = useState([]);
  const [docs, setDocs] = useState([]);
  const [scansMap, setScansMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "documents");

  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [allViolations, setAllViolations] = useState(null);

  const [reviewTasks, setReviewTasks] = useState([]);
  const [reviewStats, setReviewStats] = useState(null);
  const [expandedViolation, setExpandedViolation] = useState(null);
  const [docSearch, setDocSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedFrameworks, setExpandedFrameworks] = useState({});
  const [assigningId, setAssigningId] = useState(null);
  const [assignName, setAssignName] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [complianceRules, documents] = await Promise.all([
        getComplianceRules(),
        listDocuments(),
      ]);
      setRules(complianceRules);
      setDocs(documents);

      const scanPromises = documents.map(async (doc) => {
        try {
          const scans = await listScans(doc.id);
          return { docId: doc.id, scans };
        } catch {
          return { docId: doc.id, scans: [] };
        }
      });
      const scanResults = await Promise.all(scanPromises);
      const map = {};
      scanResults.forEach(({ docId, scans }) => {
        map[docId] = scans;
      });
      setScansMap(map);
    } catch (err) {
      console.error("Failed to load compliance details", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      await loadData();
    };
    fetchData();
  }, [loadData]);

  // Lazy-load violations when Violations or Regulations tab is opened
  useEffect(() => {
    if ((activeTab === "violations" || activeTab === "regulations") && !allViolations) {
      listAllViolations()
        .then(setAllViolations)
        .catch(() => setAllViolations([]));
    }
  }, [activeTab, allViolations]);

  // Lazy-load review tasks when Reviews tab is opened
  useEffect(() => {
    if (activeTab === "reviews" && reviewTasks.length === 0) {
      Promise.all([
        getReviewStats().catch(() => null),
        listReviewTasks("pending_review").catch(() => []),
      ]).then(([stats, tasks]) => {
        setReviewStats(stats);
        setReviewTasks(tasks);
      });
    }
  }, [activeTab, reviewTasks.length]);

  const latestScans = Object.entries(scansMap).map(([docId, scans]) => {
    if (!scans || scans.length === 0) return null;
    const latest = scans.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
    return { docId: Number(docId), ...latest };
  }).filter(Boolean);

  const scannedDocIds = new Set(latestScans.map((s) => s.docId));
  const criticalCount = allViolations ? allViolations.filter((v) => v.severity === "critical").length : 0;
  const highCount = allViolations ? allViolations.filter((v) => v.severity === "high").length : 0;

  // Filter docs for the Documents tab
  const filteredDocs = docSearch
    ? docs.filter((d) => (d.original_filename || d.filename || "").toLowerCase().includes(docSearch.toLowerCase()))
    : docs;

  // Filter violations for the Violations tab
  const filteredViolations = allViolations ? allViolations.filter((v) => {
    if (frameworkFilter !== "all" && v.framework !== frameworkFilter) return false;
    if (severityFilter !== "all" && v.severity !== severityFilter) return false;
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    return true;
  }) : [];

  const violationsWithDoc = filteredViolations.map((v) => ({
    ...v,
    docName: docs.find((d) => d.id === v.document_id)?.original_filename || docs.find((d) => d.id === v.document_id)?.filename || v.document_name || "Unknown",
  }));

  const passedCount = rules.length - (allViolations ? new Set(allViolations.map((v) => v.rule_id)).size : 0);

  // Group violations by framework for the Regulations tab
  // Better grouping
  const regulationGroups = {};
  if (allViolations) {
    allViolations.forEach((v) => {
      if (!regulationGroups[v.framework]) {
        regulationGroups[v.framework] = { violations: [], articles: {} };
      }
      regulationGroups[v.framework].violations.push(v);
      const article = v.clause || v.rule_id;
      if (!regulationGroups[v.framework].articles[article]) {
        regulationGroups[v.framework].articles[article] = [];
      }
      regulationGroups[v.framework].articles[article].push(v);
    });
  }

  // Frameworks with no violations
  const frameworkSet = new Set(Object.keys(regulationGroups));
  rules.forEach((r) => {
    if (!frameworkSet.has(r.regulation)) {
      regulationGroups[r.regulation] = { violations: [], articles: {} };
      frameworkSet.add(r.regulation);
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Compliance Details</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Document compliance status across {docs.length} document{docs.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={loadData} variant="outline" size="sm">
            <Activity className="size-4" />
            Refresh
          </Button>
          <Button onClick={() => navigate("/compliance")} variant="outline" size="sm">
            <BarChart3 className="size-4" />
            Dashboard
          </Button>
        </div>
      </div>

      {/* Executive Summary */}
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="grid grid-cols-5 gap-3">
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className={`text-xl font-bold ${scannedDocIds.size > 0 ? "text-green-600" : "text-muted-foreground"}`}>{scannedDocIds.size}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Docs Scanned</p>
          </div>
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
            <p className="text-xl font-bold text-red-600">{criticalCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Critical Rules</p>
          </div>
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-center">
            <p className="text-xl font-bold text-orange-600">{highCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">High Risk</p>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
            <p className="text-xl font-bold text-green-600">{passedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Passed Rules</p>
          </div>
          <div className="rounded-lg border border-border bg-card p-3 text-center">
            <p className="text-xl font-bold text-foreground">{reviewStats?.pending_review ?? 0}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Pending Reviews</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-muted p-1">
        {["documents", "violations", "regulations", "reviews"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors capitalize ${
              activeTab === tab
                ? "bg-card text-card-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "documents" && <FileText className="size-4" />}
            {tab === "violations" && <AlertTriangle className="size-4" />}
            {tab === "regulations" && <Shield className="size-4" />}
            {tab === "reviews" && <Users className="size-4" />}
            {tab}
          </button>
        ))}
      </div>

      {/* ─── Documents Tab ─── */}
      {activeTab === "documents" && (
        <div className="space-y-4">
          {filteredDocs.length < docs.length && (
            <div className="flex items-center gap-2">
              <Search className="size-4 text-muted-foreground" />
              <input
                type="text"
                value={docSearch}
                onChange={(e) => setDocSearch(e.target.value)}
                placeholder="Search documents..."
                className="flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground"
              />
              {docSearch && (
                <button onClick={() => setDocSearch("")} className="text-xs text-muted-foreground hover:text-foreground">
                  Clear
                </button>
              )}
            </div>
          )}
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3">Document</th>
                  <th className="px-4 py-3 text-center">Score</th>
                  <th className="px-4 py-3 text-center">Violations</th>
                  <th className="px-4 py-3 text-center">Grade</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredDocs.map((doc) => {
                  const latest = latestScans.find((s) => s.docId === doc.id);
                  return (
                    <tr key={doc.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <FileText className="size-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-56">
                              {doc.original_filename || doc.filename}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {doc.page_count ? `${doc.page_count} pages` : "---"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {latest?.score != null ? (
                          <span className={`inline-flex items-center gap-1 font-semibold ${
                            latest.score >= 75 ? "text-green-600" : latest.score >= 45 ? "text-amber-600" : "text-red-600"
                          }`}>
                            {latest.score}
                            <span className="text-xs font-normal text-muted-foreground">/100</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">---</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {latest ? (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${
                            latest.violation_count > 0 ? "text-red-600" : "text-green-600"
                          }`}>
                            {latest.violation_count > 0 ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
                            {latest.violation_count || 0}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">---</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {latest?.grade ? (
                          <span className={`inline-flex items-center justify-center rounded-full w-7 h-7 text-xs font-bold ${
                            latest.grade >= "A" ? "bg-green-100 text-green-700" :
                            latest.grade >= "C" ? "bg-amber-100 text-amber-700" :
                            "bg-red-100 text-red-700"
                          }`}>{latest.grade}</span>
                        ) : (
                          <span className="text-muted-foreground/50 text-xs">---</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/compliance/details/${doc.id}`)}
                        >
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredDocs.length === 0 && (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {docSearch ? "No documents match your search." : "No documents uploaded yet."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Violations Tab ─── */}
      {activeTab === "violations" && (
        <div className="space-y-4">
          {allViolations === null ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : allViolations && allViolations.length > 0 ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <select
                  value={frameworkFilter}
                  onChange={(e) => setFrameworkFilter(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <option value="all">All Frameworks</option>
                  {Object.keys(regulationGroups).sort().map((fw) => (
                    <option key={fw} value={fw}>{fw}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  {["critical", "high", "medium", "low"].map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setSeverityFilter(severityFilter === sev ? "all" : sev)}
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                        severityFilter === sev
                          ? severityConfig[sev]?.color
                          : "text-muted-foreground bg-card border-border hover:bg-muted"
                      }`}
                    >
                      {sev}
                    </button>
                  ))}
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
                >
                  <option value="all">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="pending_assignment">Pending Assignment</option>
                  <option value="assigned">Assigned</option>
                  <option value="in_review">In Review</option>
                  <option value="approved">Approved</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>
                <span className="text-xs text-muted-foreground">
                  {violationsWithDoc.length} of {allViolations.length} violations
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3">Severity</th>
                      <th className="px-4 py-3">Rule</th>
                      <th className="px-4 py-3">Document</th>
                      <th className="px-4 py-3">Framework</th>
                      <th className="px-4 py-3 text-center">Confidence</th>
                      <th className="px-4 py-3">Assigned To</th>
                      <th className="px-4 py-3 text-center">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {violationsWithDoc.map((v) => {
                      const SevIcon = severityConfig[v.severity]?.icon;
                      const statusColor =
                        v.status === "open" ? "border-blue-200 bg-blue-50 text-blue-700" :
                        v.status === "pending_assignment" ? "border-indigo-200 bg-indigo-50 text-indigo-700" :
                        v.status === "assigned" ? "border-purple-200 bg-purple-50 text-purple-700" :
                        v.status === "in_review" ? "border-amber-200 bg-amber-50 text-amber-700" :
                        v.status === "approved" ? "border-green-200 bg-green-50 text-green-700" :
                        v.status === "resolved" ? "border-green-200 bg-green-50 text-green-700" :
                        v.status === "dismissed" ? "border-gray-200 bg-gray-50 text-gray-600" :
                        "border-red-200 bg-red-50 text-red-700";
                      return (
                      <tr
                        key={v.id}
                        className="hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => setExpandedViolation(expandedViolation === v.id ? null : v.id)}
                      >
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                            severityConfig[v.severity]?.color || "text-muted-foreground bg-muted border-border"
                          }`}>
                            {SevIcon ? <SevIcon className="size-3 mr-1" /> : null}
                            {v.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">{v.title}</td>
                        <td className="px-4 py-3 text-muted-foreground">{v.docName}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            {v.framework}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {v.confidence != null && (
                            <span className={`text-xs font-medium ${
                              v.confidence >= 90 ? "text-green-600" : v.confidence >= 70 ? "text-amber-600" : "text-red-600"
                            }`}>{v.confidence}%</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {assigningId === v.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={assignName}
                                onChange={(e) => setAssignName(e.target.value)}
                                placeholder="Assignee name"
                                className="w-28 rounded border border-border px-2 py-1 text-xs"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    assignViolation(v.id, assignName || null).then(() => {
                                      setAllViolations((prev) => prev.map((x) => x.id === v.id ? { ...x, assigned_to: assignName || null, status: assignName ? "assigned" : x.status } : x));
                                      setAssigningId(null);
                                      setAssignName("");
                                    });
                                  }
                                  if (e.key === "Escape") {
                                    setAssigningId(null);
                                    setAssignName("");
                                  }
                                }}
                              />
                              <button
                                className="text-xs text-muted-foreground hover:text-foreground"
                                onClick={() => { setAssigningId(null); setAssignName(""); }}
                              >
                                Esc
                              </button>
                            </div>
                          ) : (
                            <span
                              className="text-xs text-muted-foreground cursor-pointer hover:text-foreground"
                              onClick={(e) => { e.stopPropagation(); setAssigningId(v.id); setAssignName(v.assigned_to || ""); }}
                            >
                              {v.assigned_to || <span className="italic text-muted-foreground/50">Assign</span>}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor}`}>
                            {v.status === "pending_review" ? "Pending Review" :
                             v.status === "false_positive" ? "False Positive" :
                             v.status.charAt(0).toUpperCase() + v.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div onClick={(e) => e.stopPropagation()}>
                            <select
                              value=""
                              onChange={(e) => {
                                const action = e.target.value;
                                e.target.value = "";
                                if (action === "assign") { setAssigningId(v.id); setAssignName(v.assigned_to || ""); return; }
                                if (action === "fix") {
                                  generateRemediation(v.id).catch(() => {});
                                  navigate(`/compliance/details/${v.document_id}?remediate=${v.id}`);
                                  return;
                                }
                                if (action === "accept") {
                                  updateViolationStatus(v.id, "resolved")
                                    .then(() => setAllViolations((prev) => prev.map((x) => x.id === v.id ? { ...x, status: "resolved" } : x)))
                                    .catch(console.error);
                                  return;
                                }
                                if (action === "dismiss") {
                                  updateViolationStatus(v.id, "dismissed")
                                    .then(() => setAllViolations((prev) => prev.map((x) => x.id === v.id ? { ...x, status: "dismissed" } : x)))
                                    .catch(console.error);
                                }
                              }}
                              className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground cursor-pointer"
                            >
                              <option value="" disabled>Actions</option>
                              <option value="assign">Assign</option>
                              <option value="fix">Generate Fix</option>
                              {v.status !== "resolved" && v.status !== "dismissed" && (
                                <option value="accept">Accept</option>
                              )}
                              {v.status !== "dismissed" && v.status !== "resolved" && (
                                <option value="dismiss">Dismiss</option>
                              )}
                            </select>
                          </div>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
              <CheckCircle2 className="mb-3 size-8 text-green-600" />
              <p className="text-sm font-medium text-foreground">No violations found</p>
              <p className="mt-1 text-sm text-muted-foreground">
                All scanned documents passed compliance checks.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ─── Regulations Tab ─── */}
      {activeTab === "regulations" && (
        <div className="space-y-4">
          {allViolations === null ? (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-3">
              {Object.entries(regulationGroups)
                .sort(([, a], [, b]) => b.violations.length - a.violations.length)
                .map(([fw, group]) => {
                  const isOpen = expandedFrameworks[fw] ?? false;
                  return (
                  <div key={fw} className="rounded-xl border border-border bg-card overflow-hidden">
                    <button
                      onClick={() => setExpandedFrameworks((prev) => ({ ...prev, [fw]: !prev[fw] }))}
                      className="flex w-full items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2">
                        {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                        <Shield className="size-4 text-primary" />
                        <span className="text-sm font-semibold text-foreground">{fw}</span>
                        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                          group.violations.length > 0 ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"
                        }`}>
                          {group.violations.length} issue{group.violations.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </button>
                    {isOpen && (Object.keys(group.articles).length > 0 ? (
                      <div className="divide-y divide-border">
                        {Object.entries(group.articles).map(([article, articleViolations]) => (
                          <div key={article} className="px-4 py-2.5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono text-foreground">{article}</span>
                              <span className="text-xs text-muted-foreground line-clamp-1">
                                {articleViolations[0]?.title || ""}
                              </span>
                            </div>
                            <span className={`text-xs font-medium ${
                              articleViolations.some((v) => v.severity === "critical" || v.severity === "high")
                                ? "text-red-600" : "text-amber-600"
                            }`}>
                              {articleViolations.length} violation{articleViolations.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-3 text-xs text-muted-foreground text-center">
                        No violations detected
                      </div>
                    ))}
                  </div>
                );
                })}
            </div>
          )}
        </div>
      )}

      {/* ─── Reviews Tab ─── */}
      {activeTab === "reviews" && (
        <div className="space-y-4">
          {reviewStats && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Pending Review", count: reviewStats.pending_review, color: "text-amber-600", bg: "bg-amber-50" },
                { label: "Approved", count: reviewStats.approved, color: "text-green-600", bg: "bg-green-50" },
                { label: "False Positive", count: reviewStats.false_positive, color: "text-gray-600", bg: "bg-gray-50" },
                { label: "Needs Fix", count: reviewStats.needs_fix, color: "text-red-600", bg: "bg-red-50" },
              ].map((card) => (
                <div key={card.label} className={`rounded-lg border border-border ${card.bg} p-3 text-center`}>
                  <p className={`text-xl font-bold ${card.color}`}>{card.count}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.label}</p>
                </div>
              ))}
            </div>
          )}
          {reviewTasks.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3">Document</th>
                    <th className="px-4 py-3">Rule</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {reviewTasks.slice(0, 20).map((task) => (
                    <tr key={task.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3 text-muted-foreground">{task.document_name}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{task.rule_name}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {task.reason === "low_confidence" ? "Low Confidence" : task.reason}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="outline" size="sm" onClick={() => navigate("/compliance/review")}>
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
              <CheckCircle2 className="mb-3 size-8 text-green-600" />
              <p className="text-sm font-medium text-foreground">No pending reviews</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
