"use client";

import { useState } from "react";
import Link from "next/link";
import { useServerAction } from "zsa-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCOUNT_DELETION_CONFIRMATION,
  type AccountDeletionPreview,
} from "@/lib/account-deletion-contract";

import { deleteAccountAction } from "./account.actions";

export function AccountDeletionForm({ preview }: { preview: AccountDeletionPreview }) {
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState<string>();
  const [password, setPassword] = useState("");
  const { execute, isPending } = useServerAction(deleteAccountAction, {
    onError: (error) => setErrorMessage(error.err?.message ?? "Account deletion failed"),
    onStart: () => setErrorMessage(undefined),
    onSuccess: () => window.location.assign("/sign-in?accountDeleted=1"),
  });
  const isConfirmed = confirmation === ACCOUNT_DELETION_CONFIRMATION && password.length >= 8;

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle>Delete account</CardTitle>
        <CardDescription>
          Permanently remove your List To Ladle account and personal data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3 text-sm">
          <p>
            This signs out every device, removes all push-notification tokens, and deletes
            your personal profile, assistant history, and offline sync records.
          </p>
          {preview.deletedTeams.length > 0 && (
            <ImpactList
              title="These kitchens and all their recipes, schedules, and billing will be deleted:"
              teams={preview.deletedTeams}
            />
          )}
          {preview.leftTeams.length > 0 && (
            <ImpactList
              title="These shared kitchens will remain for their other members:"
              teams={preview.leftTeams}
            />
          )}
        </div>

        {!preview.canDelete ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
            <p className="font-medium">Transfer ownership before deleting your account.</p>
            <p className="mt-1 text-muted-foreground">
              You are the only active owner of {preview.ownershipTransferRequired.map((team) => team.name).join(", ")}.
              Shared data will not be deleted or reassigned automatically.
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/settings/teams">Manage teams</Link>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                autoComplete="current-password"
                id="current-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-confirmation">
                Type {ACCOUNT_DELETION_CONFIRMATION} to confirm
              </Label>
              <Input
                autoCapitalize="characters"
                autoComplete="off"
                id="delete-confirmation"
                onChange={(event) => setConfirmation(event.target.value)}
                value={confirmation}
              />
            </div>
            {errorMessage && <p className="text-sm text-destructive" role="alert">{errorMessage}</p>}

            <Dialog>
              <DialogTrigger asChild>
                <Button disabled={!isConfirmed || isPending} variant="destructive">
                  Delete account
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Permanently delete your account?</DialogTitle>
                  <DialogDescription>
                    This cannot be undone. Any sole-member kitchen and its Stripe subscription will
                    be deleted immediately. Shared kitchen data will remain. App Store subscriptions
                    must be cancelled separately in Apple subscription settings.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button disabled={isPending} variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    disabled={isPending}
                    onClick={() => execute({
                      confirmation: ACCOUNT_DELETION_CONFIRMATION,
                      password,
                    })}
                    variant="destructive"
                  >
                    {isPending ? "Deleting…" : "Delete permanently"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ImpactList({
  teams,
  title,
}: {
  teams: AccountDeletionPreview["deletedTeams"];
  title: string;
}) {
  return (
    <div>
      <p className="font-medium">{title}</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
        {teams.map((team) => <li key={team.id}>{team.name}</li>)}
      </ul>
    </div>
  );
}
