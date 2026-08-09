import { redirect } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getDialConnectionStatus } from "@/lib/dial-integration";
import { getSessionFromCookie } from "@/utils/auth";
import { DisconnectButton } from "./disconnect-button";
import { DialBrand } from "@/components/dial-brand";

export default async function IntegrationsSettingsPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/sign-in");
  const status = await getDialConnectionStatus({
    teamId: session.activeTeamId,
    userId: session.user.id,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-mystic-900 dark:text-cream-100">Integrations</h1>
        <p className="text-mystic-700 dark:text-cream-200">Manage how List To Ladle works with Dial Your Espresso.</p>
      </div>
      <Card>
        <CardHeader>
          <DialBrand detail="Coffee recipe destination" size="standard" />
          <CardTitle className="sr-only">Dial Your Espresso</CardTitle>
          <CardDescription>
            Coffee drinks are automatically available according to their existing Listo visibility. Public and unlisted drinks do not require a team pairing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="divide-y border-y">
            <ConnectionRow
              description="Enables permission-sensitive actions such as Edit in List To Ladle."
              label="Individual account"
              status={status.account}
              layer="account"
            />
            <ConnectionRow
              description="Allows private coffee drinks from the active Listo team to reach its paired Dial team."
              label="Active team"
              status={status.team}
              layer="team"
            />
          </div>
          <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
            Connections are initiated in Dial and approved here through a short-lived, single-use request. Matching email addresses are never treated as authorization.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function ConnectionRow({
  description,
  label,
  layer,
  status,
}: {
  description: string;
  label: string;
  layer: "account" | "team";
  status: { connected: boolean; label?: string };
}) {
  return (
    <div className="flex flex-col justify-between gap-3 py-4 sm:flex-row sm:items-center">
      <div>
        <div className="mb-1 flex items-center gap-2">
          <p className="font-medium">{label}</p>
          <Badge variant={status.connected ? "default" : "outline"}>{status.connected ? "Connected" : "Not connected"}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{status.label ?? description}</p>
      </div>
      {status.connected && <DisconnectButton layer={layer} />}
    </div>
  );
}
