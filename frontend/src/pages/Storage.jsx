import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, FolderPlus, Search, ChevronDown, LayoutGrid, List,
  FileText, Clock, Shield, CheckCircle2, AlertCircle,
  Eye, Download, Trash2, Scan, MoreHorizontal,
  Move, Loader2, X, RefreshCw, Pencil, MessageSquare, BarChart3
} from "lucide-react";
import { listDocuments, listScans, deleteDocument, viewDocument, downloadDocument, runScan, updateDocumentFrameworks, listReviewTasks } from "../lib/api";
import UploadDialog from "../components/UploadDialog";
import { useToast } from "../hooks/use-toast";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
// eslint-disable-next-line no-unused-vars
import { Badge } from "../components/ui/badge";
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from "../components/ui/table";
import { Checkbox } from "../components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import * as AlertDialog from "@radix-ui/react-alert-dialog";

const ALL_FRAMEWORKS = [
  "GDPR", "HIPAA", "SOC2", "ISO27001", "PCI DSS", "Employment Law", "CCPA",
];

const statusColors = {
  completed: "text-green-700 bg-green-50 border-green-200",
  running: "text-blue-700 bg-blue-50 border-blue-200",
  pending: "text-yellow-700 bg-yellow-50 border-yellow-200",
  failed: "text-red-700 bg-red-50 border-red-200",
  uploaded: "text-gray-700 bg-gray-50 border-gray-200",
  processing: "text-blue-700 bg-blue-50 border-blue-200",
  indexed: "text-green-700 bg-green-50 border-green-200",
  scanned: "text-purple-700 bg-purple-50 border-purple-200",
};

const frameworkColors = {
  "GDPR": "bg-purple-100 text-purple-700 border-purple-200",
  "HIPAA": "bg-blue-100 text-blue-700 border-blue-200",
  "SOC2": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "Employment Law": "bg-amber-100 text-amber-700 border-amber-200",
  "PCI DSS": "bg-red-100 text-red-700 border-red-200",
  "ISO27001": "bg-sky-100 text-sky-700 border-sky-200",
  "CCPA": "bg-indigo-100 text-indigo-700 border-indigo-200",
};

function getFrameworkBadges(frameworks) {
  if (!frameworks || frameworks.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const base = "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium";
  return frameworks.map((fw, i) => (
    <span key={i} className={`${base} ${frameworkColors[fw] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
      {fw}
    </span>
  ));
}

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

function getLatestScan(scans) {
  if (!scans || scans.length === 0) return null;
  return scans.reduce((a, b) => new Date(a.created_at) > new Date(b.created_at) ? a : b);
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

export default function Storage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [docs, setDocs] = useState([]);
  const [scansMap, setScansMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [scanning, setScanning] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [viewMode, setViewMode] = useState("list");
  const [selected, setSelected] = useState(new Set());
  const [changeFwDoc, setChangeFwDoc] = useState(null);
  const [reviewTasksMap, setReviewTasksMap] = useState({});

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
    scanResults.forEach(({ docId, scans }) => {
      map[docId] = scans;
    });
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
    } catch {
      return {};
    }
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
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
    } catch {
      toast({ title: "Failed to delete file", variant: "destructive" });
    }
  }

  async function handleBulkDelete() {
    const ids = [...selected];
    try {
      await Promise.all(ids.map((id) => deleteDocument(id)));
      setDocs((prev) => prev.filter((d) => !selected.has(docId(d))));
      toast({ title: `${ids.length} file${ids.length > 1 ? "s" : ""} deleted` });
      setSelected(new Set());
    } catch {
      toast({ title: "Failed to delete some files", variant: "destructive" });
    }
  }

  async function handleScan(id, frameworks) {
    const key = `${id}-scan`;
    if (scanning[key]) return;
    setScanning((prev) => ({ ...prev, [key]: true }));
    try {
      const fwList = frameworks && frameworks.length > 0 ? frameworks : ["GDPR"];
      await runScan(id, fwList);
      toast({ title: `Scan started for ${fwList.join(", ")}` });
    } catch {
      toast({ title: "Failed to start scan", variant: "destructive" });
    } finally {
      setScanning((prev) => ({ ...prev, [key]: false }));
    }
  }

  const filteredDocs = useMemo(() => {
    let result = [...docs];
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter((d) =>
        (d.original_filename || d.filename || "").toLowerCase().includes(q)
      );
    }
    result.sort((a, b) => {
      const aName = (a.original_filename || a.filename || "").toLowerCase();
      const bName = (b.original_filename || b.filename || "").toLowerCase();
      switch (sortBy) {
        case "name": return aName.localeCompare(bName);
        case "name-desc": return bName.localeCompare(aName);
        case "date": return new Date(b.upload_time || 0) - new Date(a.upload_time || 0);
        case "date-asc": return new Date(a.upload_time || 0) - new Date(b.upload_time || 0);
        case "size": return (b.file_size || 0) - (a.file_size || 0);
        case "size-asc": return (a.file_size || 0) - (b.file_size || 0);
        case "status": return (a.status || "").localeCompare(b.status || "");
        default: return 0;
      }
    });
    return result;
  }, [docs, searchQuery, sortBy]);

  const stats = useMemo(() => ({
    total: docs.length,
    indexed: docs.filter((d) => (d.status || "").toLowerCase() === "indexed").length,
    pending: docs.filter((d) => {
      const s = (d.status || "").toLowerCase();
      return s === "processing" || s === "uploaded";
    }).length,
    reports: docs.filter((d) => (d.status || "").toLowerCase() === "scanned").length,
  }), [docs]);

  const allSelected = docs.length > 0 && selected.size === docs.length;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(docs.map((d) => docId(d))));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
<div className="mx-auto max-w-7xl py-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="size-4" />
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8">
      {/* Breadcrumb */}
      <nav className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
        <span className="font-medium text-foreground/60">Storage</span>
        <ChevronDown className="size-3 -rotate-90" />
        <span className="font-medium text-foreground">Files</span>
      </nav>

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Files</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Upload and manage compliance documents with scan results
        </p>
      </div>

      {/* Stats Cards */}
      <div className="mb-8 grid grid-cols-4 gap-4">
        {[
          { icon: FileText, label: "Total Documents", value: stats.total, color: "text-blue-600 bg-blue-50" },
          { icon: CheckCircle2, label: "Indexed Documents", value: stats.indexed, color: "text-green-600 bg-green-50" },
          { icon: Clock, label: "Pending Processing", value: stats.pending, color: "text-amber-600 bg-amber-50" },
          { icon: Shield, label: "Compliance Reports", value: stats.reports, color: "text-purple-600 bg-purple-50" },
        ].map(({ icon: Icon, label, value, color }) => (
          <div key={label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <div className={`flex size-11 items-center justify-center rounded-xl ${color}`}>
                <Icon className="size-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Top Actions Bar */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <FolderPlus className="size-4" />
            Create Folder
          </Button>
          <Button onClick={() => setUploadOpen(true)} className="gap-2 shadow-xs">
            <Upload className="size-4" />
            Upload File
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 pl-9 h-9 text-sm"
            />
          </div>
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-9 w-40 text-sm gap-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z-A)</SelectItem>
              <SelectItem value="date">Newest First</SelectItem>
              <SelectItem value="date-asc">Oldest First</SelectItem>
              <SelectItem value="size">Largest First</SelectItem>
              <SelectItem value="size-asc">Smallest First</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center rounded-lg border border-input bg-background p-0.5">
            <button
              onClick={() => setViewMode("list")}
              className={`flex size-7 items-center justify-center rounded-md text-xs transition-colors ${viewMode === "list" ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="size-3.5" />
            </button>
            <button
              onClick={() => setViewMode("grid")}
              className={`flex size-7 items-center justify-center rounded-md text-xs transition-colors ${viewMode === "grid" ? "bg-accent text-accent-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Toolbar */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3">
          <span className="text-sm font-medium text-foreground">
            {selected.size} selected
          </span>
          <div className="ml-2 h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Move className="size-3.5" />
            Move
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Download className="size-3.5" />
            Download
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-red-600 hover:text-red-600 hover:bg-red-50" onClick={handleBulkDelete}>
            <Trash2 className="size-3.5" />
            Delete
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
            <Scan className="size-3.5" />
            Run Compliance Scan
          </Button>
          <div className="ml-auto">
            <button onClick={() => setSelected(new Set())} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      {/* Content: List or Grid */}
      {docs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-24 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted">
            <FileText className="size-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">No files uploaded yet</h3>
          <p className="mt-1 mb-6 max-w-sm text-sm text-muted-foreground">
            Upload compliance documents to begin analysis
          </p>
          <Button onClick={() => setUploadOpen(true)} className="gap-2 shadow-xs">
            <Upload className="size-4" />
            Upload File
          </Button>
        </div>
      ) : viewMode === "list" ? (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead className="min-w-50">Name</TableHead>
                <TableHead className="w-32.5">Framework</TableHead>
                <TableHead className="w-20 text-center">Score</TableHead>
                <TableHead className="w-22.5 text-center">Violations</TableHead>
                <TableHead className="w-27.5">Workflow</TableHead>
                <TableHead className="w-27.5">Scan Status</TableHead>
                <TableHead className="w-10 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocs.map((doc) => {
                const id = docId(doc);
                const isSelected = selected.has(id);
                const docFrameworks = doc.frameworks || [];
                const scans = scansMap[id] || [];
                const latest = getLatestScan(scans);
                const docReviewTasks = reviewTasksMap[id] || [];
                const pendingTasks = docReviewTasks.filter((t) => t.status === "pending_review");
                const approvedTasks = docReviewTasks.filter((t) => t.status === "approved");
                let wfStatus, wfColor;
                if (pendingTasks.length > 0 && pendingTasks.some((t) => t.assigned_to)) {
                  wfStatus = "In Review";
                  wfColor = "bg-blue-100 text-blue-700 border-blue-200";
                } else if (pendingTasks.length > 0) {
                  wfStatus = "Review Needed";
                  wfColor = "bg-amber-100 text-amber-700 border-amber-200";
                } else if (approvedTasks.length > 0) {
                  wfStatus = "Resolved";
                  wfColor = "bg-green-100 text-green-700 border-green-200";
                } else if (docReviewTasks.length > 0) {
                  wfStatus = "Closed";
                  wfColor = "bg-gray-100 text-gray-600 border-gray-200";
                } else {
                  wfStatus = "Open";
                  wfColor = "bg-gray-100 text-gray-600 border-gray-200";
                }

                return (
                  <TableRow key={id} data-state={isSelected ? "selected" : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            checked ? next.add(id) : next.delete(id);
                            return next;
                          });
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                          <FileText className="size-4 text-primary" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">
                            {doc.original_filename || doc.filename || "Untitled"}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatSize(doc.file_size)}
                            {doc.uploaded_by_name && <> · {doc.uploaded_by_name}</>}
                            {(doc.upload_time || doc.created_at) && <> · {formatDate(doc.upload_time || doc.created_at)}</>}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {latest ? (
                          <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium ${frameworkColors[latest.framework] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                            {latest.framework}
                          </span>
                        ) : (
                          getFrameworkBadges(docFrameworks)
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {latest?.score != null ? (
                        <span className={`text-sm font-semibold ${
                          latest.score >= 75 ? "text-green-600" : latest.score >= 45 ? "text-amber-600" : "text-red-600"
                        }`}>
                          {latest.score}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {latest != null ? (
                        <span className={`inline-flex items-center gap-1 text-sm font-medium ${
                          latest.violation_count > 0 ? "text-red-600" : "text-green-600"
                        }`}>
                          {latest.violation_count > 0 ? (
                            <AlertCircle className="size-3.5" />
                          ) : (
                            <CheckCircle2 className="size-3.5" />
                          )}
                          {latest.violation_count || 0}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground/50">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${wfColor}`}>
                        {wfStatus}
                      </span>
                    </TableCell>
                    <TableCell>
                      {latest ? (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${
                          statusColors[latest.status] || statusColors.uploaded
                        }`}>
                          {latest.status === "running" && <Loader2 className="size-3 animate-spin mr-1" />}
                          {latest.status === "pending" ? "Processing..." : latest.status}
                        </span>
                      ) : (
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusColors.uploaded}`}>
                          Not scanned
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
                            <MoreHorizontal className="size-4" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => viewDocument(id)}>
                            <Eye className="size-4" />
                            View Document
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleScan(id, docFrameworks)}
                            disabled={scanning[`${id}-scan`]}
                          >
                            {scanning[`${id}-scan`] ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                            Re-Scan
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/auditor-ai?documentId=${id}`)}>
                            <MessageSquare className="size-4" />
                            Chat with AI
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => navigate(`/compliance/details/${id}`)}>
                            <BarChart3 className="size-4" />
                            View Compliance Report
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setChangeFwDoc({ id, ...doc })}>
                            <Pencil className="size-4" />
                            Change Frameworks
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => downloadDocument(id)}>
                            <Download className="size-4" />
                            Download
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleDelete(id)} className="text-red-600 focus:text-red-600 focus:bg-red-50">
                            <Trash2 className="size-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      ) : (
        /* Grid View */
        <div className="grid grid-cols-3 gap-4">
          {filteredDocs.map((doc) => {
            const id = docId(doc);
            const docFrameworks = doc.frameworks || [];
            const scans = scansMap[id] || [];
            const latest = getLatestScan(scans);

            return (
              <div key={id} className="group rounded-xl border border-border bg-card p-5 hover:shadow-sm transition-shadow">
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
                    <FileText className="size-5 text-primary" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex size-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground hover:bg-accent transition-all">
                        <MoreHorizontal className="size-4" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={() => viewDocument(id)}>View</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleScan(id, docFrameworks)}>Re-Scan</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/auditor-ai?documentId=${id}`)}>Chat with AI</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigate(`/compliance/details/${id}`)}>Compliance Report</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setChangeFwDoc({ id, ...doc })}>Change Frameworks</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => downloadDocument(id)}>Download</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleDelete(id)} className="text-red-600">Delete</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <p className="truncate text-sm font-medium text-foreground">
                  {doc.original_filename || doc.filename || "Untitled"}
                </p>
                {latest && (
                  <div className="mt-2 flex items-center gap-3">
                    <span className={`text-sm font-semibold ${
                      latest.score >= 75 ? "text-green-600" : latest.score >= 45 ? "text-amber-600" : "text-red-600"
                    }`}>
                      Score: {latest.score}
                    </span>
                    <span className={`text-xs font-medium ${latest.violation_count > 0 ? "text-red-600" : "text-green-600"}`}>
                      {latest.violation_count > 0 ? `${latest.violation_count} violation(s)` : "No violations"}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex items-center gap-2">
                  {latest && (
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize ${
                      statusColors[latest.status] || statusColors.uploaded
                    }`}>
                      {latest.status}
                    </span>
                  )}
                  {!latest && <span className="text-xs text-muted-foreground">Not scanned</span>}
                  <span className="text-xs text-muted-foreground">{formatSize(doc.file_size)}</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {latest ? (
                    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-medium ${frameworkColors[latest.framework] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
                      {latest.framework}
                    </span>
                  ) : (
                    getFrameworkBadges(docFrameworks)
                  )}
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Uploaded by {doc.uploaded_by_name || "—"} &middot; {formatDate(doc.upload_time || doc.created_at)}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Results count */}
      {docs.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground text-center">
          Showing {filteredDocs.length} of {docs.length} file{docs.length !== 1 ? "s" : ""}
        </p>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={refetch}
      />

      <ChangeFrameworksDialog
        key={changeFwDoc ? changeFwDoc.id : 'fw-closed'}
        open={!!changeFwDoc}
        onOpenChange={(open) => { if (!open) setChangeFwDoc(null); }}
        doc={changeFwDoc}
        onSaved={refetch}
      />
    </div>
  );
}
