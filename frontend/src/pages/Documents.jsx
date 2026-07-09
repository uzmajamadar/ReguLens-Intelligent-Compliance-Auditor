import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Search, LayoutGrid, List,
  FileText, Clock, Shield, CheckCircle2, AlertCircle,
  Eye, Download, Trash2, Scan, MoreHorizontal,
  Loader2, X, RefreshCw, Pencil, MessageSquare, BarChart3,
  SlidersHorizontal,
} from "lucide-react";
import { listDocuments, listScans, deleteDocument, viewDocument, downloadDocument, runScan, updateDocumentFrameworks, listReviewTasks } from "../lib/api";
import UploadDialog from "../components/UploadDialog";
import { useToast } from "../hooks/use-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { PageHeader } from "../components/shared/PageHeader";
import { EmptyState } from "../components/shared/EmptyState";
import { StatusBadge } from "../components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "../components/shared/ConfirmDialog";
import { cn } from "@/lib/utils";

const ALL_FRAMEWORKS = [
  "GDPR", "HIPAA", "SOC2", "PCI-DSS", "ISO27001", "HR",
  "Guardrails & Safety", "Document Lifecycle & Grounding",
];

const STATUS_OPTIONS = ["All Statuses", "Uploaded", "Processing", "Indexed", "Scanned", "Error"];

const frameworkBadgeColors = {
  "GDPR": "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800",
  "HIPAA": "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  "SOC2": "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
  "PCI-DSS": "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  "ISO27001": "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800",
  "HR": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  "Guardrails & Safety": "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800",
  "Document Lifecycle & Grounding": "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/20 dark:text-teal-300 dark:border-teal-800",
};

function formatSize(bytes) {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let size = bytes;
  while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return "—"; }
}

function getScanDisplay(scans) {
  if (!scans || scans.length === 0) return null;
  const completed = scans.filter((s) => s.status === "completed");
  if (completed.length === 0) return null;

  const byGroup = {};
  const singles = [];
  for (const s of completed) {
    if (s.scan_group_id) {
      (byGroup[s.scan_group_id] = byGroup[s.scan_group_id] || []).push(s);
    } else {
      singles.push(s);
    }
  }

  const groups = Object.values(byGroup);
  groups.sort((a, b) => {
    const aLatest = Math.max(...a.map((s) => new Date(s.created_at)));
    const bLatest = Math.max(...b.map((s) => new Date(s.created_at)));
    return bLatest - aLatest;
  });

  if (groups.length > 0) {
    const group = groups[0];
    return {
      score: Math.round(group.reduce((s, scan) => s + scan.score, 0) / group.length),
      violation_count: group.reduce((s, scan) => s + scan.violation_count, 0),
      status: "completed",
      isMulti: true,
      lastScan: group.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b).created_at,
    };
  }

  return completed.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
}

function ChangeFrameworksDialog({ open, onOpenChange, doc, onSaved }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(() => doc?.frameworks || []);

  function toggle(fw) {
    setSelected((prev) =>
      prev.includes(fw) ? prev.filter((f) => f !== fw) : [...prev, fw]
    );
  }

  async function handleSave() {
    if (!doc) return;
    setSaving(true);
    try {
      await updateDocumentFrameworks(doc.id, selected);
      toast({ title: "Frameworks updated" });
      onSaved?.();
      onOpenChange(false);
    } catch {
      toast({ title: "Failed to update frameworks", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-6 text-popover-foreground shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <AlertDialog.Title className="text-lg font-semibold">Change Frameworks</AlertDialog.Title>
            <button onClick={() => onOpenChange(false)} className="rounded-md p-1 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>

          {doc && (
            <p className="mb-3 text-sm text-muted-foreground truncate">
              {doc.original_filename || doc.filename}
            </p>
          )}

          <div className="space-y-1.5 mb-5">
            {ALL_FRAMEWORKS.map((fw) => (
              <label
                key={fw}
                onClick={() => toggle(fw)}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <div
                  className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    selected.includes(fw)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input bg-background"
                  }`}
                >
                  {selected.includes(fw) && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
                <span className="text-sm text-foreground">{fw}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1 gap-2">
              {saving && <Loader2 className="size-4 animate-spin" />}
              Save
            </Button>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

const FILTER_PRESETS = [
  { label: "All Documents", filterStatus: null, filterFramework: null },
  { label: "Scanned", filterStatus: "scanned", filterFramework: null },
  { label: "Pending", filterStatus: "pending", filterFramework: null },
  { label: "Critical Issues", filterStatus: null, filterFramework: null, criticalOnly: true },
];

export default function Documents() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [docs, setDocs] = useState([]);
  const [scansMap, setScansMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [scanning, setScanning] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [frameworkFilter, setFrameworkFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [viewMode, setViewMode] = useState("grid");
  const [selected, setSelected] = useState(new Set());
  const [changeFwDoc, setChangeFwDoc] = useState(null);
  const [reviewTasksMap, setReviewTasksMap] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const docId = (d) => d.id ?? d.document_id;

  async function loadScans(documents) {
    const scanPromises = documents.map(async (doc) => {
      try {
        const scans = await listScans(docId(doc));
        return { docId: docId(doc), scans };
      } catch {
        return { docId: docId(doc), scans: [] };
      }
    });
    const scanResults = await Promise.all(scanPromises);
    const map = {};
    scanResults.forEach(({ docId, scans }) => { map[docId] = scans; });
    return map;
  }

  async function loadReviewMap() {
    try {
      const all = await listReviewTasks("");
      const map = {};
      all.forEach((t) => {
        if (!map[t.document_id]) map[t.document_id] = [];
        map[t.document_id].push(t);
      });
      return map;
    } catch { return {}; }
  }

  async function refetch() {
    setLoading(true);
    setError(null);
    try {
      const data = await listDocuments();
      setDocs(data);
      const [map, reviewMap] = await Promise.all([loadScans(data), loadReviewMap()]);
      setScansMap(map);
      setReviewTasksMap(reviewMap);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listDocuments();
        if (!cancelled) setDocs(data);
        const [map, reviewMap] = await Promise.all([loadScans(data), loadReviewMap()]);
        if (!cancelled) { setScansMap(map); setReviewTasksMap(reviewMap); }
      } catch (err) {
        if (!cancelled) {
          if (err.message.includes("401") || err.message.includes("Unauthorized")) {
            navigate("/login", { replace: true });
            return;
          }
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate]);

  async function handleDelete(id) {
    try {
      await deleteDocument(id);
      setDocs((prev) => prev.filter((d) => docId(d) !== id));
      setSelected((prev) => { const next = new Set(prev); next.delete(id); return next; });
      toast({ title: "File deleted" });
    } catch { toast({ title: "Failed to delete file", variant: "destructive" }); }
  }

  function confirmDeleteSingle(id) { setDeleteConfirm({ type: "single", id }); }

  function handleView(id) {
    viewDocument(id).catch(() => toast({ title: "Failed to open document", variant: "destructive" }));
  }

  function handleDownload(id) {
    downloadDocument(id).catch(() => toast({ title: "Failed to download document", variant: "destructive" }));
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    try {
      await Promise.all(ids.map((id) => deleteDocument(id)));
      setDocs((prev) => prev.filter((d) => !selected.has(docId(d))));
      toast({ title: `${ids.length} file${ids.length > 1 ? "s" : ""} deleted` });
      setSelected(new Set());
    } catch { toast({ title: "Failed to delete some files", variant: "destructive" }); }
  }

  function confirmBulkDelete() { setDeleteConfirm({ type: "bulk" }); }

  async function handleScan(id, frameworks) {
    const key = `${id}-scan`;
    if (scanning[key]) return;
    setScanning((prev) => ({ ...prev, [key]: true }));
    try {
      const fwList = frameworks && frameworks.length > 0 ? frameworks : ["GDPR"];
      const result = await runScan(id, fwList);
      const newScans = result.scans || [result];
      setScansMap((prev) => ({ ...prev, [id]: [...(prev[id] || []), ...newScans] }));
      toast({ title: `Scan complete for ${fwList.join(", ")}` });
    } catch { toast({ title: "Failed to start scan", variant: "destructive" }); }
    finally { setScanning((prev) => ({ ...prev, [key]: false })); }
  }

  const filteredDocs = useMemo(() => {
    let result = [...docs];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) =>
        (d.original_filename || d.filename || "").toLowerCase().includes(q)
      );
    }
    if (frameworkFilter !== "all") {
      result = result.filter((d) => {
        const docFrameworks = d.frameworks || [];
        const scanFrameworks = (scansMap[d.id] || []).map((s) => s.framework).filter(Boolean);
        const allFw = [...new Set([...docFrameworks, ...scanFrameworks])];
        return allFw.includes(frameworkFilter);
      });
    }
    if (statusFilter !== "all") {
      result = result.filter((d) => {
        const s = (d.status || "").toLowerCase();
        if (statusFilter === "pending") return s === "processing" || s === "uploaded" || s === "pending";
        if (statusFilter === "scanned") return s === "scanned" || (scansMap[docId(d)] || []).some((sc) => sc.status === "completed");
        if (statusFilter === "error") return s === "error";
        return s === statusFilter.toLowerCase();
      });
    }
    result.sort((a, b) => {
      const aName = (a.original_filename || a.filename || "").toLowerCase();
      const bName = (b.original_filename || b.filename || "").toLowerCase();
      const aDate = new Date(a.upload_time || a.created_at || 0);
      const bDate = new Date(b.upload_time || b.created_at || 0);
      const aScan = getScanDisplay(scansMap[docId(a)] || []);
      const bScan = getScanDisplay(scansMap[docId(b)] || []);
      switch (sortBy) {
        case "name": return aName.localeCompare(bName);
        case "name-desc": return bName.localeCompare(aName);
        case "date": return bDate - aDate;
        case "date-asc": return aDate - bDate;
        case "score": return (bScan?.score ?? -1) - (aScan?.score ?? -1);
        case "score-asc": return (aScan?.score ?? -1) - (bScan?.score ?? -1);
        case "violations": return (bScan?.violation_count ?? 0) - (aScan?.violation_count ?? 0);
        default: return 0;
      }
    });
    return result;
  }, [docs, searchQuery, frameworkFilter, statusFilter, sortBy, scansMap]);

  const docCount = docs.length;
  const scannedCount = docs.filter((d) => {
    const scans = scansMap[docId(d)] || [];
    return scans.some((s) => s.status === "completed");
  }).length;

  if (loading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto w-full px-6 py-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3.5 w-60" />
          </div>
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-20" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </div>
              <Skeleton className="h-3.5 w-24" />
              <div className="flex gap-1.5">
                <Skeleton className="h-5 w-14 rounded-md" />
                <Skeleton className="h-5 w-14 rounded-md" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="size-4" />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-6 py-6">
      <PageHeader title="Documents" description={`${docCount} document${docCount !== 1 ? "s" : ""} · ${scannedCount} scanned`}>
        <Button variant="outline" size="sm" onClick={refetch} className="gap-1.5">
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <Upload className="size-4" />
          Upload File
        </Button>
      </PageHeader>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 h-9 text-sm"
          />
        </div>

        <Select value={frameworkFilter} onValueChange={setFrameworkFilter}>
          <SelectTrigger className="h-9 w-40 text-xs gap-1">
            <SlidersHorizontal className="size-3.5 text-muted-foreground" />
            <SelectValue placeholder="All Frameworks" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Frameworks</SelectItem>
            {ALL_FRAMEWORKS.map((fw) => (
              <SelectItem key={fw} value={fw}>{fw}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36 text-xs gap-1">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s === "All Statuses" ? "all" : s.toLowerCase()}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={setSortBy}>
          <SelectTrigger className="h-9 w-36 text-xs gap-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Newest First</SelectItem>
            <SelectItem value="date-asc">Oldest First</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="name-desc">Name (Z-A)</SelectItem>
            <SelectItem value="score">Score (High-Low)</SelectItem>
            <SelectItem value="score-asc">Score (Low-High)</SelectItem>
            <SelectItem value="violations">Most Violations</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center rounded-lg border border-input bg-background p-0.5">
          <button
            onClick={() => setViewMode("list")}
            className={`flex size-7 items-center justify-center rounded-md text-xs transition-colors ${viewMode === "list" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <List className="size-3.5" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={`flex size-7 items-center justify-center rounded-md text-xs transition-colors ${viewMode === "grid" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}
          >
            <LayoutGrid className="size-3.5" />
          </button>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-xl border bg-card shadow-dropdown px-5 py-2.5 animate-in slide-in-from-bottom-8 duration-300">
          <span className="text-xs font-semibold text-foreground">
            {selected.size} selected
          </span>
          <div className="h-4 w-px bg-border" />
          <Button variant="destructive" size="sm" className="gap-1.5 h-8 text-xs font-semibold" onClick={confirmBulkDelete}>
            <Trash2 className="size-3.5" />
            Delete selected
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelected(new Set())}>
            Cancel
          </Button>
        </div>
      )}

      {docs.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No documents yet"
          description="Upload compliance documents to begin scanning and analysis"
          action={
            <Button onClick={() => setUploadOpen(true)} className="gap-2">
              <Upload className="size-4" />
              Upload File
            </Button>
          }
        />
      ) : viewMode === "list" ? (
        <div className="rounded-xl border bg-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="h-10 px-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-border accent-primary"
                    checked={docs.length > 0 && selected.size === docs.length}
                    onChange={() => {
                      if (selected.size === docs.length) setSelected(new Set());
                      else setSelected(new Set(docs.map((d) => docId(d))));
                    }}
                  />
                </th>
                <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Name</th>
                <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Framework</th>
                <th className="h-10 px-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">Score</th>
                <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                <th className="h-10 px-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Owner</th>
                <th className="h-10 px-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocs.map((doc) => {
                const id = docId(doc);
                const isSelected = selected.has(id);
                const scans = scansMap[id] || [];
                const latest = getScanDisplay(scans);
                const docFrameworks = doc.frameworks || [];

                return (
                  <tr key={id} className={`border-b border-border transition-colors ${isSelected ? "bg-accent/30" : "hover:bg-muted/30"}`}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        className="size-3.5 rounded border-border accent-primary"
                        checked={isSelected}
                        onChange={() => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            next.has(id) ? next.delete(id) : next.add(id);
                            return next;
                          });
                        }}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {doc.original_filename || doc.filename || "Untitled"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatSize(doc.file_size)} · v{Math.max(1, scans.length)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {latest ? (
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${frameworkBadgeColors[latest.framework] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                            {latest.framework}
                          </span>
                        ) : docFrameworks.length > 0 ? (
                          docFrameworks.slice(0, 2).map((fw, i) => (
                            <span key={i} className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${frameworkBadgeColors[fw] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                              {fw}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {!latest && docFrameworks.length > 2 && (
                          <span className="text-[10px] text-muted-foreground">+{docFrameworks.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {latest?.score != null ? (
                        <span className={cn("text-sm font-semibold", latest.score >= 75 ? "text-success" : latest.score >= 45 ? "text-warning" : "text-destructive")}>
                          {latest.score}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {latest ? (
                        <StatusBadge variant={latest.status === "completed" ? "success" : latest.status === "running" ? "info" : "warning"}>
                          {latest.status === "running" ? "Scanning" : "Scanned"}
                        </StatusBadge>
                      ) : (
                        <StatusBadge variant={doc.status === "error" ? "destructive" : "pending"}>
                          {doc.status === "error" ? "Error" : doc.status || "Uploaded"}
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs text-foreground">{doc.uploaded_by_name || "—"}</span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => handleView(id)}>
                            <Eye className="size-4" /> View Document
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/documents/${id}?tab=compliance`)}>
                            <BarChart3 className="size-4" /> Compliance Report
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/auditor-ai?documentId=${id}`)}>
                            <MessageSquare className="size-4" /> Chat with AI
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleScan(id, docFrameworks)} disabled={scanning[`${id}-scan`]}>
                            {scanning[`${id}-scan`] ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                            {scanning[`${id}-scan`] ? "Scanning..." : "Re-Scan"}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setChangeFwDoc({ id, ...doc })}>
                            <Pencil className="size-4" /> Change Frameworks
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDownload(id)}>
                            <Download className="size-4" /> Download
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => confirmDeleteSingle(id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                            <Trash2 className="size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 py-2.5 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {filteredDocs.length} of {docs.length} document{docs.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDocs.map((doc) => {
              const id = docId(doc);
              const scans = scansMap[id] || [];
              const latest = getScanDisplay(scans);
              const docFrameworks = doc.frameworks || [];
              const docReviewTasks = reviewTasksMap[id] || [];
              const pendingTasks = docReviewTasks.filter((t) => t.status === "pending_review");

              let wfStatus;
              if (pendingTasks.length > 0 && pendingTasks.some((t) => t.assigned_to)) {
                wfStatus = "In Review";
              } else if (pendingTasks.length > 0) {
                wfStatus = "Review Needed";
              } else if (docReviewTasks.some((t) => t.status === "approved")) {
                wfStatus = "Resolved";
              } else if (docReviewTasks.length > 0) {
                wfStatus = "Closed";
              } else {
                wfStatus = null;
              }

              const scanCount = scans.filter((s) => s.status === "completed").length;

              return (
                <div
                  key={id}
                  className="group relative rounded-xl border bg-card p-4 hover:shadow-sm transition-all"
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <FileText className="size-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground leading-snug">
                        {doc.original_filename || doc.filename || "Untitled"}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-px">
                        v{Math.max(1, scanCount || scans.length)} · {formatSize(doc.file_size)}
                      </p>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex size-7 items-center justify-center rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all focus:opacity-100">
                          <MoreHorizontal className="size-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-48">
                        <DropdownMenuItem onClick={() => handleView(id)}>
                          <Eye className="size-4" /> View
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/documents/${id}?tab=compliance`)}>
                          <BarChart3 className="size-4" /> Compliance
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/auditor-ai?documentId=${id}`)}>
                          <MessageSquare className="size-4" /> Chat
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleScan(id, docFrameworks)} disabled={scanning[`${id}-scan`]}>
                          {scanning[`${id}-scan`] ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                          {scanning[`${id}-scan`] ? "Scanning..." : "Re-Scan"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setChangeFwDoc({ id, ...doc })}>
                          <Pencil className="size-4" /> Frameworks
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => handleDownload(id)}>
                          <Download className="size-4" /> Download
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => confirmDeleteSingle(id)} className="text-destructive focus:text-destructive focus:bg-destructive/10">
                          <Trash2 className="size-4" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {latest && (
                    <div className="mb-3 flex items-center gap-2.5">
                      <span className={cn("text-lg font-bold tracking-tight leading-none", latest.score >= 75 ? "text-success" : latest.score >= 45 ? "text-warning" : "text-destructive")}>
                        {latest.score}
                        <span className="text-xs font-medium text-muted-foreground ml-0.5">%</span>
                      </span>
                      {wfStatus ? (
                        <StatusBadge variant={wfStatus === "Resolved" ? "success" : wfStatus === "In Review" ? "info" : wfStatus === "Review Needed" ? "warning" : "pending"}>
                          {wfStatus}
                        </StatusBadge>
                      ) : latest.status === "completed" ? (
                        <StatusBadge variant="success">Scanned</StatusBadge>
                      ) : null}
                    </div>
                  )}

                  {latest && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${frameworkBadgeColors[latest.framework] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                        {latest.framework}
                      </span>
                    </div>
                  )}

                  {!latest && docFrameworks.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {docFrameworks.slice(0, 3).map((fw, i) => (
                        <span key={i} className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${frameworkBadgeColors[fw] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                          {fw}
                        </span>
                      ))}
                      {docFrameworks.length > 3 && (
                        <span className="text-[10px] text-muted-foreground">+{docFrameworks.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className="space-y-1 text-xs text-muted-foreground">
                    {latest?.lastScan || latest?.created_at ? (
                      <p>Last scan: {formatDate(latest.lastScan || latest.created_at)}</p>
                    ) : doc.upload_time || doc.created_at ? (
                      <p>Uploaded: {formatDate(doc.upload_time || doc.created_at)}</p>
                    ) : null}
                    {doc.uploaded_by_name && (
                      <p>Owner: {doc.uploaded_by_name}</p>
                    )}
                  </div>

                  {!latest && !docFrameworks.length && (
                    <div className="mb-2">
                      <StatusBadge variant={doc.status === "error" ? "destructive" : "pending"}>
                        {doc.status === "error" ? "Error" : doc.status || "Uploaded"}
                      </StatusBadge>
                    </div>
                  )}

                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-1">
                    <button
                      onClick={() => handleView(id)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                    >
                      <Eye className="size-3.5" /> View
                    </button>
                    <button
                      onClick={() => handleScan(id, docFrameworks)}
                      disabled={scanning[`${id}-scan`]}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-50"
                    >
                      {scanning[`${id}-scan`] ? <Loader2 className="size-3.5 animate-spin" /> : <Scan className="size-3.5" />}
                      {scanning[`${id}-scan`] ? "Scanning" : "Scan"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredDocs.length === 0 && (
            <EmptyState
              icon={Search}
              title="No matching documents"
              description="Try adjusting your search or filters"
              action={
                <Button variant="outline" onClick={() => { setSearchQuery(""); setFrameworkFilter("all"); setStatusFilter("all"); }}>
                  Clear Filters
                </Button>
              }
            />
          )}

          <p className="mt-4 text-xs text-muted-foreground text-center">
            Showing {filteredDocs.length} of {docs.length} document{docs.length !== 1 ? "s" : ""}
          </p>
        </>
      )}

      <UploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onSuccess={refetch} />

      <ChangeFrameworksDialog
        key={changeFwDoc ? changeFwDoc.id : 'fw-closed'}
        open={!!changeFwDoc}
        onOpenChange={(open) => { if (!open) setChangeFwDoc(null); }}
        doc={changeFwDoc}
        onSaved={refetch}
      />

      <ConfirmDialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={() => {
          if (deleteConfirm?.type === "bulk") handleBulkDelete();
          else if (deleteConfirm?.id != null) handleDelete(deleteConfirm.id);
          setDeleteConfirm(null);
        }}
        title={deleteConfirm?.type === "bulk" ? `Delete ${selected.size} files?` : "Delete file?"}
        description={
          deleteConfirm?.type === "bulk"
            ? `Are you sure you want to delete ${selected.size} selected files? This action cannot be undone.`
            : "Are you sure you want to delete this file? This action cannot be undone."
        }
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
