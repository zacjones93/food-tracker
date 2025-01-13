"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useServerAction } from "zsa-react";
import { deleteSessionAction } from "./sessions.actions";
import { KVSession } from "@/utils/kv-session";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { UAParser } from 'ua-parser-js'
import { toast } from "sonner";
import React from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface SessionWithMeta extends KVSession {
  isCurrentSession: boolean;
  expiration?: Date;
  createdAt: number;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

export function SessionsClient({ sessions }: { sessions: SessionWithMeta[] }) {
  const router = useRouter();
  const dialogCloseRef = React.useRef<HTMLButtonElement>(null);
  const { execute: deleteSession } = useServerAction(deleteSessionAction, {
    onSuccess: () => {
      toast.success("Session deleted");
      dialogCloseRef.current?.click();
      router.refresh();
    }
  });

  return (
    <div className="space-y-4">
      {sessions.map((session) => {
        const parser = new UAParser(session.userAgent ?? '');
        const browser = parser.getBrowser();
        const device = parser.getDevice();
        const os = parser.getOS();

        return (
          <Card key={session.id} className={cn(!session.isCurrentSession ? "bg-card/40" : "border-3 border-primary/20 shadow-lg bg-secondary/30")}>
            <CardHeader>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                      {session.city && session.country
                        ? `${session.city}, ${regionNames.of(session.country)}`
                        : session.country || "Unknown location"}
                      {session.isCurrentSession && <Badge>Current Session</Badge>}
                    </CardTitle>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      · {formatDistanceToNow(session.createdAt)} ago
                    </div>
                  </div>
                  <CardDescription className="text-sm">
                    {browser.name} {browser.major} on {device.vendor} {device.model} {device.type} ({os.name} {os.version})
                  </CardDescription>
                </div>
                <div>
                  {!session?.isCurrentSession && (
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="destructive" className="w-full sm:w-auto">Delete session</Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Delete session?</DialogTitle>
                          <DialogDescription>
                            This will sign out this device. This action cannot be undone.
                          </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="mt-6 sm:mt-0">
                          <DialogClose ref={dialogCloseRef} asChild>
                            <Button variant="outline">Cancel</Button>
                          </DialogClose>
                          <Button
                            variant="destructive"
                            className="mb-4 sm:mb-0"
                            onClick={() => deleteSession({ sessionId: session.id })}
                          >
                            Delete session
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </CardHeader>
          </Card>
        )
      })}
    </div>
  );
}
