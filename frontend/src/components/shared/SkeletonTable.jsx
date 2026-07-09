import { cn } from "../../lib/utils";
import { Skeleton } from "../ui/skeleton";

export function SkeletonTable({ rows = 5, cols = 4, className }) {
  return (
    <div className={cn("rounded-xl border bg-card overflow-hidden", className)}>
      <div className="overflow-x-auto">
        <table className="w-full caption-bottom text-sm">
          <thead>
            <tr className="border-b border-border">
              {Array.from({ length: cols }, (_, i) => (
                <th key={i} className="h-10 px-4">
                  <Skeleton className="h-3 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i} className="border-b border-border">
                {Array.from({ length: cols }, (_, j) => (
                  <td key={j} className="px-4 py-3">
                    <Skeleton className={cn("h-4", j === 0 ? "w-32" : "w-24")} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
