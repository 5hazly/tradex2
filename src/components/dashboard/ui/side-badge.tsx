"use client";

import { cn } from "@/lib/utils";
import type { TradeSide } from "@/lib/types/trading";

interface SideBadgeProps {
  side: TradeSide;
  leverage?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "text-[10px] px-1.5 py-0",
  md: "text-xs px-2 py-0.5",
  lg: "text-sm px-2.5 py-1",
};

export function SideBadge({ side, leverage, size = "md", className }: SideBadgeProps) {
  const isLong = side === "LONG";

  return (
    <span
      className={cn(
        "inline-flex items-center font-semibold rounded-md whitespace-nowrap",
        sizeClasses[size],
        isLong
          ? "text-emerald-400 bg-emerald-400/10 border border-emerald-400/20"
          : "text-red-400 bg-red-400/10 border border-red-400/20",
        className
      )}
    >
      {side}
      {leverage !== undefined && (
        <span className={cn(
          "ml-1 font-normal opacity-70",
          isLong ? "text-emerald-400/70" : "text-red-400/70"
        )}>
          {leverage}x
        </span>
      )}
    </span>
  );
}
