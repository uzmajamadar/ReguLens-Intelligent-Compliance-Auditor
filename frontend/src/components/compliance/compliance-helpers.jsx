import { cn } from "@/lib/utils";
import { XCircle, AlertTriangle, Info } from "lucide-react";

export function scoreColor(score) {
  if (score == null) return "text-muted-foreground";
  return score >= 75 ? "text-success" : score >= 45 ? "text-warning" : "text-destructive";
}

export function scoreBg(score) {
  if (score == null) return "bg-muted";
  return score >= 75 ? "bg-success" : score >= 45 ? "bg-warning" : "bg-destructive";
}

export function SeverityDot({ severity }) {
  const colors = { critical: "bg-destructive", high: "bg-orange-500", medium: "bg-warning", low: "bg-blue-500" };
  return <span className={cn("size-2 rounded-full shrink-0", colors[severity] || "bg-muted-foreground")} />;
}

export function SeverityIcon({ severity, className }) {
  const icons = { critical: XCircle, high: AlertTriangle, medium: AlertTriangle, low: Info };
  const colors = { critical: "text-destructive", high: "text-orange-600", medium: "text-warning", low: "text-blue-600" };
  const Icon = icons[severity] || AlertTriangle;
  return <Icon className={cn("size-4 shrink-0", colors[severity], className)} />;
}
