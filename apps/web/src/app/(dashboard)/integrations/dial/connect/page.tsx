import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDB } from "@/db";
import { teamTable } from "@/db/schema";
import { getDialConnectionIntent } from "@/lib/dial-integration";
import { getSessionFromCookie } from "@/utils/auth";
import { ConnectApproval } from "./connect-approval";

export default async function DialConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ intent?: string }>;
}) {
  const { intent: intentToken } = await searchParams;
  if (!intentToken) redirect("/settings/integrations");

  const session = await getSessionFromCookie();
  if (!session) {
    redirect(`/sign-in?redirect=${encodeURIComponent(`/integrations/dial/connect?intent=${intentToken}`)}`);
  }

  const intent = await getDialConnectionIntent(intentToken);
  const isUsable = intent?.status === "pending" && intent.expiresAt > new Date();
  if (!intent || !isUsable) {
    return (
      <Card className="mx-auto mt-12 max-w-xl">
        <CardHeader>
          <CardTitle>Connection request unavailable</CardTitle>
          <CardDescription>This request is invalid, expired, or has already been used. Start again from Dial Your Espresso.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const team = session.activeTeamId
    ? await getDB().query.teamTable.findFirst({ where: eq(teamTable.id, session.activeTeamId) })
    : null;

  return (
    <Card className="mx-auto mt-12 max-w-xl">
      <CardHeader>
        <div className="mb-2 flex items-center gap-2">
          <Badge>Coffee integration</Badge>
          <Badge variant="outline">Expires in 10 minutes</Badge>
        </div>
        <CardTitle>Connect Dial Your Espresso</CardTitle>
        <CardDescription>
          Review exactly what Dial is asking to connect. Approval is tied to your signed-in account and active Listo team.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-3 text-sm">
          {intent.requestedScopes.includes("account") && (
            <div>
              <dt className="font-medium">Individual account link</dt>
              <dd className="text-muted-foreground">{intent.dialUserLabel ?? "Dial account"} → {session.user.email}</dd>
            </div>
          )}
          {intent.requestedScopes.includes("team") && (
            <div>
              <dt className="font-medium">Private recipe team pairing</dt>
              <dd className="text-muted-foreground">{intent.dialTeamLabel ?? "Dial team"} → {team?.name ?? "No active Listo team"}</dd>
            </div>
          )}
          {intent.emailHint && (
            <div>
              <dt className="font-medium">Suggested email</dt>
              <dd className="text-muted-foreground">{intent.emailHint}</dd>
            </div>
          )}
        </dl>
        <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          An email match is only a discovery hint. It never authorizes this connection. Listo remains the owner and editor of every recipe.
        </p>
        {intent.requestedScopes.includes("team") && !team ? (
          <p className="text-sm text-destructive">Select an active Listo team before approving this request.</p>
        ) : (
          <ConnectApproval intent={intentToken} />
        )}
      </CardContent>
    </Card>
  );
}
