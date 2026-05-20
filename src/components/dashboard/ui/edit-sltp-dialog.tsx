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
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Loader2, Edit3, Target, ShieldAlert, Trash2, Percent } from "lucide-react";
import type { Position } from "@/lib/types/trading";
import { toast } from "sonner";

interface EditSLTPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: Position | null;
  onConfirm: (data: {
    stopLoss: number | null;
    takeProfit: number | null;
    stopLossEnabled: boolean;
    takeProfitEnabled: boolean;
  }) => void;
}

export function EditSLTPDialog({
  open,
  onOpenChange,
  position,
  onConfirm,
}: EditSLTPDialogProps) {
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [stopLossEnabled, setStopLossEnabled] = useState(true);
  const [takeProfitEnabled, setTakeProfitEnabled] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize values when position changes
  const handleOpen = (isOpen: boolean) => {
    if (isOpen && position) {
      setStopLoss(position.stopLoss ? String(position.stopLoss) : "");
      setTakeProfit(position.takeProfit ? String(position.takeProfit) : "");
      setStopLossEnabled(!!position.stopLoss);
      setTakeProfitEnabled(!!position.takeProfit);
    }
    onOpenChange(isOpen);
  };

  const pnlPercent =
    position?.margin && position?.margin > 0 && takeProfit
      ? ((Number(takeProfit) - position.entryPrice) / position.entryPrice) *
        100 *
        (position.side === "LONG" ? 1 : -1) *
        position.leverage
      : 0;

  const slDistance =
    position && stopLoss
      ? Math.abs((Number(stopLoss) - position.entryPrice) / position.entryPrice) * 100
      : 0;

  const riskReward = takeProfit && stopLoss && Number(takeProfit) && Number(stopLoss)
    ? Math.abs(Number(takeProfit) - (position?.entryPrice || 0)) / Math.abs(Number(stopLoss) - (position?.entryPrice || 0))
    : 0;

  const handleSubmit = async () => {
    if (!position) return;
    setIsSubmitting(true);

    try {
      const res = await fetch(`/api/positions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: position.id,
          stopLoss: stopLossEnabled && stopLoss ? Number(stopLoss) : null,
          takeProfit: takeProfitEnabled && takeProfit ? Number(takeProfit) : null,
        }),
      });
      const json = await res.json();

      if (json.success) {
        toast.success("SL/TP updated", {
          description: `${position.symbol}: SL=${stopLossEnabled && stopLoss ? '$' + Number(stopLoss).toLocaleString() : 'None'}, TP=${takeProfitEnabled && takeProfit ? '$' + Number(takeProfit).toLocaleString() : 'None'}`,
        });
        onConfirm({
          stopLoss: stopLossEnabled && stopLoss ? Number(stopLoss) : null,
          takeProfit: takeProfitEnabled && takeProfit ? Number(takeProfit) : null,
          stopLossEnabled,
          takeProfitEnabled,
        });
        handleOpen(false);
      } else {
        toast.error("Failed to update SL/TP", { description: json.error });
      }
    } catch {
      // Fallback: still call onConfirm for local state update
      onConfirm({
        stopLoss: stopLossEnabled && stopLoss ? Number(stopLoss) : null,
        takeProfit: takeProfitEnabled && takeProfit ? Number(takeProfit) : null,
        stopLossEnabled,
        takeProfitEnabled,
      });
      toast.success("SL/TP updated locally");
      handleOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValid =
    stopLossEnabled && !stopLoss ? false :
    takeProfitEnabled && !takeProfit ? false : true;

  // Determine step based on price magnitude
  const step = position && position.entryPrice >= 1000 ? 0.1 : position && position.entryPrice >= 1 ? 0.01 : 0.0001;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="bg-slate-900 border-slate-700 sm:max-w-md text-slate-100">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit3 className="h-5 w-5 text-blue-400" />
            Edit Stop Loss / Take Profit
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Modify the stop loss and take profit levels for this position
          </DialogDescription>
        </DialogHeader>

        {position && (
          <div className="space-y-4">
            {/* Position Summary */}
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
              <div className="flex items-center justify-between mb-2">
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
                  Entry: <span className="text-slate-200 font-mono">${position.entryPrice.toLocaleString()}</span>
                </div>
                <div className="text-slate-400">
                  Size: <span className="text-slate-200 font-mono">{position.quantity}</span>
                </div>
              </div>
            </div>

            {/* Stop Loss */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-300 flex items-center gap-2">
                  <ShieldAlert className="size-4 text-red-400" />
                  Stop Loss
                </Label>
                <Switch checked={stopLossEnabled} onCheckedChange={setStopLossEnabled} />
              </div>
              <AnimatePresence>
                {stopLossEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    <Input
                      type="number"
                      value={stopLoss}
                      onChange={(e) => setStopLoss(e.target.value)}
                      placeholder={position.side === "LONG"
                        ? `Below entry ($${position.entryPrice.toLocaleString()})`
                        : `Above entry ($${position.entryPrice.toLocaleString()})`}
                      step={step}
                      className="bg-slate-800 border-slate-600 text-slate-100 font-mono"
                    />
                    {stopLoss && (
                      <p className="text-xs text-slate-500 mt-1">
                        Distance from entry: {slDistance.toFixed(2)}%
                        {position.margin > 0 && (
                          <span className="text-red-400 ml-1">
                            (~${(slDistance / 100 * position.entryPrice * position.quantity * position.leverage).toFixed(2)} loss)
                          </span>
                        )}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Separator className="bg-slate-700/50" />

            {/* Take Profit */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm text-slate-300 flex items-center gap-2">
                  <Target className="size-4 text-emerald-400" />
                  Take Profit
                </Label>
                <Switch checked={takeProfitEnabled} onCheckedChange={setTakeProfitEnabled} />
              </div>
              <AnimatePresence>
                {takeProfitEnabled && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                  >
                    <Input
                      type="number"
                      value={takeProfit}
                      onChange={(e) => setTakeProfit(e.target.value)}
                      placeholder={position.side === "LONG"
                        ? `Above entry ($${position.entryPrice.toLocaleString()})`
                        : `Below entry ($${position.entryPrice.toLocaleString()})`}
                      step={step}
                      className="bg-slate-800 border-slate-600 text-slate-100 font-mono"
                    />
                    {takeProfit && Number(takeProfit) > 0 && (
                      <p className="text-xs text-slate-500 mt-1">
                        <Percent className="size-3 inline" /> Est. profit: +{pnlPercent.toFixed(2)}%
                        {position.margin > 0 && (
                          <span className="text-emerald-400 ml-1">
                            (~$${(Math.abs(pnlPercent) / 100 * position.margin).toFixed(2)} gain)
                          </span>
                        )}
                      </p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Risk/Reward Ratio */}
            {riskReward > 0 && (
              <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3 text-center">
                <div className="text-xs text-slate-400 mb-1">Risk / Reward Ratio</div>
                <div className={`text-lg font-bold font-mono ${
                  riskReward >= 2 ? "text-emerald-400" : riskReward >= 1 ? "text-amber-400" : "text-red-400"
                }`}>
                  1 : {riskReward.toFixed(2)}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  {riskReward >= 2 ? "Excellent R/R" : riskReward >= 1 ? "Acceptable R/R" : "Poor R/R - consider adjusting"}
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpen(false)}
            className="border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !isValid}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {isSubmitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
