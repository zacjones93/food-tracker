"use client";

import { useServerAction } from "zsa-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { disconnectDialAction } from "./integrations.actions";

export function DisconnectButton({ layer }: { layer: "account" | "team" }) {
  const { execute, isPending } = useServerAction(disconnectDialAction, {
    onError: ({ err }) => toast.error(err.message),
    onSuccess: () => toast.success(layer === "account" ? "Dial account disconnected" : "Dial team disconnected"),
  });
  return (
    <Button variant="outline" disabled={isPending} onClick={() => execute({ layer })}>
      {isPending ? "Disconnecting…" : "Disconnect"}
    </Button>
  );
}
