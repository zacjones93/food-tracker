"use client";

import { useServerAction } from "zsa-react";
import { updateWeekAction } from "../../weeks.actions";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface WeekStatusSelectorProps {
  weekId: string;
  currentStatus: 'current' | 'upcoming' | 'archived';
}

const statusLabels = {
  current: 'Current',
  upcoming: 'Upcoming',
  archived: 'Archived',
} as const;

export function WeekStatusSelector({ weekId, currentStatus }: WeekStatusSelectorProps) {
  const { execute: updateWeek, isPending } = useServerAction(updateWeekAction, {
    onSuccess: () => {
      toast.success("Week status updated");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update week status");
    },
  });

  const handleStatusChange = async (status: 'current' | 'upcoming' | 'archived') => {
    await updateWeek({ id: weekId, status });
  };

  return (
    <Select
      value={currentStatus}
      onValueChange={handleStatusChange}
      disabled={isPending}
    >
      <SelectTrigger className="w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="current">{statusLabels.current}</SelectItem>
        <SelectItem value="upcoming">{statusLabels.upcoming}</SelectItem>
        <SelectItem value="archived">{statusLabels.archived}</SelectItem>
      </SelectContent>
    </Select>
  );
}
