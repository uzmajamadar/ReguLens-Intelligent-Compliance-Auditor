import { CheckCircle2 } from "lucide-react";

export default function PassedControlsTable({ passedControls }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Passed Controls</h3>
        <span className="text-xs font-medium text-success">{passedControls.length}</span>
      </div>
      {passedControls.length > 0 ? (
        <div className="space-y-0.5 max-h-64 overflow-y-auto">
          {passedControls.slice(0, 20).map((rule) => (
            <div key={rule.id} className="flex items-center gap-2 rounded-lg p-1.5">
              <CheckCircle2 className="size-3.5 text-success shrink-0" />
              <span className="text-xs text-foreground truncate">{rule.name || rule.title || rule.id}</span>
            </div>
          ))}
          {passedControls.length > 20 && (
            <p className="text-xs text-muted-foreground text-center pt-1">+{passedControls.length - 20} more</p>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-6">No passed controls found</p>
      )}
    </div>
  );
}
