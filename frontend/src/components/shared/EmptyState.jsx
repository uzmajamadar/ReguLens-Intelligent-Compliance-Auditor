import { cn } from "../../lib/utils";
import { FolderOpen } from "lucide-react";

export function EmptyState({ icon: Icon, title, description, action, className }) {
  const IconComponent = Icon || FolderOpen;

  return (
    <div className={cn("flex flex-col items-center justify-center py-16 px-6 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-full bg-muted mb-4">
        <IconComponent className="size-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-md">{description}</p>
      )}
      {action && (
        <div className="mt-4">{action}</div>
      )}
    </div>
  );
}
