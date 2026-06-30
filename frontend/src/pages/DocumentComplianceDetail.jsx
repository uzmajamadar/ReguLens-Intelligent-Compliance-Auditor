import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  FileText,
  Shield,
  AlertTriangle,
  Info,
  XCircle,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { fetchDocument, listAllViolations, getComplianceRules } from "../lib/api";
import RemediationCopilot from "../components/RemediationCopilot";
import { Button } from "@/components/ui/button";

const severityConfig = {
  critical: { color: "text-red-600 bg-red-50 border-red-200", icon: XCircle, label: "Critical" },
  high: { color: "text-orange-600 bg-orange-50 border-orange-200", icon: AlertTriangle, label: "High" },
  medium: { color: "text-amber-600 bg-amber-50 border-amber-200", icon: AlertTriangle, label: "Medium" },
  low: { color: "text-yellow-600 bg-yellow-50 border-yellow-200", icon: Info, label: "Low" },
};

const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

export default function DocumentComplianceDetail() {
  const { docId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [doc, setDoc] = useState(null);
  const [violations, setViolations] = useState([]);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showRemediation, setShowRemediation] = useState({});
  const [expandedFrameworks, setExpandedFrameworks] = useState({});

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [document, allViolations, complianceRules] = await Promise.all([
          fetchDocument(docId),
          listAllViolations({ document_id: docId }),
          getComplianceRules(),
        ]);
        setDoc(document);
        setViolations(allViolations);
        setRules(complianceRules);
      } catch (err) {
        console.error("Failed to load compliance detail", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [docId]);

  useEffect(() => {
    const remediateId = searchParams.get("remediate");
    if (!remediateId || violations.length === 0) return;
    const v = violations.find((x) => x.id === Number(remediateId));
    if (!v) return;
    setShowRemediation((prev) => ({ ...prev, [v.id]: true }));
    setExpandedFrameworks((prev) => ({ ...prev, [v.framework]: true }));
  }, [searchParams, violations]);

  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  const frameworkCounts = {};
  violations.forEach((v) => {
    if (v.severity === "critical") severityCounts.critical++;
    else if (v.severity === "high") severityCounts.high++;
    else if (v.severity === "medium") severityCounts.medium++;
    else if (v.severity === "low") severityCounts.low++;
    frameworkCounts[v.framework] = (frameworkCounts[v.framework] || 0) + 1;
  });
  const passedCount = rules.length - new Set(violations.map((v) => v.rule_id)).size;
  const score = violations.length > 0
    ? Math.max(0, 100 - violations.reduce((sum, v) => {
        const deductions = { critical: 20, high: 12, medium: 7, low: 3 };
        return sum + (deductions[v.severity] || 7);
      }, 0))
    : 100;
  const grade = score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
  const frameworks = Object.entries(frameworkCounts).sort((a, b) => b[1] - a[1]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="mx-auto max-w-4xl py-16 text-center">
        <p className="text-muted-foreground">Document not found.</p>
        <Button onClick={() => navigate("/compliance/details")} variant="outline" className="mt-4">
          Back to Compliance Details
        </Button>
      </div>
    );
  }

  const groupedByFramework = {};
  violations.forEach((v) => {
    if (!groupedByFramework[v.framework]) groupedByFramework[v.framework] = [];
    groupedByFramework[v.framework].push(v);
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/compliance/details")}>
          <ArrowLeft className="size-4 mr-1" />
          Back to Compliance Details
        </Button>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4 min-w-0">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <FileText className="size-6 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate max-w-lg">
                {doc.original_filename || doc.filename}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {doc.page_count ? `${doc.page_count} pages` : "---"}
                {violations.length > 0 && ` · ${frameworks.length} framework${frameworks.length !== 1 ? "s" : ""} audited`}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-3xl font-bold ${score >= 75 ? "text-green-600" : score >= 45 ? "text-amber-600" : "text-red-600"}`}>
              {score}
              <span className="text-sm font-normal text-muted-foreground">/100</span>
            </p>
            <div className={`flex items-center justify-end gap-1 mt-1`}>
              <span className={`inline-flex items-center justify-center rounded-full w-8 h-8 text-sm font-bold ${
                grade >= "A" ? "bg-green-100 text-green-700" :
                grade >= "C" ? "bg-amber-100 text-amber-700" :
                "bg-red-100 text-red-700"
              }`}>{grade}</span>
              <span className="text-xs text-muted-foreground">Grade</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-3 mt-6">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-center">
            <p className="text-xl font-bold text-red-600">{severityCounts.critical}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Critical</p>
          </div>
          <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-center">
            <p className="text-xl font-bold text-orange-600">{severityCounts.high}</p>
            <p className="text-xs text-muted-foreground mt-0.5">High</p>
          </div>
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-center">
            <p className="text-xl font-bold text-amber-600">{severityCounts.medium}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Medium</p>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{severityCounts.low}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Low</p>
          </div>
          <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-center">
            <p className="text-xl font-bold text-green-600">{passedCount}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Passed</p>
          </div>
        </div>
      </div>

      {violations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-16 text-center">
          <CheckCircle2 className="mb-3 size-10 text-green-600" />
          <p className="text-lg font-semibold text-foreground">No violations found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            This document passed all compliance checks.
          </p>
        </div>
      ) : (
        frameworks.map(([fw]) => {
          const fwViolations = groupedByFramework[fw] || [];
          const isOpen = expandedFrameworks[fw] ?? false;
          return (
            <div key={fw} className="rounded-xl border border-border bg-card overflow-hidden">
              <button
                onClick={() => setExpandedFrameworks((prev) => ({ ...prev, [fw]: !prev[fw] }))}
                className="flex w-full items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left border-b border-border"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}
                  <Shield className="size-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">{fw}</span>
                  <span className="text-xs text-muted-foreground">({fwViolations.length} violation{fwViolations.length !== 1 ? "s" : ""})</span>
                </div>
              </button>
              {isOpen && (
              <div className="divide-y divide-border">
                {fwViolations
                  .sort((a, b) => (severityOrder[a.severity] ?? 99) - (severityOrder[b.severity] ?? 99))
                  .map((v) => {
                    const Icon = severityConfig[v.severity]?.icon;
                    return (
                      <div key={v.id} className="px-4 py-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div
                            className={`flex size-7 shrink-0 items-center justify-center rounded-lg mt-0.5 ${
                              severityConfig[v.severity]?.color || "text-muted-foreground bg-muted"
                            }`}
                          >
                            {Icon ? <Icon className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-card-foreground">{v.title}</span>
                              <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium capitalize ${
                                severityConfig[v.severity]?.color || "text-muted-foreground bg-muted border-border"
                              }`}>{v.severity}</span>
                              {v.confidence != null && (
                                <span className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-xs font-medium ${
                                  v.confidence >= 80 ? "text-green-600 bg-green-50 border-green-200" :
                                  v.confidence >= 60 ? "text-amber-600 bg-amber-50 border-amber-200" :
                                  "text-red-600 bg-red-50 border-red-200"
                                }`}>{v.confidence}%</span>
                              )}
                            </div>
                            {v.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{v.description}</p>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={() => setShowRemediation((prev) => ({ ...prev, [v.id]: !prev[v.id] }))}
                          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 shrink-0 ml-3 mt-0.5"
                        >
                          <Sparkles className="size-3.5" />
                          {showRemediation[v.id] ? "Hide Fix" : "Generate Fix"}
                        </button>
                      </div>
                      {showRemediation[v.id] && (
                        <div className="mt-3">
                          <RemediationCopilot violation={v} />
                        </div>
                      )}
                    </div>
                    );
                  })}
              </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
