"use client";

import { cn } from "@/lib/utils";

interface PnlBadgeProps {
  pnl: number;
  size?: "sm" | "md" | "lg";
  showSign?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: "text-[10px] px-1.5 py-0",
  md: "text-xs px-2 py-0.5",
  lg: "text-sm px-2.5 py-1",
};

export function PnlBadge({ pnl, size = "md", showSign = true, className }: PnlBadgeProps) {
  const isPositive = pnl >= 0;
  const formatted = Math.abs(pnl).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const sign = isPositive && showSign ? "+" : "";

  return (
    <span
      className={cn(
        "inline-flex items-center font-mono font-semibold rounded-md whitespace-nowrap",
        sizeClasses[size],
        isPositive
          ? "text-emerald-400 bg-emerald-400/10"
          : "text-red-400 bg-red-400/10",
        className
      )}
    >
      {sign}${formatted}
    </span>
  );
}
