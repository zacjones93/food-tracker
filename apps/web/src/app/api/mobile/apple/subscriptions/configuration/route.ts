import { TEAM_PERMISSIONS } from "@/db/schema";
import { getOrCreateAppleSubscriptionBinding } from "@/lib/billing/apple-sync";
import { getAppleServerConfiguration } from "@/lib/billing/apple-store";
import {
  MobileAPIError,
  mobileAPIErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";

export async function GET() {
  try {
    const context = await requireMobileSession();
    if (!context.permissions.includes(TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS)) {
      throw new MobileAPIError(403, "Only a team owner or admin can manage subscriptions");
    }
    const configuration = getAppleServerConfiguration();
    const binding = await getOrCreateAppleSubscriptionBinding({ teamId: context.teamId });
    return Response.json({
      appAccountToken: binding.appAccountToken,
      productIds: configuration.productIds,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
