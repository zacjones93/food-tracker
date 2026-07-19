"use client";

import { useState, useEffect } from "react";
import { useServerAction } from "zsa-react";
import {
  transferGroceryItemsAction,
  getAvailableWeeksForTransferAction,
} from "../../grocery-items.actions";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2 } from "@/components/ui/themed-icons";
import { formatWeekDisplay, groupItemsByCategory } from "@/lib/grocery-utils";

interface TransferItemsDialogProps {
  sourceWeekId: string;
  items: Array<{
    id: string;
    name: string;
    category?: string | null;
    order: number | null;
  }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function TransferItemsDialog({
  sourceWeekId,
  items,
  open,
  onOpenChange,
  onSuccess,
}: TransferItemsDialogProps) {
  const [targetWeekId, setTargetWeekId] = useState<string>("");

  const { execute: fetchWeeks, data: weeksData, isPending: isLoadingWeeks } = useServerAction(
    getAvailableWeeksForTransferAction
  );

  const { execute: transferItems, isPending: isTransferring } = useServerAction(
    transferGroceryItemsAction,
    {
      onSuccess: ({ data }) => {
        toast.success(
          `${data.transferredCount} item${data.transferredCount === 1 ? "" : "s"} transferred successfully`
        );
        onOpenChange(false);
        setTargetWeekId("");
        onSuccess?.();
      },
      onError: ({ err }) => {
        toast.error(err.message || "Failed to transfer items");
      },
    }
  );

  // Fetch available weeks when dialog opens
  useEffect(() => {
    if (open) {
      fetchWeeks({ excludeWeekId: sourceWeekId });
    }
  }, [open, sourceWeekId, fetchWeeks]);

  const handleTransfer = () => {
    if (!targetWeekId) {
      toast.error("Please select a destination week");
      return;
    }

    // Map items to ensure order is a number (default to 0 if null)
    const itemsWithOrder = items.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category || undefined,
      order: item.order ?? 0,
    }));

    transferItems({
      sourceWeekId,
      targetWeekId,
      items: itemsWithOrder,
    });
  };

  const weeks = weeksData?.weeks || [];
  const groupedItems = groupItemsByCategory(items);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Transfer Grocery Items</DialogTitle>
          <DialogDescription>
            Select a week to transfer {items.length} item{items.length === 1 ? "" : "s"} to
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Week Selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="target-week">
              Destination Week
            </label>
            {isLoadingWeeks ? (
              <div className="flex items-center justify-center py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <Select
                value={targetWeekId}
                onValueChange={setTargetWeekId}
                disabled={isTransferring}
              >
                <SelectTrigger id="target-week">
                  <SelectValue placeholder="Select destination week" />
                </SelectTrigger>
                <SelectContent>
                  {weeks.length === 0 ? (
                    <div className="p-2 text-sm text-muted-foreground">
                      No other weeks available
                    </div>
                  ) : (
                    weeks.map((week) => (
                      <SelectItem key={week.id} value={week.id}>
                        <div className="flex items-center gap-2">
                          <span>{formatWeekDisplay(week)}</span>
                          <Badge
                            variant={week.status === 'current' ? 'default' : 'secondary'}
                            className="ml-auto text-xs"
                          >
                            {week.status === 'current' ? 'Current' : 'Upcoming'}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Items Preview */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Items to transfer:</label>
            <div className="max-h-48 overflow-y-auto rounded-md border p-3 space-y-3">
              {groupedItems.map((category) => (
                <div key={category.name}>
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    {category.name}
                  </p>
                  <ul className="text-sm space-y-0.5">
                    {category.items.map((item) => (
                      <li key={item.id} className="pl-2">
                        • {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isTransferring}
          >
            Cancel
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!targetWeekId || isTransferring || weeks.length === 0}
          >
            {isTransferring ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Transferring...
              </>
            ) : (
              "Transfer Items"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
