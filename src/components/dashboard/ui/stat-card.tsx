"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string;
  change?: number;
  changePercent?: number;
  icon: LucideIcon;
  iconColor?: string;
  index?: number;
}

function formatChange(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function StatCard({
  title,
  value,
  change,
  changePercent,
  icon: Icon,
  iconColor = "text-emerald-400",
  index = 0,
}: StatCardProps) {
  const isPositive = change !== undefined ? change >= 0 : changePercent !== undefined ? changePercent >= 0 : true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      whileHover={{ scale: 1.02, y: -2 }}
      className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 transition-all duration-200 hover:border-slate-700 hover:shadow-lg hover:shadow-slate-900/50 cursor-default"
    >
      <div className="flex items-start justify-between">
        <div className="space-y-3 flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-400 truncate">{title}</p>
          <p className="text-2xl font-bold text-white tracking-tight">{value}</p>
          {(change !== undefined || changePercent !== undefined) && (
            <div className="flex items-center gap-1.5">
              {isPositive ? (
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <TrendingDown className="h-3.5 w-3.5 text-red-400" />
              )}
              <span
                className={`text-xs font-semibold ${
                  isPositive ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {change !== undefined && `${change >= 0 ? "+" : ""}${change.toFixed(2)}`}
                {change !== undefined && changePercent !== undefined && " "}
                {changePercent !== undefined && `(${formatChange(changePercent)})`}
              </span>
            </div>
          )}
        </div>
        <div
          className={`flex-shrink-0 rounded-lg bg-slate-800/80 p-2.5 ${iconColor}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}

interface AnimatedNumberProps {
  value: number;
  decimals?: number;
  prefix?: string;
  className?: string;
}

export function AnimatedNumber({
  value,
  decimals = 2,
  prefix = "",
  className = "",
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const duration = 1200;

  useEffect(() => {
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(eased * value);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value]);

  return (
    <span className={className}>
      {prefix}
      {displayValue.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
}
