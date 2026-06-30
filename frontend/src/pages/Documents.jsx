import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, FileText } from "lucide-react";
import DocumentCard from "../components/DocumentCard";
import UploadDialog from "../components/UploadDialog";
import { listDocuments } from "../lib/api";

export default function Documents() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  async function refetch() {
    setLoading(true);
    setError(null);
    try {
      const data = await listDocuments();
      setDocs(data);
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

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload and manage your policy documents for compliance analysis
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <Upload className="size-4" />
          Upload PDF
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="size-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </div>
      )}

      {!loading && !error && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-20 text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
            <FileText className="size-7 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium text-foreground">No documents yet</h3>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">
            Upload a PDF to begin compliance analysis
          </p>
          <button
            onClick={() => setUploadOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Upload className="size-4" />
            Upload PDF
          </button>
        </div>
      )}

      {!loading && !error && docs.length > 0 && (
        <div className="space-y-3">
          {docs.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onDelete={(id) => setDocs((prev) => prev.filter((d) => d.id !== id))}
            />
          ))}
        </div>
      )}

      <UploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onSuccess={refetch}
      />
    </div>
  );
}
