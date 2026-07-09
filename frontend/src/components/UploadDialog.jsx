import { useState, useRef } from "react";
import { Upload, X, FileText, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { uploadDocument } from "../lib/api";

const AVAILABLE_FRAMEWORKS = [
  "GDPR",
  "HIPAA",
  "SOC2",
  "PCI-DSS",
  "ISO27001",
  "HR",
  "Guardrails & Safety",
  "Document Lifecycle & Grounding",
];

export default function UploadDialog({ open, onOpenChange, onSuccess }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [frameworks, setFrameworks] = useState([]);
  const inputRef = useRef(null);
  const submittingRef = useRef(false);

  function handleDrop(e) {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && f.type === "application/pdf") {
      setFile(f);
      setResult(null);
      setError(null);
    }
  }

  function handleSelect(e) {
    const f = e.target.files[0];
    if (f) {
      setFile(f);
      setResult(null);
      setError(null);
    }
  }

  function toggleFramework(fw) {
    setFrameworks((prev) =>
      prev.includes(fw) ? prev.filter((f) => f !== fw) : [...prev, fw]
    );
  }

  function handleRemoveFile() {
    setFile(null);
    setFrameworks([]);
    setResult(null);
    setError(null);
  }

  async function handleUpload() {
    if (!file || submittingRef.current) return;
    submittingRef.current = true;
    setUploading(true);
    setProgress(0);
    setError(null);
    setResult(null);

    try {
      const data = await uploadDocument(file, setProgress, frameworks);
      setResult(data);

      setTimeout(() => {
        onOpenChange(false);
        onSuccess?.(data);
        reset();
      }, 1500);
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      submittingRef.current = false;
    }
  }

  function reset() {
    setFile(null);
    setFrameworks([]);
    setProgress(0);
    setResult(null);
    setError(null);
  }

  return (
    <AlertDialog.Root open={open} onOpenChange={(v) => { if (!uploading) { onOpenChange(v); if (!v) reset(); } }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-6 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
          <div className="flex items-center justify-between mb-4">
            <AlertDialog.Title className="text-lg font-semibold">
              Upload Document
            </AlertDialog.Title>
            <button
              onClick={() => { onOpenChange(false); reset(); }}
              disabled={uploading}
              className="rounded-md p-1 text-muted-foreground hover:text-foreground disabled:opacity-50"
            >
              <X className="size-4" />
            </button>
          </div>

          {!file ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary/50"
            >
              <Upload className="size-8 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Drop your PDF here or click to browse</p>
                <p className="mt-1 text-xs text-muted-foreground">Only PDF files are accepted</p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="hidden"
                onChange={handleSelect}
              />
            </div>
          ) : (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center gap-3 rounded-lg border border-border p-3">
                <FileText className="size-6 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {!uploading && !result && (
                  <button
                    onClick={handleRemoveFile}
                    className="rounded-md p-1 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>

              {/* Framework selection */}
              {!uploading && !result && (
                <div>
                  <p className="mb-2 text-sm font-medium text-foreground">Scan Against</p>
                  <div className="space-y-1.5">
                    {AVAILABLE_FRAMEWORKS.map((fw) => (
                      <label
                        key={fw}
                        onClick={() => toggleFramework(fw)}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-accent transition-colors"
                      >
                        <div
                          className={`flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            frameworks.includes(fw)
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input bg-background"
                          }`}
                        >
                          {frameworks.includes(fw) && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </div>
                        <span className="text-sm text-foreground">{fw}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Progress — only during upload, hidden during scan phases */}
              {uploading && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Uploading... {progress}%
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Upload success */}
              {result && (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-green-600" />
                  <div>
                    <p className="font-medium">Upload successful!</p>
                    <p className="mt-0.5 text-green-700">{result.message}</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-600" />
                  <p>{error}</p>
                </div>
              )}

              {/* Upload button */}
              {!uploading && !result && (
                <button
                  onClick={handleUpload}
                  disabled={submittingRef.current}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Upload className="size-4" />
                  Upload
                </button>
              )}
            </div>
          )}
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
