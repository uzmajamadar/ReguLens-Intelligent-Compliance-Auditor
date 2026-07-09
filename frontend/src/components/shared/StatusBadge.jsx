import { cn } from "../../lib/utils";

const VARIANT_STYLES = {
  critical: "bg-red-50 text-red-700 border-red-200",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-blue-50 text-blue-700 border-blue-200",
  passed: "bg-green-50 text-green-700 border-green-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  failed: "bg-red-50 text-red-700 border-red-200",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  success: "bg-green-50 text-green-700 border-green-200",
  pending: "bg-gray-50 text-gray-600 border-gray-200",
  active: "bg-green-50 text-green-700 border-green-200",
  inactive: "bg-gray-50 text-gray-500 border-gray-200",
  admin: "bg-purple-50 text-purple-700 border-purple-200",
  manager: "bg-blue-50 text-blue-700 border-blue-200",
  document_owner: "bg-gray-50 text-gray-600 border-gray-200",
};

const DOT_COLORS = {
  critical: "bg-red-500",
  high: "bg-orange-500",
  medium: "bg-amber-500",
  low: "bg-blue-500",
  passed: "bg-green-500",
  warning: "bg-amber-500",
  failed: "bg-red-500",
  info: "bg-blue-500",
  success: "bg-green-500",
  pending: "bg-gray-400",
  active: "bg-green-500",
  inactive: "bg-gray-400",
};

export function StatusBadge({ variant = "info", children, showDot = true, className }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-px text-[11px] font-medium",
        VARIANT_STYLES[variant] || VARIANT_STYLES.info,
        className
      )}
    >
      {showDot && (
        <span className={cn("size-1.5 rounded-full shrink-0", DOT_COLORS[variant] || DOT_COLORS.info)} />
      )}
      {children}
    </span>
  );
}
