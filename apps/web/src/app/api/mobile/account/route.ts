import {
  AccountDeletionAuthenticationError,
  AccountDeletionBlockedError,
  deleteAccount,
  getAccountDeletionPreview,
} from "@/lib/account-deletion";
import {
  accountDeletionRequestSchema,
  getOwnershipTransferMessage,
} from "@/lib/account-deletion-contract";
import {
  assertMobileMutationOrigin,
  MobileAPIError,
  mobileAPIErrorResponse,
} from "@/lib/mobile-auth";
import {
  deleteSessionTokenCookie,
  getSessionFromCookie,
} from "@/utils/auth";
import { RATE_LIMITS, withRateLimit } from "@/utils/with-rate-limit";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  try {
    const session = await getSessionFromCookie();
    if (!session) throw new MobileAPIError(401, "Authentication required");

    const preview = await getAccountDeletionPreview({ userId: session.user.id });
    return Response.json(preview, { headers: noStoreHeaders });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const session = await getSessionFromCookie();
    if (!session) throw new MobileAPIError(401, "Authentication required");
    const input = accountDeletionRequestSchema.parse(await request.json());

    const result = await withRateLimit(
      () => deleteAccount({ input, userId: session.user.id }),
      { ...RATE_LIMITS.ACCOUNT_DELETION, userIdentifier: session.user.id },
    );
    await deleteSessionTokenCookie();

    return Response.json(result, { headers: noStoreHeaders });
  } catch (error) {
    if (error instanceof AccountDeletionAuthenticationError) {
      return mobileAPIErrorResponse(new MobileAPIError(403, error.message));
    }
    if (error instanceof AccountDeletionBlockedError) {
      return mobileAPIErrorResponse(
        new MobileAPIError(409, getOwnershipTransferMessage(error.preview)),
      );
    }
    return mobileAPIErrorResponse(error);
  }
}
