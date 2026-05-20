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
  Clock,
  CheckCircle2,
  Ban,
  AlertCircle,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Activity,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Order, OrderStatus, OrderType, TradeSide } from "@/lib/types/trading";
import { toast } from "sonner";

type SortField = "symbol" | "side" | "type" | "price" | "quantity" | "status" | "created";
type SortDir = "asc" | "desc";

const STATUS_BADGE: Record<OrderStatus, { className: string; icon: React.ElementType }> = {
  PENDING: { className: "bg-amber-500/20 text-amber-400 border-amber-500/30", icon: Clock },
  FILLED: { className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
  CANCELLED: { className: "bg-slate-500/20 text-slate-400 border-slate-500/30", icon: Ban },
  REJECTED: { className: "bg-red-500/20 text-red-400 border-red-500/30", icon: AlertCircle },
};

const TYPE_BADGE: Record<OrderType, string> = {
  MARKET: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  LIMIT: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  STOP: "bg-orange-500/20 text-orange-400 border-orange-500/30",
};

const SYMBOL_PRICES: Record<string, number> = {
  BTCUSDT: 67500, ETHUSDT: 3520, SOLUSDT: 197, DOGEUSDT: 0.083,
  XRPUSDT: 0.64, AVAXUSDT: 39.5, LINKUSDT: 16.2, ADAUSDT: 0.59,
  MATICUSDT: 0.79, ARBUSDT: 0.93, OPUSDT: 1.88, APTUSDT: 9.8,
  SUIUSDT: 1.15, NEARUSDT: 7.2, DOTUSDT: 8.1,
};

function formatPrice(price: number | null): string {
  if (price === null) return "Market";
  if (price >= 1000) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  if (price >= 1) return `$${price.toFixed(4)}`;
  return `$${price.toFixed(6)}`;
}

// ============================================================
// New Order Dialog
// ============================================================
function NewOrderDialog({
  open,
  onOpenChange,
  onOrderCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOrderCreated: () => void;
}) {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [side, setSide] = useState<TradeSide>("LONG");
  const [orderType, setOrderType] = useState<OrderType>("LIMIT");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("");
  const [leverage, setLeverage] = useState([10]);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const currentPrice = SYMBOL_PRICES[symbol] || 0;

  const estimatedMargin = useMemo(() => {
    const p = orderType === "MARKET" || !price ? currentPrice : Number(price);
    const q = Number(quantity) || 0;
    const lev = leverage[0] || 1;
    if (p <= 0 || q <= 0) return 0;
    return (p * q) / lev;
  }, [price, quantity, leverage, orderType, currentPrice]);

  const notional = useMemo(() => {
    const p = orderType === "MARKET" || !price ? currentPrice : Number(price);
    const q = Number(quantity) || 0;
    return p * q;
  }, [price, quantity, orderType, currentPrice]);

  const step = currentPrice >= 1000 ? 0.1 : currentPrice >= 1 ? 0.01 : 0.0001;

  const handleSubmit = async () => {
    if (!symbol || !quantity || Number(quantity) <= 0) return;

    if (orderType !== "MARKET" && !price) {
      toast.error("Price is required for limit/stop orders");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          type: orderType,
          price: orderType === "MARKET" ? null : Number(price),
          quantity: Number(quantity),
          leverage: leverage[0],
          reduceOnly,
        }),
      });
      const json = await res.json();

      if (json.success) {
        toast.success("Order placed", {
          description: `${side} ${quantity} ${symbol} @ ${orderType === "MARKET" ? "Market" : formatPrice(Number(price))} (${leverage[0]}x)`,
        });
        onOrderCreated();
        onOpenChange(false);
        // Reset
        setSymbol("BTCUSDT");
        setSide("LONG");
        setOrderType("LIMIT");
        setPrice("");
        setQuantity("");
        setLeverage([10]);
        setStopLoss("");
        setTakeProfit("");
        setReduceOnly(false);
      } else {
        toast.error("Failed to place order", { description: json.error });
      }
    } catch {
      toast.error("Network error - order not placed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-lg text-slate-100 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Plus className="h-5 w-5 text-emerald-400" />
            New Order
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Place a new trade order. Set your parameters below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Symbol & Side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Symbol</Label>
              <Select value={symbol} onValueChange={(v) => setSymbol(v)}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-slate-100 font-mono">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-600">
                  {Object.keys(SYMBOL_PRICES).map((s) => (
                    <SelectItem key={s} value={s} className="font-mono text-slate-200">
                      {s}
                      <span className="text-slate-500 ml-2 text-xs">${SYMBOL_PRICES[s]?.toLocaleString()}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Side</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={side === "LONG" ? "default" : "outline"}
                  onClick={() => setSide("LONG")}
                  className={side === "LONG" ? "bg-emerald-500 hover:bg-emerald-600 text-white flex-1" : "border-slate-600 text-slate-300 hover:bg-slate-800 flex-1"}
                >
                  Long
                </Button>
                <Button
                  size="sm"
                  variant={side === "SHORT" ? "default" : "outline"}
                  onClick={() => setSide("SHORT")}
                  className={side === "SHORT" ? "bg-red-500 hover:bg-red-600 text-white flex-1" : "border-slate-600 text-slate-300 hover:bg-slate-800 flex-1"}
                >
                  Short
                </Button>
              </div>
            </div>
          </div>

          {/* Order Type */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm">Order Type</Label>
            <div className="flex gap-2">
              {(["MARKET", "LIMIT", "STOP"] as OrderType[]).map((t) => (
                <Button
                  key={t}
                  size="sm"
                  variant={orderType === t ? "default" : "outline"}
                  onClick={() => setOrderType(t)}
                  className={orderType === t ? "bg-slate-100 text-slate-900 hover:bg-slate-200 flex-1" : "border-slate-600 text-slate-300 hover:bg-slate-800 flex-1"}
                >
                  {t}
                </Button>
              ))}
            </div>
          </div>

          {/* Market Price Info */}
          {orderType !== "MARKET" && (
            <div className="text-xs text-slate-500 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Current market price for {symbol}: <span className="font-mono text-slate-400">{formatPrice(currentPrice)}</span>
            </div>
          )}

          {/* Price */}
          {orderType !== "MARKET" && (
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm">Price (USDT)</Label>
              <Input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder={currentPrice > 0 ? `e.g. ${currentPrice.toLocaleString()}` : "Enter price"}
                step={step}
                className="bg-slate-800 border-slate-600 text-slate-100 font-mono placeholder:text-slate-500"
              />
            </div>
          )}

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label className="text-slate-300 text-sm">Quantity</Label>
            <Input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="Enter quantity"
              step={currentPrice > 1000 ? 0.001 : currentPrice > 1 ? 1 : 100}
              className="bg-slate-800 border-slate-600 text-slate-100 font-mono placeholder:text-slate-500"
            />
          </div>

          {/* Leverage */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-slate-300 text-sm">Leverage</Label>
              <span className="text-emerald-400 font-mono text-sm font-semibold">{leverage[0]}x</span>
            </div>
            <Slider
              value={leverage}
              onValueChange={setLeverage}
              min={1}
              max={100}
              step={1}
              className="py-2"
            />
            <div className="flex justify-between text-xs text-slate-500">
              <span>1x</span><span>25x</span><span>50x</span><span>75x</span><span>100x</span>
            </div>
          </div>

          {/* SL / TP */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm text-red-400">Stop Loss</Label>
              <Input
                type="number"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Optional"
                step={step}
                className="bg-slate-800 border-slate-600 text-slate-100 font-mono placeholder:text-slate-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-300 text-sm text-emerald-400">Take Profit</Label>
              <Input
                type="number"
                value={takeProfit}
                onChange={(e) => setTakeProfit(e.target.value)}
                placeholder="Optional"
                step={step}
                className="bg-slate-800 border-slate-600 text-slate-100 font-mono placeholder:text-slate-500"
              />
            </div>
          </div>

          {/* Reduce Only */}
          <div className="flex items-center gap-2">
            <Checkbox
              id="reduce-only"
              checked={reduceOnly}
              onCheckedChange={(c) => setReduceOnly(c === true)}
              className="border-slate-500 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500"
            />
            <Label htmlFor="reduce-only" className="text-sm text-slate-300 cursor-pointer">
              Reduce Only (close existing position)
            </Label>
          </div>

          {/* Summary */}
          <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Notional Value</span>
              <span className="text-slate-200 font-mono">{notional > 0 ? `$${notional.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "—"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Estimated Margin</span>
              <span className="text-white font-bold font-mono">${estimatedMargin.toFixed(2)}</span>
            </div>
            {leverage[0] > 20 && (
              <div className="text-xs text-amber-400 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                High leverage ({leverage[0]}x) increases liquidation risk
              </div>
            )}
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
            disabled={isSubmitting || !symbol || !quantity || Number(quantity) <= 0 || (orderType !== "MARKET" && !price)}
            className={side === "LONG" ? "bg-emerald-500 hover:bg-emerald-600 text-white" : "bg-red-500 hover:bg-red-600 text-white"}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {side === "LONG" ? "Buy / Long" : "Sell / Short"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Cancel All Confirm Dialog
// ============================================================
function CancelAllDialog({
  open,
  onOpenChange,
  onConfirm,
  count,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  count: number;
  isLoading: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-sm text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <AlertTriangle className="h-5 w-5" />
            Cancel All Pending Orders
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            This will cancel all {count} pending order(s). Filled orders cannot be cancelled.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
          <p className="text-sm text-red-400">
            {count} pending order(s) will be cancelled. This action cannot be undone.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Keep Orders
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Cancel {count} Order(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Main Component
// ============================================================
export default function OrdersPage() {
  // Data state
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");
  const [sortField, setSortField] = useState<SortField>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Dialog state
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState<string | null>(null);
  const [cancelAllOpen, setCancelAllOpen] = useState(false);
  const [isCancellingAll, setIsCancellingAll] = useState(false);

  // ============================================================
  // Load orders from API
  // ============================================================
  const loadOrders = useCallback(async (showRefresh = false) => {
    if (showRefresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const res = await fetch("/api/orders");
      const json = await res.json();
      if (json.success && json.data) {
        setOrders(json.data);
      }
    } catch {
      console.warn("Failed to load orders");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // ============================================================
  // Computed data
  // ============================================================
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((o) => o.symbol.toLowerCase().includes(s));
    }

    if (statusFilter !== "ALL") {
      result = result.filter((o) => o.status === statusFilter);
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "symbol": cmp = a.symbol.localeCompare(b.symbol); break;
        case "side": cmp = a.side.localeCompare(b.side); break;
        case "type": cmp = a.type.localeCompare(b.type); break;
        case "price": cmp = (a.price ?? 0) - (b.price ?? 0); break;
        case "quantity": cmp = a.quantity - b.quantity; break;
        case "status": cmp = a.status.localeCompare(b.status); break;
        case "created": cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [orders, search, statusFilter, sortField, sortDir]);

  const pendingCount = orders.filter((o) => o.status === "PENDING").length;
  const filledCount = orders.filter((o) => o.status === "FILLED").length;
  const cancelledCount = orders.filter((o) => o.status === "CANCELLED").length;
  const totalValue = orders
    .filter((o) => o.status === "PENDING")
    .reduce((s, o) => s + (o.price || 0) * o.quantity * o.leverage, 0);

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
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1 text-emerald-400" />
      : <ArrowDown className="h-3 w-3 ml-1 text-emerald-400" />;
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      const res = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId }),
      });
      const json = await res.json();

      if (json.success) {
        const order = json.data;
        toast.success("Order cancelled", {
          description: `${order.symbol} ${order.type} order has been cancelled`,
        });
        loadOrders();
      } else {
        toast.error("Failed to cancel", { description: json.error });
      }
    } catch {
      toast.error("Network error");
    }
    setCancelConfirm(null);
  };

  const handleCancelAll = async () => {
    setIsCancellingAll(true);
    try {
      const res = await fetch("/api/orders", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancelAll: true }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(`Cancelled ${json.data.cancelledCount} order(s)`);
        loadOrders();
        setCancelAllOpen(false);
      } else {
        toast.error("Failed to cancel orders");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setIsCancellingAll(false);
    }
  };

  const statusTabs: { label: string; value: "ALL" | OrderStatus; count?: number }[] = [
    { label: "All", value: "ALL", count: orders.length },
    { label: "Pending", value: "PENDING", count: pendingCount },
    { label: "Filled", value: "FILLED", count: filledCount },
    { label: "Cancelled", value: "CANCELLED", count: cancelledCount },
  ];

  // ============================================================
  // Loading state
  // ============================================================
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[80vh]">
        <div className="text-center space-y-3">
          <Loader2 className="size-8 text-emerald-400 animate-spin mx-auto" />
          <p className="text-sm text-slate-400">Loading orders...</p>
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
            <h1 className="text-2xl font-bold text-white">Orders</h1>
            <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-sm px-2.5 py-0.5">
              {pendingCount} Pending
            </Badge>
            {isRefreshing && <Loader2 className="size-4 text-emerald-400 animate-spin" />}
          </div>
          <p className="text-sm text-slate-400 mt-1">{orders.length} total orders</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => loadOrders(true)}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
            onClick={() => setCancelAllOpen(true)}
            disabled={pendingCount === 0}
          >
            <XCircle className="h-4 w-4 mr-2" />
            Cancel All Pending
          </Button>
          <Button
            className="bg-emerald-500 hover:bg-emerald-600 text-white"
            onClick={() => setNewOrderOpen(true)}
          >
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/80 border border-slate-800 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <span className="text-sm text-slate-400">Pending Orders</span>
          </div>
          <div className="text-2xl font-bold text-amber-400">{pendingCount}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-slate-900/80 border border-slate-800 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span className="text-sm text-slate-400">Filled Orders</span>
          </div>
          <div className="text-2xl font-bold text-emerald-400">{filledCount}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-slate-900/80 border border-slate-800 rounded-xl p-4"
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity className="h-4 w-4 text-slate-400" />
            <span className="text-sm text-slate-400">Pending Value</span>
          </div>
          <div className="text-2xl font-bold text-slate-200">
            ${totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </div>
        </motion.div>
      </div>

      {/* Status Tabs */}
      <div className="flex gap-1 bg-slate-900/80 border border-slate-800 rounded-lg p-1 w-fit overflow-x-auto">
        {statusTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusFilter(tab.value)}
            className={`px-4 py-1.5 rounded-md text-sm transition-all whitespace-nowrap ${
              statusFilter === tab.value
                ? "bg-emerald-500/20 text-emerald-400 font-medium"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 text-xs opacity-70">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
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

      {/* Orders Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-800 hover:bg-transparent">
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("symbol")}>
                  <span className="flex items-center">Symbol {renderSortIcon("symbol")}</span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("side")}>
                  <span className="flex items-center">Side {renderSortIcon("side")}</span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("type")}>
                  <span className="flex items-center">Type {renderSortIcon("type")}</span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("price")}>
                  <span className="flex items-center">Price {renderSortIcon("price")}</span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("quantity")}>
                  <span className="flex items-center">Quantity {renderSortIcon("quantity")}</span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider">Leverage</TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("status")}>
                  <span className="flex items-center">Status {renderSortIcon("status")}</span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider">Filled %</TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider cursor-pointer select-none" onClick={() => handleSort("created")}>
                  <span className="flex items-center">Created {renderSortIcon("created")}</span>
                </TableHead>
                <TableHead className="text-slate-400 text-xs uppercase tracking-wider text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filteredOrders.map((order, idx) => {
                  const statusConfig = STATUS_BADGE[order.status];
                  const StatusIcon = statusConfig.icon;
                  const filledPercent = order.status === "FILLED" ? 100 : order.status === "CANCELLED" || order.status === "REJECTED" ? 0 : Math.floor(Math.random() * 30 + 10);

                  return (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.03 }}
                      className="border-slate-800 hover:bg-slate-800/50"
                    >
                      <TableCell className="py-3">
                        <span className="font-medium text-white">{order.symbol}</span>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge className={order.side === "LONG" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-red-500/20 text-red-400 border-red-500/30"}>
                          {order.side}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge className={TYPE_BADGE[order.type]}>{order.type}</Badge>
                      </TableCell>
                      <TableCell className="py-3 font-mono text-sm text-slate-200">
                        {formatPrice(order.price)}
                      </TableCell>
                      <TableCell className="py-3 font-mono text-sm text-slate-200">{order.quantity}</TableCell>
                      <TableCell className="py-3">
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 font-mono">{order.leverage}x</Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <Badge className={statusConfig.className}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                order.status === "FILLED" ? "bg-emerald-400"
                                  : order.status === "CANCELLED" ? "bg-slate-500"
                                  : "bg-amber-400"
                              }`}
                              style={{ width: `${filledPercent}%` }}
                            />
                          </div>
                          <span className="text-xs text-slate-400 font-mono">{filledPercent}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-3 text-xs text-slate-400">
                        {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell className="py-3 text-right">
                        {order.status === "PENDING" &&
                          (cancelConfirm === order.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                onClick={() => handleCancelOrder(order.id)}
                              >
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-slate-400"
                                onClick={() => setCancelConfirm(null)}
                              >
                                No
                              </Button>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                              onClick={() => setCancelConfirm(order.id)}
                              title="Cancel order"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          ))}
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>

        {filteredOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <AlertCircle className="h-10 w-10 mb-3 opacity-40" />
            <p>No orders found</p>
            {(search || statusFilter !== "ALL") && (
              <Button variant="ghost" className="mt-3 text-slate-400" onClick={() => { setSearch(""); setStatusFilter("ALL"); }}>
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* New Order Dialog */}
      <NewOrderDialog open={newOrderOpen} onOpenChange={setNewOrderOpen} onOrderCreated={() => loadOrders()} />

      {/* Cancel All Dialog */}
      <CancelAllDialog
        open={cancelAllOpen}
        onOpenChange={setCancelAllOpen}
        onConfirm={handleCancelAll}
        count={pendingCount}
        isLoading={isCancellingAll}
      />
    </div>
  );
}


