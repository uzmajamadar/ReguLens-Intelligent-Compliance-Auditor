import { XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "../shared/StatusBadge";

export default function ViolationsTable({ violations, onSelectViolation }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Failed Controls</h3>
        <span className="text-xs font-medium text-destructive">{violations.length}</span>
      </div>
      {violations.length > 0 ? (
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {violations.map((v) => (
            <div
              key={v.id}
              onClick={() => onSelectViolation(v)}
              className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <XCircle className={cn("size-3.5 shrink-0", v.severity === "critical" ? "text-destructive" : v.severity === "high" ? "text-orange-500" : v.severity === "medium" ? "text-warning" : "text-blue-500")} />
              <span className="text-xs text-foreground truncate flex-1">{v.title}</span>
              <StatusBadge variant={v.severity === "critical" ? "critical" : v.severity === "high" ? "high" : v.severity === "medium" ? "medium" : "low"}>
                {v.severity}
              </StatusBadge>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-6">No violations for this framework</p>
      )}
    </div>
  );
}
