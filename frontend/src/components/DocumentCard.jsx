import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, ChevronRight, Trash2 } from "lucide-react";
import { deleteDocument } from "../lib/api";

const statusColors = {
  indexed: "text-green-600 bg-green-50 border-green-200",
  ready: "text-blue-600 bg-blue-50 border-blue-200",
  processing: "text-yellow-600 bg-yellow-50 border-yellow-200",
  failed: "text-red-600 bg-red-50 border-red-200",
};

export default function DocumentCard({ doc, onDelete }) {
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false);

  async function handleDelete(e) {
    e.stopPropagation();
    if (deleting) return;
    setDeleting(true);
    try {
      await deleteDocument(doc.id);
      onDelete?.(doc.id);
    } catch {
      setDeleting(false);
    }
  }

  return (
    <div className="group flex items-center gap-4 rounded-lg border border-card-border bg-card p-4 transition-colors hover:bg-muted/50">
      <div
        className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-primary/10"
        onClick={() => navigate(`/documents/${doc.id}`)}
      >
        <FileText className="size-5 text-primary" />
      </div>

      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={() => navigate(`/documents/${doc.id}`)}
      >
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium text-card-foreground">
            {doc.original_filename || doc.filename}
          </p>
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
              statusColors[doc.status] || "text-gray-600 bg-gray-50 border-gray-200"
            }`}
          >
            {doc.status}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(doc.page_count != null) && (
            <span>{doc.page_count} pages</span>
          )}
          <span>v{doc.version_number}</span>
          {(doc.total_chunks != null) && (
            <span>{doc.total_chunks} chunks</span>
          )}
          {doc.upload_time && (
            <span>Uploaded {new Date(doc.upload_time).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      <button
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 disabled:opacity-30"
        title="Delete document"
      >
        <Trash2 className="size-4" />
      </button>

      <button
        onClick={() => navigate(`/documents/${doc.id}`)}
        className="rounded-md p-1.5 text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
