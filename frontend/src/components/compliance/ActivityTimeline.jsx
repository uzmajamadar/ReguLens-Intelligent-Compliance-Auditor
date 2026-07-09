import { CheckCircle2, User, Send, XCircle, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export default function ActivityTimeline({ items }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Activity</h3>
        <span className="text-xs font-medium text-muted-foreground">{items.length}</span>
      </div>
      {items.length > 0 ? (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {items.map((item) => {
            const iconMap = {
              scan: CheckCircle2,
              assigned: User,
              review: Send,
              dismissed: XCircle,
              resolved: CheckCircle2,
            };
            const colorMap = {
              scan: "text-primary",
              assigned: "text-blue-600",
              review: "text-warning",
              dismissed: "text-destructive",
              resolved: "text-success",
            };
            const Icon = iconMap[item.type] || Clock;
            return (
              <div key={item.id} className="flex items-start gap-3 rounded-lg p-2.5 bg-muted/20">
                <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full bg-background border", colorMap[item.type])}>
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{item.label}</p>
                  {item.detail && (
                    <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{item.detail}</p>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                  {item.timestamp ? new Date(item.timestamp).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Clock className="size-6 text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground">No activity yet</p>
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">Activity will appear here once scans or reviews are completed.</p>
        </div>
      )}
    </div>
  );
}
