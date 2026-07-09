import { cn } from "../../lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

export function KpiCard({ icon: Icon, label, value, trend, trendLabel, className }) {
  const isPositive = trend > 0;
  const isNegative = trend < 0;

  return (
    <div className={cn("rounded-xl border bg-card p-5", className)}>
      <div className="flex items-center gap-2.5 text-muted-foreground">
        {Icon && <Icon className="size-4 text-primary shrink-0" />}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
        {trend !== undefined && trend !== 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-xs font-semibold rounded-md px-1.5 py-0.5",
              isPositive && "text-green-700 bg-green-50",
              isNegative && "text-red-700 bg-red-50"
            )}
          >
            {isPositive ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      {trendLabel && (
        <p className="mt-1.5 text-xs text-muted-foreground">{trendLabel}</p>
      )}
    </div>
  );
}
