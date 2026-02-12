import { Badge } from "@/components/ui/badge";
import { cn, getStatusColor, getStatusDotColor, formatStatus } from "@/lib/utils";

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  return (
    <Badge className={cn(getStatusColor(status), "gap-1.5", className)}>
      <span
        className={cn("h-1.5 w-1.5 rounded-full", getStatusDotColor(status))}
      />
      {formatStatus(status)}
    </Badge>
  );
}
