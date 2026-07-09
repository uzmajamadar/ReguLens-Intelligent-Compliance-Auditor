import { cn } from "@/lib/utils";
import { scoreColor, scoreBg, SeverityDot } from "./compliance-helpers";

export default function ScoreSummary({
  score,
  latestScanScore,
  failedCount,
  passedCount,
  totalViolations,
  severityCounts,
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Compliance Score</h3>
        <div className="flex items-center gap-3">
          <span className={cn("text-3xl font-bold", scoreColor(score))}>{score}</span>
          <span className="text-sm text-muted-foreground">/100</span>
          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", score >= 75 ? "bg-success/10 text-success" : score >= 45 ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive")}>
            {score >= 75 ? "Good" : score >= 45 ? "Fair" : "At Risk"}
          </span>
        </div>
        <div className="mt-3 h-2 w-full rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", scoreBg(score))} style={{ width: `${score}%` }} />
        </div>
        <div className="mt-3 space-y-1">
          {failedCount > 0 && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Failed controls</span>
              <span className="font-medium text-destructive">{failedCount}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Passed controls</span>
            <span className="font-medium text-success">{passedCount}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Total violations</span>
            <span className="font-medium text-foreground">{totalViolations}</span>
          </div>
          {latestScanScore != null && (
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Scan score</span>
              <span className={cn("font-medium", scoreColor(latestScanScore))}>{latestScanScore}%</span>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-5">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Risk Breakdown</h3>
        <div className="space-y-2">
          {["critical", "high", "medium", "low"].map((sev) => {
            const count = severityCounts[sev];
            const maxCount = Math.max(...Object.values(severityCounts), 1);
            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
            return (
              <div key={sev} className="flex items-center gap-2.5">
                <SeverityDot severity={sev} />
                <span className="text-xs text-muted-foreground w-12 capitalize">{sev}</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full", sev === "critical" ? "bg-destructive" : sev === "high" ? "bg-orange-500" : sev === "medium" ? "bg-warning" : "bg-blue-500")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className={cn("text-xs font-medium w-6 text-right", count > 0 ? "text-foreground" : "text-muted-foreground")}>{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
