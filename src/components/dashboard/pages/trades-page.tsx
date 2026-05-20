"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, differenceInMinutes, differenceInHours, differenceInDays } from "date-fns";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Download,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Trophy,
  History,
  ChevronLeft,
  ChevronRight,
  FileText,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Trade, TradeSide } from "@/lib/types/trading";

type SortField =
  | "id"
  | "symbol"
  | "side"
  | "entryPrice"
  | "exitPrice"
  | "quantity"
  | "leverage"
  | "pnl"
  | "fee"
  | "duration"
  | "status"
  | "openedAt"
  | "closedAt";
type SortDir = "asc" | "desc";

type DateRange = "24h" | "7d" | "30d" | "ALL";

const STRATEGY_NAMES: Record<string, string> = {
  strat_ema_001: "EMA Cross + MACD",
  strat_scalp_002: "Scalp Master",
  strat_break_003: "Breakout Hunter",
  strat_smart_004: "Smart Money",
  strat_ai_005: "AI Adaptive",
};

const EXCHANGE_NAMES: Record<string, string> = {
  ex_binance_001: "Binance",
  ex_bybit_002: "Bybit",
  ex_okx_003: "OKX",
};

const STRATEGY_COLORS: Record<string, string> = {
  "EMA Cross + MACD": "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Scalp Master": "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Breakout Hunter": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Smart Money": "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "AI Adaptive": "bg-pink-500/20 text-pink-400 border-pink-500/30",
  Manual: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function formatDuration(openedAt: string, closedAt: string | null): string {
  if (!closedAt) return "—";
  const start = new Date(openedAt);
  const end = new Date(closedAt);
  const mins = differenceInMinutes(end, start);
  const hours = differenceInHours(end, start);
  const days = differenceInDays(end, start);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

function getDateRange(range: DateRange): { start: Date | null; end: Date } {
  const end = new Date();
  let start: Date | null = null;

  switch (range) {
    case "24h":
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "7d":
      start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "30d":
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case "ALL":
      start = null;
      break;
  }

  return { start, end };
}

export default function TradesPage() {
  const [search, setSearch] = useState("");
  const [sideFilter, setSideFilter] = useState<"ALL" | TradeSide>("ALL");
  const [strategyFilter, setStrategyFilter] = useState<string>("ALL");
  const [dateRange, setDateRange] = useState<DateRange>("ALL");
  const [sortField, setSortField] = useState<SortField>("closedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(1);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [chartsOpen, setChartsOpen] = useState(true);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const pageSize = 10;

  const { start: rangeStart, end: rangeEnd } = getDateRange(dateRange);

  const fetchTrades = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ status: "CLOSED", limit: "100" });
      const res = await fetch(`/api/trades?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.success) {
        setTrades(json.data);
      } else {
        toast.error("Failed to load trades", { description: json.error || "Unknown error" });
      }
    } catch (err) {
      toast.error("Failed to load trades", { description: err instanceof Error ? err.message : "Network error" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrades();
  }, [fetchTrades]);

  const closedTrades = trades.filter((t) => t.status === "CLOSED");

  const filteredTrades = useMemo(() => {
    let result = [...closedTrades];

    // Date range
    if (rangeStart) {
      result = result.filter((t) => new Date(t.closedAt!) >= rangeStart);
    }

    // Search
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(
        (t) =>
          t.symbol.toLowerCase().includes(s) ||
          t.id.toLowerCase().includes(s)
      );
    }

    // Side
    if (sideFilter !== "ALL") {
      result = result.filter((t) => t.side === sideFilter);
    }

    // Strategy
    if (strategyFilter !== "ALL") {
      result = result.filter((t) => t.strategyId === strategyFilter);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "id":
          cmp = a.id.localeCompare(b.id);
          break;
        case "symbol":
          cmp = a.symbol.localeCompare(b.symbol);
          break;
        case "side":
          cmp = a.side.localeCompare(b.side);
          break;
        case "entryPrice":
          cmp = a.entryPrice - b.entryPrice;
          break;
        case "exitPrice":
          cmp = (a.exitPrice ?? 0) - (b.exitPrice ?? 0);
          break;
        case "quantity":
          cmp = a.quantity - b.quantity;
          break;
        case "leverage":
          cmp = a.leverage - b.leverage;
          break;
        case "pnl":
          cmp = a.pnl - b.pnl;
          break;
        case "fee":
          cmp = a.fee - b.fee;
          break;
        case "duration":
          cmp =
            new Date(a.openedAt).getTime() -
            new Date(b.openedAt).getTime();
          break;
        case "status":
          cmp = a.status.localeCompare(b.status);
          break;
        case "openedAt":
          cmp = new Date(a.openedAt).getTime() - new Date(b.openedAt).getTime();
          break;
        case "closedAt":
          cmp = new Date(a.closedAt ?? 0).getTime() - new Date(b.closedAt ?? 0).getTime();
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [closedTrades, search, sideFilter, strategyFilter, rangeStart, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filteredTrades.length / pageSize);
  const paginatedTrades = filteredTrades.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  // Summary stats
  const totalPnl = filteredTrades.reduce((s, t) => s + t.pnl, 0);
  const wins = filteredTrades.filter((t) => t.pnl > 0).length;
  const losses = filteredTrades.filter((t) => t.pnl <= 0).length;

  // Cumulative P&L chart data
  const cumulativePnlData = useMemo(() => {
    const sorted = [...filteredTrades].sort(
      (a, b) =>
        new Date(a.closedAt ?? 0).getTime() - new Date(b.closedAt ?? 0).getTime()
    );
    const result: { index: number; date: string; pnl: number; trade: number }[] = [];
    sorted.reduce<number>((acc, t, i) => {
      const newPnl = acc + t.pnl;
      result.push({
        index: i + 1,
        date: t.closedAt ? format(new Date(t.closedAt), "MMM dd") : `#${i + 1}`,
        pnl: Math.round(newPnl * 100) / 100,
        trade: t.pnl,
      });
      return newPnl;
    }, 0);
    return result;
  }, [filteredTrades]);

  // Win/Loss pie data
  const winLossData = useMemo(
    () => [
      { name: "Wins", value: wins, fill: "#10b981" },
      { name: "Losses", value: losses, fill: "#ef4444" },
    ],
    [wins, losses]
  );

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? (
      <ArrowUp className="h-3 w-3 ml-1 text-emerald-400" />
    ) : (
      <ArrowDown className="h-3 w-3 ml-1 text-emerald-400" />
    );
  };

  const exportCSV = () => {
    const headers = [
      "Trade ID",
      "Symbol",
      "Side",
      "Entry Price",
      "Exit Price",
      "Quantity",
      "Leverage",
      "PnL",
      "Fee",
      "Duration",
      "Strategy",
      "Exchange",
      "Opened",
      "Closed",
      "Status",
    ];
    const rows = filteredTrades.map((t) => [
      t.id,
      t.symbol,
      t.side,
      t.entryPrice,
      t.exitPrice ?? "",
      t.quantity,
      t.leverage,
      t.pnl,
      t.fee,
      formatDuration(t.openedAt, t.closedAt),
      STRATEGY_NAMES[t.strategyId ?? ""] ?? "Manual",
      EXCHANGE_NAMES[t.exchangeId ?? ""] ?? "Unknown",
      t.openedAt,
      t.closedAt ?? "",
      t.status,
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "trade_history.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const pnlColor = totalPnl >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlSign = totalPnl >= 0 ? "+" : "";

  const uniqueStrategies = useMemo(() => {
    const ids = new Set(closedTrades.map((t) => t.strategyId).filter(Boolean));
    return Array.from(ids);
  }, [closedTrades]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Trade History</h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-400 hover:text-white hover:bg-slate-800"
              onClick={fetchTrades}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className={`text-xl font-bold mt-1 ${pnlColor}`}>
            {pnlSign}${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            <span className="text-sm font-normal text-slate-400 ml-2">Total Realized P&L</span>
          </div>
        </div>
        <Button
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={exportCSV}
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      {/* Date Range + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-900/80 border border-slate-800 rounded-lg p-1">
          {(["24h", "7d", "30d", "ALL"] as DateRange[]).map((r) => (
            <button
              key={r}
              onClick={() => {
                setDateRange(r);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-sm transition-all ${
                dateRange === r
                  ? "bg-emerald-500/20 text-emerald-400 font-medium"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {r === "ALL" ? "All" : r}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search symbol or ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 bg-slate-900/80 border-slate-700 text-slate-200 placeholder:text-slate-500"
          />
          {search && (
            <button
              onClick={() => {
                setSearch("");
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Select value={sideFilter} onValueChange={(v) => { setSideFilter(v as "ALL" | TradeSide); setPage(1); }}>
          <SelectTrigger className="w-36 bg-slate-900/80 border-slate-700 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="ALL">All Sides</SelectItem>
            <SelectItem value="LONG">Long</SelectItem>
            <SelectItem value="SHORT">Short</SelectItem>
          </SelectContent>
        </Select>
        <Select value={strategyFilter} onValueChange={(v) => { setStrategyFilter(v); setPage(1); }}>
          <SelectTrigger className="w-44 bg-slate-900/80 border-slate-700 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="ALL">All Strategies</SelectItem>
            {uniqueStrategies.map((sid) => (
              <SelectItem key={sid} value={sid!}>
                {STRATEGY_NAMES[sid!] || "Unknown"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Trades", value: filteredTrades.length, icon: BarChart3, color: "text-slate-200" },
          { label: "Winning Trades", value: wins, icon: TrendingUp, color: "text-emerald-400" },
          { label: "Losing Trades", value: losses, icon: TrendingDown, color: "text-red-400" },
          {
            label: "Total P&L",
            value: `${pnlSign}$${Math.abs(totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: totalPnl >= 0 ? TrendingUp : TrendingDown,
            color: pnlColor,
          },
        ].map((card) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-slate-900/80 border border-slate-800 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`h-4 w-4 ${card.color}`} />
              <span className="text-sm text-slate-400">{card.label}</span>
            </div>
            <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Performance Charts (Collapsible) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setChartsOpen(!chartsOpen)}
          className="w-full flex items-center justify-between p-4 text-left hover:bg-slate-800/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-400" />
            <span className="font-medium text-white">Performance Overview</span>
          </div>
          {chartsOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        <AnimatePresence>
          {chartsOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Cumulative P&L Chart */}
                <div className="lg:col-span-2 bg-slate-800/30 rounded-lg p-4">
                  <div className="text-sm text-slate-400 mb-3">Cumulative P&L</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={cumulativePnlData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis
                        dataKey="date"
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                      />
                      <YAxis
                        stroke="#64748b"
                        fontSize={11}
                        tickLine={false}
                        tickFormatter={(v) =>
                          `$${Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0)}`
                        }
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1e293b",
                          border: "1px solid #334155",
                          borderRadius: "8px",
                          color: "#e2e8f0",
                          fontSize: 12,
                        }}
                        formatter={(value: number) => [
                          `$${value.toFixed(2)}`,
                          "Cumulative P&L",
                        ]}
                      />
                      <Line
                        type="monotone"
                        dataKey="pnl"
                        stroke="#10b981"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                {/* Win/Loss Pie */}
                <div className="bg-slate-800/30 rounded-lg p-4">
                  <div className="text-sm text-slate-400 mb-3">Win / Loss Ratio</div>
                  <div className="flex items-center justify-center">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie
                          data={winLossData}
                          cx="50%"
                          cy="50%"
                          innerRadius={40}
                          outerRadius={70}
                          paddingAngle={4}
                          dataKey="value"
                          stroke="none"
                        >
                          {winLossData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e293b",
                            border: "1px solid #334155",
                            borderRadius: "8px",
                            color: "#e2e8f0",
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-6 mt-2">
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="text-slate-300">
                        Wins: <span className="text-emerald-400 font-semibold">{wins}</span>
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 rounded-full bg-red-500" />
                      <span className="text-slate-300">
                        Losses: <span className="text-red-400 font-semibold">{losses}</span>
                      </span>
                    </div>
                  </div>
                  <div className="text-center mt-2">
                    <span className="text-2xl font-bold text-white">
                      {filteredTrades.length > 0
                        ? ((wins / filteredTrades.length) * 100).toFixed(1)
                        : 0}
                      %
                    </span>
                    <div className="text-xs text-slate-500">Win Rate</div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-20 gap-3">
          <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
          <span className="text-slate-400">Loading trades...</span>
        </div>
      )}

      {/* Trades Table */}
      {!isLoading && (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("id")}
                >
                  <span className="flex items-center">
                    Trade ID {renderSortIcon("id")}
                  </span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("symbol")}
                >
                  <span className="flex items-center">
                    Symbol {renderSortIcon("symbol")}
                  </span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("side")}
                >
                  <span className="flex items-center">
                    Side {renderSortIcon("side")}
                  </span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("entryPrice")}
                >
                  <span className="flex items-center">
                    Entry {renderSortIcon("entryPrice")}
                  </span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("exitPrice")}
                >
                  <span className="flex items-center">
                    Exit {renderSortIcon("exitPrice")}
                  </span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("quantity")}
                >
                  <span className="flex items-center">
                    Qty {renderSortIcon("quantity")}
                  </span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider">Lev.</TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("pnl")}
                >
                  <span className="flex items-center">
                    P&L {renderSortIcon("pnl")}
                  </span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("fee")}
                >
                  <span className="flex items-center">
                    Fee {renderSortIcon("fee")}
                  </span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider">
                  Duration
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider">
                  Strategy
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider">
                  Exchange
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("openedAt")}
                >
                  <span className="flex items-center">
                    Opened {renderSortIcon("openedAt")}
                  </span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("closedAt")}
                >
                  <span className="flex items-center">
                    Closed {renderSortIcon("closedAt")}
                  </span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("status")}
                >
                  <span className="flex items-center">
                    Status {renderSortIcon("status")}
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {paginatedTrades.map((trade, idx) => {
                  const pnlColor = trade.pnl >= 0 ? "text-emerald-400" : "text-red-400";
                  const pnlSign = trade.pnl >= 0 ? "+" : "";
                  const strategyName = STRATEGY_NAMES[trade.strategyId ?? ""] || "Manual";
                  const exchangeName = EXCHANGE_NAMES[trade.exchangeId ?? ""] || "Unknown";

                  return (
                    <motion.tr
                      key={trade.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className={`border-slate-800 cursor-pointer transition-colors ${
                        trade.pnl >= 0 ? "hover:bg-emerald-500/5" : "hover:bg-red-500/5"
                      }`}
                      onClick={() => setSelectedTrade(trade)}
                    >
                      <TableCell className="py-3">
                        <span className="font-mono text-xs text-slate-400">
                          {trade.id.slice(0, 8)}…
                        </span>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className="font-medium text-white">{trade.symbol}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge
                          className={
                            trade.side === "LONG"
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : "bg-red-500/20 text-red-400 border-red-500/30"
                          }
                        >
                          {trade.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 font-mono text-sm text-slate-200">
                        {formatPrice(trade.entryPrice)}
                      </TableCell>
                      <TableCell className="py-3 font-mono text-sm text-slate-200">
                        {trade.exitPrice ? formatPrice(trade.exitPrice) : "—"}
                      </TableCell>
                      <TableCell className="py-3 font-mono text-sm text-slate-200">
                        {trade.quantity}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 font-mono">
                          {trade.leverage}x
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <span className={`font-mono text-sm font-bold ${pnlColor}`}>
                          {pnlSign}${Math.abs(trade.pnl).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell className="py-3 font-mono text-sm text-slate-400">
                        ${trade.fee.toFixed(2)}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-slate-400">
                        {formatDuration(trade.openedAt, trade.closedAt)}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge className={STRATEGY_COLORS[strategyName] || STRATEGY_COLORS["Manual"]}>
                          {strategyName}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-slate-300">
                        {exchangeName}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-slate-400">
                        {trade.openedAt
                          ? format(new Date(trade.openedAt), "MMM dd, HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell className="py-3 text-xs text-slate-400">
                        {trade.closedAt
                          ? format(new Date(trade.closedAt), "MMM dd, HH:mm")
                          : "—"}
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                          {trade.status}
                        </Badge>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>

        {paginatedTrades.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <History className="h-10 w-10 mb-3 opacity-40" />
            <p>No trades found matching your filters</p>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800">
            <span className="text-sm text-slate-400">
              Showing {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, filteredTrades.length)} of {filteredTrades.length}
            </span>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  variant="ghost"
                  onClick={() => setPage(p)}
                  className={`h-8 w-8 p-0 text-sm ${
                    page === p
                      ? "bg-emerald-500/20 text-emerald-400 font-medium"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {p}
                </Button>
              ))}
              <Button
                size="sm"
                variant="ghost"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-8 w-8 p-0 text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Trade Detail Dialog */}
      <Dialog open={!!selectedTrade} onOpenChange={(open) => !open && setSelectedTrade(null)}>
        <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-md text-slate-100">
          {selectedTrade && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-white">
                  <FileText className="h-5 w-5 text-slate-400" />
                  Trade Details
                </DialogTitle>
                <DialogDescription className="text-slate-400 font-mono text-xs">
                  {selectedTrade.id}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-lg font-bold text-white">{selectedTrade.symbol}</span>
                  <Badge
                    className={
                      selectedTrade.side === "LONG"
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                        : "bg-red-500/20 text-red-400 border-red-500/30"
                    }
                  >
                    {selectedTrade.side} {selectedTrade.leverage}x
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <div className="text-slate-500 text-xs">Entry Price</div>
                    <div className="text-white font-mono">{formatPrice(selectedTrade.entryPrice)}</div>
                  </div>
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <div className="text-slate-500 text-xs">Exit Price</div>
                    <div className="text-white font-mono">
                      {selectedTrade.exitPrice ? formatPrice(selectedTrade.exitPrice) : "—"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <div className="text-slate-500 text-xs">Quantity</div>
                    <div className="text-white font-mono">{selectedTrade.quantity}</div>
                  </div>
                  <div className="rounded-lg bg-slate-800/50 p-3">
                    <div className="text-slate-500 text-xs">Duration</div>
                    <div className="text-white">
                      {formatDuration(selectedTrade.openedAt, selectedTrade.closedAt)}
                    </div>
                  </div>
                </div>

                <div className={`rounded-lg border p-3 text-center ${
                  selectedTrade.pnl >= 0
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}>
                  <div className="text-xs text-slate-400 mb-1">Realized P&L</div>
                  <div className={`text-2xl font-bold ${
                    selectedTrade.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {selectedTrade.pnl >= 0 ? "+" : ""}${Math.abs(selectedTrade.pnl).toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Fee: ${selectedTrade.fee.toFixed(2)} | Net:{" "}
                    <span className={selectedTrade.pnl - selectedTrade.fee >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {selectedTrade.pnl - selectedTrade.fee >= 0 ? "+" : ""}$
                      {(selectedTrade.pnl - selectedTrade.fee).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-slate-500">Strategy</span>
                    <div className="mt-0.5">
                      <Badge className={STRATEGY_COLORS[STRATEGY_NAMES[selectedTrade.strategyId ?? ""] || "Manual"]}>
                        {STRATEGY_NAMES[selectedTrade.strategyId ?? ""] || "Manual"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Exchange</span>
                    <div className="text-white mt-0.5">
                      {EXCHANGE_NAMES[selectedTrade.exchangeId ?? ""] || "Unknown"}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Opened</span>
                    <div className="text-white text-xs">
                      {format(new Date(selectedTrade.openedAt), "MMM dd, yyyy HH:mm")}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Closed</span>
                    <div className="text-white text-xs">
                      {selectedTrade.closedAt
                        ? format(new Date(selectedTrade.closedAt), "MMM dd, yyyy HH:mm")
                        : "—"}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
