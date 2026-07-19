import {
  AccountProvisioningError,
  createPasswordAccountWithPersonalTeam,
} from "@/lib/account-provisioning";
import {
  assertMobileMutationOrigin,
  MobileAPIError,
  mobileAPIErrorResponse,
} from "@/lib/mobile-auth";
import { signUpSchema } from "@/schemas/signup.schema";
import { createAndStoreSession } from "@/utils/auth";
import { RATE_LIMITS, withRateLimit } from "@/utils/with-rate-limit";

export async function POST(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const input = signUpSchema.parse(await request.json());

    await withRateLimit(async () => {
      try {
        const { user, team } = await createPasswordAccountWithPersonalTeam({ input });
        const session = await createAndStoreSession(user.id, "password");
        if (session.activeTeamId !== team.id) {
          throw new MobileAPIError(500, "Failed to activate the new team");
        }
      } catch (error) {
        if (error instanceof AccountProvisioningError) {
          throw new MobileAPIError(
            error.code === "EMAIL_TAKEN" ? 409 : 500,
            error.message,
          );
        }
        throw error;
      }
    }, RATE_LIMITS.SIGN_UP);

    return Response.json({ success: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
