"use client";

import { useServerAction } from "zsa-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { approveDialConnectionAction } from "./connect.actions";

export function ConnectApproval({ intent }: { intent: string }) {
  const { execute, isPending } = useServerAction(approveDialConnectionAction, {
    onError: ({ err }) => toast.error(err.message),
    onSuccess: ({ data }) => window.location.assign(data.returnUrl),
  });

  return (
    <Button className="w-full" disabled={isPending} onClick={() => execute({ intent })}>
      {isPending ? "Approving…" : "Approve and return to Dial"}
    </Button>
  );
}
