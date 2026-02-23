import * as React from "react";

import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

type LoadingSize = "sm" | "md" | "lg";

const sizeClasses: Record<LoadingSize, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

export interface LoadingStateProps
  extends React.HTMLAttributes<HTMLDivElement> {
  text?: React.ReactNode;
  size?: LoadingSize;
  fullPage?: boolean;
}

export function LoadingState({
  text,
  size = "md",
  fullPage = false,
  className,
  ...props
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 py-12",
        fullPage && "min-h-[200px]",
        className,
      )}
      {...props}
    >
      <Spinner
        className={cn(sizeClasses[size])}
        aria-hidden="true"
      />
      {text && (
        <p className="text-sm text-muted-foreground">{text}</p>
      )}
    </div>
  );
}

