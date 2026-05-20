"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, AlertTriangle, TrendingUp, TrendingDown } from "lucide-react";
import type { Position } from "@/lib/types/trading";

interface ClosePositionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: Position | null;
  onConfirm: (quantity: number, type: "market" | "limit", limitPrice?: number) => void;
}

export function ClosePositionDialog({
  open,
  onOpenChange,
  position,
  onConfirm,
}: ClosePositionDialogProps) {
  const [closeMode, setCloseMode] = useState<"all" | "partial">("all");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [partialQty, setPartialQty] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isLong = position?.side === "LONG";
  const pnlColor = (position?.unrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400";
  const pnlSign = (position?.unrealizedPnl ?? 0) >= 0 ? "+" : "";

  const estimatedPnl =
    closeMode === "all"
      ? position?.unrealizedPnl ?? 0
      : (position?.unrealizedPnl ?? 0) * (Number(partialQty) / (position?.quantity ?? 1));

  const estimatedPnlDisplay = `${pnlSign}$${Math.abs(estimatedPnl).toFixed(2)}`;

  const handleSubmit = async () => {
    if (!position) return;
    setIsSubmitting(true);

    // Simulate API call
    await new Promise((r) => setTimeout(r, 1000));

    const qty = closeMode === "all" ? position.quantity : Number(partialQty);
    const lp = orderType === "limit" ? Number(limitPrice) : undefined;
    onConfirm(qty, orderType, lp);

    setIsSubmitting(false);
    onOpenChange(false);
    // Reset state
    setCloseMode("all");
    setOrderType("market");
    setPartialQty("");
    setLimitPrice("");
  };

  // Calculate how close the mark price is to liquidation
  const liquidationBuffer =
    position?.liquidationPrice && position?.entryPrice
      ? Math.abs(((position.liquidationPrice - position.entryPrice) / position.entryPrice) * 100)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-md text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-400" />
            Close Position
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Confirm position closure. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {position && (
          <div className="space-y-4">
            {/* Position Summary */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-white">{position.symbol}</span>
                <Badge
                  className={
                    position.side === "LONG"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                      : "bg-red-500/20 text-red-400 border-red-500/30"
                  }
                >
                  {position.side} {position.leverage}x
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="text-slate-400">
                  Entry: <span className="text-slate-200">${position.entryPrice.toLocaleString()}</span>
                </div>
                <div className="text-slate-400">
                  Size: <span className="text-slate-200">{position.quantity}</span>
                </div>
                <div className="text-slate-400">
                  Margin: <span className="text-slate-200">${position.margin.toFixed(2)}</span>
                </div>
                <div className={pnlColor}>
                  Est. P&L: <span className="font-semibold">{estimatedPnlDisplay}</span>
                </div>
              </div>
              {position.liquidationPrice && (
                <div className="text-xs text-slate-500">
                  Liquidation Price: ${position.liquidationPrice.toLocaleString()}
                  {liquidationBuffer !== null && liquidationBuffer < 10 && (
                    <span className="text-amber-400 ml-1 font-medium">(Close!)</span>
                  )}
                </div>
              )}
            </div>

            {/* Close Mode */}
            <div className="space-y-2">
              <Label className="text-sm text-slate-300">Close Mode</Label>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={closeMode === "all" ? "default" : "outline"}
                  onClick={() => setCloseMode("all")}
                  className={
                    closeMode === "all"
                      ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
                      : "border-slate-600 text-slate-300 hover:bg-slate-800"
                  }
                >
                  Close All
                </Button>
                <Button
                  size="sm"
                  variant={closeMode === "partial" ? "default" : "outline"}
                  onClick={() => setCloseMode("partial")}
                  className={
                    closeMode === "partial"
                      ? "bg-slate-100 text-slate-900 hover:bg-slate-200"
                      : "border-slate-600 text-slate-300 hover:bg-slate-800"
                  }
                >
                  Close Partial
                </Button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {closeMode === "partial" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Label className="text-sm text-slate-300">
                    Quantity (max: {position.quantity})
                  </Label>
                  <Input
                    type="number"
                    value={partialQty}
                    onChange={(e) => setPartialQty(e.target.value)}
                    placeholder={`Max: ${position.quantity}`}
                    min={0}
                    max={position.quantity}
                    step={position.quantity > 100 ? 100 : 0.01}
                    className="mt-1 bg-slate-800 border-slate-600 text-slate-100"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Order Type */}
            <div className="space-y-2">
              <Label className="text-sm text-slate-300">Order Type</Label>
              <RadioGroup
                value={orderType}
                onValueChange={(v) => setOrderType(v as "market" | "limit")}
                className="flex gap-4"
              >
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="market" id="close-market" className="border-slate-500" />
                  <Label htmlFor="close-market" className="text-slate-300 cursor-pointer">
                    Market
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <RadioGroupItem value="limit" id="close-limit" className="border-slate-500" />
                  <Label htmlFor="close-limit" className="text-slate-300 cursor-pointer">
                    Limit
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <AnimatePresence mode="wait">
              {orderType === "limit" && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <Label className="text-sm text-slate-300">Limit Price</Label>
                  <Input
                    type="number"
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    placeholder="Enter limit price"
                    step={position.entryPrice > 1000 ? 0.1 : 0.0001}
                    className="mt-1 bg-slate-800 border-slate-600 text-slate-100"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Estimated P&L Display */}
            <div
              className={`rounded-lg border p-3 text-center ${
                estimatedPnl >= 0
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-red-500/10 border-red-500/30"
              }`}
            >
              <div className="text-xs text-slate-400 mb-1">Estimated Realized P&L</div>
              <div className={`text-xl font-bold ${pnlColor} flex items-center justify-center gap-1`}>
                {estimatedPnl >= 0 ? (
                  <TrendingUp className="h-5 w-5" />
                ) : (
                  <TrendingDown className="h-5 w-5" />
                )}
                {estimatedPnlDisplay}
              </div>
            </div>
          </div>
        )}

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
            disabled={
              isSubmitting ||
              (closeMode === "partial" && (!partialQty || Number(partialQty) <= 0)) ||
              (orderType === "limit" && !limitPrice)
            }
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirm Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
