import { TEAM_PERMISSIONS } from "@/db/schema";
import { synchronizeAppleTransactionForTeam } from "@/lib/billing/apple-sync";
import {
  assertMobileMutationOrigin,
  MobileAPIError,
  mobileAPIErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";
import { z } from "zod";

const requestSchema = z.object({
  signedTransaction: z.string().min(1).max(200_000),
});

export async function POST(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const context = await requireMobileSession();
    if (!context.permissions.includes(TEAM_PERMISSIONS.EDIT_TEAM_SETTINGS)) {
      throw new MobileAPIError(403, "Only a team owner or admin can manage subscriptions");
    }
    const input = requestSchema.parse(await request.json());
    const outcome = await synchronizeAppleTransactionForTeam({
      signedTransaction: input.signedTransaction,
      teamId: context.teamId,
    });
    return Response.json(outcome, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
