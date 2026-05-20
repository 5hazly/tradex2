"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Plus,
  XCircle,
  Edit3,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Wallet,
  Activity,
  ShieldCheck,
  Loader2,
  RefreshCw,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ClosePositionDialog } from "@/components/dashboard/ui/close-position-dialog";
import { EditSLTPDialog } from "@/components/dashboard/ui/edit-sltp-dialog";
import type { Position, TradeSide, ExchangeName } from "@/lib/types/trading";
import { toast } from "sonner";

type SortField =
  | "symbol"
  | "side"
  | "size"
  | "entryPrice"
  | "markPrice"
  | "leverage"
  | "margin"
  | "unrealizedPnl"
  | "liquidationPrice";
type SortDir = "asc" | "desc";

const SYMBOL_LOGOS: Record<string, string> = {
  BTCUSDT: "₿",
  ETHUSDT: "Ξ",
  SOLUSDT: "◎",
  DOGEUSDT: "Ð",
  XRPUSDT: "✕",
  AVAXUSDT: "▲",
  LINKUSDT: "⬡",
  ADAUSDT: "₳",
  MATICUSDT: "⬟",
  ARBUSDT: "◐",
  OPUSDT: "⊕",
  APTUSDT: "◉",
};

const AVAILABLE_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "DOGEUSDT", "XRPUSDT",
  "AVAXUSDT", "LINKUSDT", "ADAUSDT", "MATICUSDT", "ARBUSDT",
  "OPUSDT", "APTUSDT", "BNBUSDT", "NEARUSDT", "SUIUSDT",
];

const SYMBOL_PRICES: Record<string, number> = {
  BTCUSDT: 67500, ETHUSDT: 3520, SOLUSDT: 197, DOGEUSDT: 0.083,
  XRPUSDT: 0.64, AVAXUSDT: 39.5, LINKUSDT: 16.2, ADAUSDT: 0.59,
  MATICUSDT: 0.79, ARBUSDT: 0.93, OPUSDT: 1.88, APTUSDT: 9.8,
  BNBUSDT: 615, NEARUSDT: 7.2, SUIUSDT: 1.15,
};

function formatPrice(price: number): string {
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

function formatPnl(pnl: number): { text: string; color: string; sign: string } {
  const sign = pnl >= 0 ? "+" : "";
  return {
    text: `${sign}$${Math.abs(pnl).toFixed(2)}`,
    color: pnl >= 0 ? "text-emerald-400" : "text-red-400",
    sign,
  };
}

function getMarkPrice(pos: Position): number {
  const variation = pos.side === "LONG"
    ? 1 + pos.unrealizedPnl / (pos.entryPrice * pos.quantity)
    : 1 - pos.unrealizedPnl / (pos.entryPrice * pos.quantity);
  return pos.entryPrice * variation;
}

// ============================================================
// Confirm Dialog for Close All
// ============================================================
function ConfirmCloseAllDialog({
  open,
  onOpenChange,
  onConfirm,
  count,
  totalPnl,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  count: number;
  totalPnl: number;
  isLoading: boolean;
}) {
  const pnlInfo = formatPnl(totalPnl);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-sm text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Close All Positions
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            This will close all {count} open position(s) at market price.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Positions to close</span>
            <span className="text-white font-semibold">{count}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Total Unrealized P&L</span>
            <span className={`font-semibold ${pnlInfo.color}`}>{pnlInfo.text}</span>
          </div>
          <p className="text-xs text-red-400/80 mt-2">
            This action cannot be undone. All positions will be closed immediately at current market prices.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Close All {count} Positions
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Add Position Dialog
// ============================================================
function AddPositionDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (data: {
    symbol: string;
    side: TradeSide;
    quantity: number;
    leverage: number;
    entryPrice: number;
    stopLoss: number | null;
    takeProfit: number | null;
  }) => void;
}) {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<TradeSide>("LONG");
  const [quantity, setQuantity] = useState("");
  const [leverage, setLeverage] = useState("10");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const entryPrice = SYMBOL_PRICES[symbol] || 0;
  const notional = Number(quantity || 0) * entryPrice;
  const margin = notional / Number(leverage || 1);

  const handleSubmit = async () => {
    if (!quantity || Number(quantity) <= 0) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          quantity: Number(quantity),
          leverage: Number(leverage),
          entryPrice,
          stopLoss: stopLoss ? Number(stopLoss) : null,
          takeProfit: takeProfit ? Number(takeProfit) : null,
          margin,
          liquidationPrice: side === "LONG"
            ? entryPrice * (1 - 1 / Number(leverage) * 0.9)
            : entryPrice * (1 + 1 / Number(leverage) * 0.9),
        }),
      });
      const json = await res.json();

      if (json.success) {
        toast.success("Position opened", {
          description: `${side} ${quantity} ${symbol} @ ${formatPrice(entryPrice)} (${leverage}x)`,
        });
        onOpenChange(false);
        onConfirm({
          symbol,
          side,
          quantity: Number(quantity),
          leverage: Number(leverage),
          entryPrice,
          stopLoss: stopLoss ? Number(stopLoss) : null,
          takeProfit: takeProfit ? Number(takeProfit) : null,
        });
        // Reset form
        setSymbol("BTCUSDT");
        setSide("LONG");
        setQuantity("");
        setLeverage("10");
        setStopLoss("");
        setTakeProfit("");
      } else {
        toast.error("Failed to open position", { description: json.error });
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const step = entryPrice >= 1000 ? 0.1 : entryPrice >= 1 ? 0.01 : 0.0001;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-md text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-400" />
            Open New Position
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Manually open a new trading position
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Symbol & Side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Symbol</Label>
              <Select value={symbol} onValueChange={(v) => { setSymbol(v); setQuantity(""); }}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-100 font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {AVAILABLE_SYMBOLS.map((s) => (
                    <SelectItem key={s} value={s} className="font-mono text-slate-200">
                      <span className="mr-2">{SYMBOL_LOGOS[s] || "●"}</span>
                      {s}
                      <span className="text-slate-500 ml-2 text-xs">${SYMBOL_PRICES[s]?.toLocaleString() || "—"}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Side</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className={`flex-1 ${side === "LONG" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "border-slate-600 text-slate-300 hover:bg-slate-800"}`}
                  variant={side === "LONG" ? "default" : "outline"}
                  onClick={() => setSide("LONG")}
                >
                  Long
                </Button>
                <Button
                  size="sm"
                  className={`flex-1 ${side === "SHORT" ? "bg-red-600 hover:bg-red-700 text-white" : "border-slate-600 text-slate-300 hover:bg-slate-800"}`}
                  variant={side === "SHORT" ? "default" : "outline"}
                  onClick={() => setSide("SHORT")}
                >
                  Short
                </Button>
              </div>
            </div>
          </div>

          {/* Entry Price (read-only from market) */}
          <div className="space-y-1.5">
            <Label className="text-sm text-slate-300">Current Market Price</Label>
            <div className="px-3 py-2 rounded-md bg-slate-800/50 border border-slate-700 text-slate-200 font-mono text-sm">
              {formatPrice(entryPrice)}
            </div>
          </div>

          {/* Quantity & Leverage */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Quantity</Label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0.00"
                step={entryPrice > 1000 ? 0.001 : entryPrice > 1 ? 1 : 100}
                className="bg-slate-800 border-slate-600 text-slate-100 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300">Leverage</Label>
              <Input
                type="number"
                value={leverage}
                onChange={(e) => setLeverage(e.target.value)}
                min={1}
                max={100}
                className="bg-slate-800 border-slate-600 text-slate-100 font-mono"
              />
            </div>
          </div>

          {/* SL / TP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300 text-red-400">Stop Loss</Label>
              <Input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                step={step}
                className="bg-slate-800 border-slate-600 text-slate-100 font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm text-slate-300 text-emerald-400">Take Profit</Label>
              <Input
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Optional"
                step={step}
                className="bg-slate-800 border-slate-600 text-slate-100 font-mono"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Notional Value</span>
              <span className="text-slate-200 font-mono">{notional > 0 ? `$${notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Required Margin</span>
              <span className="text-slate-200 font-mono">{margin > 0 ? `$${margin.toFixed(2)}` : "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Liq. Price (est.)</span>
              <span className="text-amber-400 font-mono text-xs">
                {Number(quantity) > 0 ? formatPrice(side === "LONG"
                  ? entryPrice * (1 - 1 / Number(leverage) * 0.9)
                  : entryPrice * (1 + 1 / Number(leverage) * 0.9)) : "—"}
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !quantity || Number(quantity) <= 0}
            className={side === "LONG" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Open {side}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Main Component
// ============================================================
export default function PositionsPage() {
  // Data state
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [sideFilter, setSideFilter] = useState<"ALL" | TradeSide>("ALL");
  const [sortField, setSortField] = useState<SortField>("unrealizedPnl");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Dialog state
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [closeAllDialogOpen, setCloseAllDialogOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [isClosingAll, setIsClosingAll] = useState(false);

  // ============================================================
  // Load positions from API
  // ============================================================
  const loadPositions = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await fetch("/api/positions");
      const json = await res.json();
      if (json.success && json.data) {
        setPositions(json.data.filter((p: Position) => p.status === "OPEN"));
      }
    } catch {
      console.warn("Failed to load positions");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  // Auto-refresh positions every 15 seconds for live P&L
  useEffect(() => {
    const interval = setInterval(() => {
      if (positions.length > 0) {
        fetch("/api/positions")
          .then((r) => r.json())
          .then((json) => {
            if (json.success && json.data) {
              setPositions(json.data.filter((p: Position) => p.status === "OPEN"));
            }
          })
          .catch(() => {});
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [positions.length]);

  // ============================================================
  // Computed data
  // ============================================================
  const filteredPositions = useMemo(() => {
    let result = [...positions];

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((p) => p.symbol.toLowerCase().includes(s));
    }

    if (sideFilter !== "ALL") {
      result = result.filter((p) => p.side === sideFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "symbol": cmp = a.symbol.localeCompare(b.symbol); break;
        case "side": cmp = a.side.localeCompare(b.side); break;
        case "size": cmp = a.quantity - b.quantity; break;
        case "entryPrice": cmp = a.entryPrice - b.entryPrice; break;
        case "markPrice": cmp = getMarkPrice(a) - getMarkPrice(b); break;
        case "leverage": cmp = a.leverage - b.leverage; break;
        case "margin": cmp = a.margin - b.margin; break;
        case "unrealizedPnl": cmp = a.unrealizedPnl - b.unrealizedPnl; break;
        case "liquidationPrice": cmp = (a.liquidationPrice ?? 0) - (b.liquidationPrice ?? 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [positions, search, sideFilter, sortField, sortDir]);

  const totalUnrealizedPnl = positions.reduce((s, p) => s + p.unrealizedPnl, 0);
  const totalMargin = positions.reduce((s, p) => s + p.margin, 0);
  const totalExposure = positions.reduce((s, p) => s + p.entryPrice * p.quantity * p.leverage, 0);
  const pnlInfo = formatPnl(totalUnrealizedPnl);
  const longPositions = positions.filter((p) => p.side === "LONG");
  const shortPositions = positions.filter((p) => p.side === "SHORT");
  const profitableCount = positions.filter((p) => p.unrealizedPnl > 0).length;
  const losingCount = positions.filter((p) => p.unrealizedPnl < 0).length;
  const bestPosition = positions.length > 0
    ? positions.reduce((best, p) => p.unrealizedPnl > best.unrealizedPnl ? p : best)
    : null;
  const worstPosition = positions.length > 0
    ? positions.reduce((worst, p) => p.unrealizedPnl < worst.unrealizedPnl ? p : worst)
    : null;

  // ============================================================
  // Handlers
  // ============================================================
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

  // Close single position
  const handleClosePosition = async (qty: number, type: "market" | "limit", price?: number) => {
    if (!selectedPosition) return;
    try {
      const res = await fetch("/api/positions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: [selectedPosition.id],
          positionId: selectedPosition.id,
          partialQuantity: qty < selectedPosition.quantity ? qty : undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Closed ${selectedPosition.symbol}`, {
          description: `Realized P&L: ${formatPnl(json.data?.trades?.[0]?.pnl || 0).text}`,
        });
        loadPositions();
      } else {
        toast.error("Failed to close position", { description: json.error });
      }
    } catch {
      toast.error("Network error");
    }
  };

  // Close all positions
  const handleCloseAll = async () => {
    setIsClosingAll(true);
    try {
      const res = await fetch("/api/positions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closeAll: true }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Closed ${json.data.closedCount} positions`, {
          description: "All positions have been closed at market price.",
        });
        loadPositions();
        setCloseAllDialogOpen(false);
      } else {
        toast.error("Failed to close positions");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsClosingAll(false);
    }
  };

  // Edit SL/TP
  const handleEditSLTP = (data: {
    stopLoss: number | null;
    takeProfit: number | null;
    stopLossEnabled: boolean;
    takeProfitEnabled: boolean;
  }) => {
    if (!selectedPosition) return;
    setPositions((prev) =>
      prev.map((p) =>
        p.id === selectedPosition.id
          ? { ...p, stopLoss: data.stopLoss, takeProfit: data.takeProfit, updatedAt: new Date().toISOString() }
          : p
      )
    );
  };

  // Add position
  const handleAddPosition = () => {
    loadPositions();
  };

  // ============================================================
  // Loading state
  // ============================================================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-3">
          <Loader2 className="size-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-sm text-slate-400">Loading positions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">Live Positions</h1>
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-sm px-2.5 py-0.5">
              {positions.length} Open
            </Badge>
            {longPositions.length > 0 && (
              <Badge className="bg-emerald-500/10 text-emerald-400/70 border-emerald-500/20 text-xs px-2 py-0.5">
                {longPositions.length} Long
              </Badge>
            )}
            {shortPositions.length > 0 && (
              <Badge className="bg-red-500/10 text-red-400/70 border-red-500/20 text-xs px-2 py-0.5">
                {shortPositions.length} Short
              </Badge>
            )}
            {isRefreshing && <Loader2 className="size-4 text-emerald-400 animate-spin" />}
          </div>
          <div className={`text-3xl font-bold mt-1 ${pnlInfo.color}`}>
            {pnlInfo.text}
            <span className="text-base font-normal text-slate-400 ml-2">Unrealized P&L</span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => loadPositions(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => setCloseAllDialogOpen(true)}
            disabled={positions.length === 0}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Close All
          </Button>
          <Button
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Position
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          {
            label: "Total Margin",
            value: `$${totalMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
            icon: Wallet,
            color: "text-slate-200",
          },
          {
            label: "Total Exposure",
            value: `$${totalExposure.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
            icon: Activity,
            color: "text-slate-200",
          },
          {
            label: "Unrealized P&L",
            value: pnlInfo.text,
            icon: totalUnrealizedPnl >= 0 ? TrendingUp : TrendingDown,
            color: pnlInfo.color,
          },
          {
            label: "Profitable / Losing",
            value: `${profitableCount} / ${losingCount}`,
            icon: ShieldCheck,
            color: profitableCount >= losingCount ? "text-emerald-400" : "text-red-400",
          },
          {
            label: bestPosition ? `Best: ${bestPosition.symbol}` : "Best Position",
            value: bestPosition ? formatPnl(bestPosition.unrealizedPnl).text : "\u2014",
            icon: TrendingUp,
            color: bestPosition && bestPosition.unrealizedPnl >= 0 ? "text-emerald-400" : "text-slate-500",
          },
        ].map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="bg-slate-900/80 border border-slate-800 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <card.icon className={`h-4 w-4 ${card.color === "text-slate-200" ? "text-slate-400" : card.color}`} />
              <span className="text-sm text-slate-400">{card.label}</span>
            </div>
            <div className={`text-xl font-bold ${card.color}`}>{card.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search symbol..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-slate-900/80 border-slate-700 text-slate-200 placeholder:text-slate-500"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <Select value={sideFilter} onValueChange={(v) => setSideFilter(v as "ALL" | TradeSide)}>
          <SelectTrigger className="w-36 bg-slate-900/80 border-slate-700 text-slate-200">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            <SelectItem value="ALL">All Sides</SelectItem>
            <SelectItem value="LONG">Long</SelectItem>
            <SelectItem value="SHORT">Short</SelectItem>
          </SelectContent>
        </Select>
        {(search || sideFilter !== "ALL") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSearch(""); setSideFilter("ALL"); }}
            className="text-slate-400 hover:text-slate-200"
          >
            Clear Filters
          </Button>
        )}
      </div>

      {/* Positions Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider w-8"></TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("symbol")}
                >
                  <span className="flex items-center">Symbol {renderSortIcon("symbol")}</span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("side")}
                >
                  <span className="flex items-center">Side {renderSortIcon("side")}</span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("size")}
                >
                  <span className="flex items-center">Size {renderSortIcon("size")}</span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("entryPrice")}
                >
                  <span className="flex items-center">Entry {renderSortIcon("entryPrice")}</span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("markPrice")}
                >
                  <span className="flex items-center">Mark {renderSortIcon("markPrice")}</span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("leverage")}
                >
                  <span className="flex items-center">Lev. {renderSortIcon("leverage")}</span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("margin")}
                >
                  <span className="flex items-center">Margin {renderSortIcon("margin")}</span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("unrealizedPnl")}
                >
                  <span className="flex items-center">P&L {renderSortIcon("unrealizedPnl")}</span>
                </TableHead>
                <TableHead
                  className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none"
                  onClick={() => handleSort("liquidationPrice")}
                >
                  <span className="flex items-center">Liq. Price {renderSortIcon("liquidationPrice")}</span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider">SL / TP</TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filteredPositions.map((pos, idx) => {
                  const markPrice = getMarkPrice(pos);
                  const posPnlInfo = formatPnl(pos.unrealizedPnl);
                  const pnlPercent = ((pos.unrealizedPnl / pos.margin) * 100).toFixed(1);
                  const markChange = ((markPrice - pos.entryPrice) / pos.entryPrice) * 100;
                  const isExpanded = expandedRow === pos.id;
                  const isLiqClose =
                    pos.liquidationPrice &&
                    Math.abs(markPrice - pos.liquidationPrice) / pos.liquidationPrice < 0.1;

                  return (
                    <>
                      <motion.tr
                        key={pos.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03 }}
                        className={`border-slate-800 cursor-pointer transition-colors ${
                          pos.unrealizedPnl >= 0
                            ? "hover:bg-emerald-500/5"
                            : "hover:bg-red-500/5"
                        }`}
                        onClick={() => setExpandedRow(isExpanded ? null : pos.id)}
                      >
                        <TableCell className="py-3">
                          {isExpanded ? (
                            <ChevronUp className="h-3 w-3 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-3 w-3 text-slate-400" />
                          )}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-white shrink-0">
                              {SYMBOL_LOGOS[pos.symbol] || "●"}
                            </div>
                            <span className="font-medium text-white">{pos.symbol}</span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge
                            className={
                              pos.side === "LONG"
                                ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                : "bg-red-500/20 text-red-400 border-red-500/30"
                            }
                          >
                            {pos.side}
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-slate-200 font-mono text-sm">
                          {pos.quantity}
                        </TableCell>
                        <TableCell className="py-3 text-slate-200 font-mono text-sm">
                          {formatPrice(pos.entryPrice)}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="font-mono text-sm text-slate-200">
                            {formatPrice(markPrice)}
                          </div>
                          <div className={`text-xs font-mono ${markChange >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {markChange >= 0 ? "+" : ""}{markChange.toFixed(2)}%
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 font-mono">
                            {pos.leverage}x
                          </Badge>
                        </TableCell>
                        <TableCell className="py-3 text-slate-200 font-mono text-sm">
                          ${pos.margin.toFixed(2)}
                        </TableCell>
                        <TableCell className="py-3">
                          <div className={`font-mono text-sm font-semibold ${posPnlInfo.color}`}>
                            {posPnlInfo.text}
                          </div>
                          <div className={`text-xs font-mono ${posPnlInfo.color}`}>
                            ({pnlPercent}%)
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="flex items-center gap-1">
                            {isLiqClose && <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />}
                            <span className={`font-mono text-sm ${isLiqClose ? "text-amber-400" : "text-slate-300"}`}>
                              {pos.liquidationPrice ? formatPrice(pos.liquidationPrice) : "—"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-3">
                          <div className="space-y-0.5 text-xs font-mono">
                            <div className="text-red-400">SL: {pos.stopLoss ? formatPrice(pos.stopLoss) : "—"}</div>
                            <div className="text-emerald-400">TP: {pos.takeProfit ? formatPrice(pos.takeProfit) : "—"}</div>
                          </div>
                        </TableCell>
                        <TableCell className="py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10"
                              onClick={() => { setSelectedPosition(pos); setEditDialogOpen(true); }}
                              title="Edit SL/TP"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => { setSelectedPosition(pos); setCloseDialogOpen(true); }}
                              title="Close Position"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </motion.tr>
                      {/* Expanded Row */}
                      {isExpanded && (
                        <motion.tr
                          key={`${pos.id}-expanded`}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="border-slate-800"
                        >
                          <TableCell colSpan={12} className="bg-slate-800/30 py-0">
                            <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-slate-500">Notional Value</span>
                                <div className="text-slate-200 font-mono">
                                  ${(pos.entryPrice * pos.quantity).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-500">Exchange</span>
                                <div className="text-slate-200">
                                  {pos.exchange?.name ||
                                    (pos.exchangeId?.includes("binance") ? "Binance"
                                      : pos.exchangeId?.includes("bybit") ? "Bybit"
                                      : pos.exchangeId?.includes("bingx") ? "BingX"
                                      : "Unknown")}
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-500">Strategy</span>
                                <div className="text-slate-200 text-xs">
                                  {pos.strategy?.name ||
                                    (pos.strategyId?.includes("ema") ? "EMA Cross + MACD"
                                      : pos.strategyId?.includes("scalp") ? "Scalp Master"
                                      : pos.strategyId?.includes("break") ? "Breakout Hunter"
                                      : pos.strategyId?.includes("smart") ? "Smart Money"
                                      : pos.strategyId?.includes("ai") ? "AI Adaptive"
                                      : "Manual")}
                                </div>
                              </div>
                              <div>
                                <span className="text-slate-500">Opened</span>
                                <div className="text-slate-200 text-xs">
                                  {formatDistanceToNow(new Date(pos.openedAt), { addSuffix: true })}
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </motion.tr>
                      )}
                    </>
                  );
                })}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>

        {filteredPositions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <ShieldCheck className="h-10 w-10 mb-3 opacity-40" />
            <p>No positions found matching your filters</p>
            {(search || sideFilter !== "ALL") && (
              <Button
                variant="ghost"
                className="mt-3 text-slate-400"
                onClick={() => { setSearch(""); setSideFilter("ALL"); }}
              >
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Close Position Dialog */}
      <ClosePositionDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        position={selectedPosition}
        onConfirm={handleClosePosition}
      />

      {/* Edit SL/TP Dialog */}
      <EditSLTPDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        position={selectedPosition}
        onConfirm={handleEditSLTP}
      />

      {/* Close All Confirm Dialog */}
      <ConfirmCloseAllDialog
        open={closeAllDialogOpen}
        onOpenChange={setCloseAllDialogOpen}
        onConfirm={handleCloseAll}
        count={positions.length}
        totalPnl={totalUnrealizedPnl}
        isLoading={isClosingAll}
      />

      {/* Add Position Dialog */}
      <AddPositionDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        onConfirm={handleAddPosition}
      />
    </div>
  );
}
