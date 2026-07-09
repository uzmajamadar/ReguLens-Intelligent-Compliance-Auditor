import { cn } from "../../lib/utils";

export function PageShell({ children, className }) {
  return (
    <div className={cn("px-6 py-6 max-w-7xl mx-auto w-full", className)}>
      {children}
    </div>
  );
}
