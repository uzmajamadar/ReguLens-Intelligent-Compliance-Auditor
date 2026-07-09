import { useState, useMemo } from "react";
import { cn } from "../../lib/utils";
import { Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { SkeletonTable } from "./SkeletonTable";

export function DataTable({
  columns,
  data,
  searchable = true,
  searchPlaceholder = "Search...",
  pageSize = 10,
  onRowClick,
  className,
  loading = false,
  emptyMessage = "No results found.",
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState("asc");
  const [page, setPage] = useState(0);

  const safeKey = (row, i) =>
    row.id !== undefined && row.id !== null ? row.id :
    row._key !== undefined && row._key !== null ? row._key :
    `row-${i}`;

  const filtered = useMemo(() => {
    if (!search.trim()) return data || [];
    const q = search.toLowerCase();
    return (data || []).filter((row) =>
      columns.some((col) => {
        const val = col.accessor ? row[col.accessor] : "";
        return String(val).toLowerCase().includes(q);
      })
    );
  }, [data, search, columns]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = a[sortKey];
      const bVal = b[sortKey];
      if (aVal == null) return 1;
      if (bVal == null) return -1;
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paged = sorted.slice(page * pageSize, (page + 1) * pageSize);

  function handleSort(key) {
    if (!key) return;
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  }

  function handleKeyDown(e, action) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      action();
    }
  }

  const paginationPages = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i);
    const pages = [];
    pages.push(0);
    const start = Math.max(1, page - 1);
    const end = Math.min(totalPages - 2, page + 1);
    if (start > 1) pages.push("...");
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 2) pages.push("...");
    pages.push(totalPages - 1);
    return pages;
  }, [totalPages, page]);

  return (
    <div className={cn("space-y-3", className)}>
      {searchable && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            aria-label={searchPlaceholder}
            className="w-full h-9 rounded-lg border border-input bg-background pl-9 pr-3 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
        </div>
      )}
      {loading ? (
        <SkeletonTable rows={pageSize > 8 ? 8 : pageSize} cols={columns.length} />
      ) : (
      <div className="rounded-xl border bg-card overflow-hidden" role="region" aria-label="Data table">
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom text-sm" role="table">
            <thead>
              <tr className="border-b border-border">
                {columns.map((col) => (
                  <th
                    key={col.accessor || col.header}
                    scope="col"
                    aria-sort={
                      col.accessor && sortKey === col.accessor
                        ? (sortDir === "asc" ? "ascending" : "descending")
                        : undefined
                    }
                    className={cn(
                      "h-10 px-4 text-left align-middle text-xs font-semibold text-muted-foreground",
                      col.sortable !== false && "cursor-pointer select-none hover:text-foreground transition-colors",
                      col.className
                    )}
                    onClick={() => col.sortable !== false && handleSort(col.accessor)}
                    onKeyDown={(e) => col.sortable !== false && col.accessor && handleKeyDown(e, () => handleSort(col.accessor))}
                    tabIndex={col.sortable !== false && col.accessor ? 0 : undefined}
                    role={col.sortable !== false && col.accessor ? "columnheader button" : "columnheader"}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.header}
                      {col.accessor && sortKey === col.accessor && (
                        sortDir === "asc" ? <ChevronUp className="size-3" aria-hidden="true" /> : <ChevronDown className="size-3" aria-hidden="true" />
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-muted-foreground" role="status">
                    {emptyMessage}
                  </td>
                </tr>
              ) : (
                paged.map((row, i) => (
                  <tr
                    key={safeKey(row, i)}
                    className={cn(
                      "border-b border-border transition-colors hover:bg-muted/30",
                      onRowClick && "cursor-pointer"
                    )}
                    onClick={() => onRowClick?.(row)}
                    onKeyDown={(e) => onRowClick && handleKeyDown(e, () => onRowClick(row))}
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? "button" : undefined}
                  >
                    {columns.map((col) => (
                      <td key={col.accessor || col.header} className={cn("px-4 py-3 align-middle", col.cellClassName)}>
                        {col.cell ? col.cell(row) : row[col.accessor]}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
      {totalPages > 1 && (
        <nav className="flex items-center justify-between text-xs text-muted-foreground" aria-label="Pagination">
          <span>
            Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent disabled:opacity-30 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="size-3" aria-hidden="true" />
            </button>
            {paginationPages.map((p, i) =>
              p === "..." ? (
                <span key={`ellipsis-${i}`} className="inline-flex items-center justify-center h-7 w-7 text-xs text-muted-foreground">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPage(p)}
                  className={cn(
                    "inline-flex items-center justify-center rounded-md h-7 w-7 text-xs font-medium transition-colors",
                    p === page ? "bg-primary text-primary-foreground" : "hover:bg-accent"
                  )}
                  aria-label={`Page ${p + 1}`}
                  aria-current={p === page ? "page" : undefined}
                >
                  {p + 1}
                </button>
              )
            )}
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              className="inline-flex items-center justify-center rounded-md h-7 w-7 hover:bg-accent disabled:opacity-30 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="size-3" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
