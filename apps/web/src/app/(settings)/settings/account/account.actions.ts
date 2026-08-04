"use server";

import {
  AccountDeletionAuthenticationError,
  AccountDeletionBlockedError,
  deleteAccount,
} from "@/lib/account-deletion";
import {
  accountDeletionRequestSchema,
  getOwnershipTransferMessage,
} from "@/lib/account-deletion-contract";
import {
  deleteSessionTokenCookie,
  getSessionFromCookie,
} from "@/utils/auth";
import { RATE_LIMITS, withRateLimit } from "@/utils/with-rate-limit";
import { createServerAction, ZSAError } from "zsa";

export const deleteAccountAction = createServerAction()
  .input(accountDeletionRequestSchema)
  .handler(async ({ input }) => {
    const session = await getSessionFromCookie();
    if (!session) throw new ZSAError("NOT_AUTHORIZED", "You must be logged in");

    try {
      const result = await withRateLimit(
        () => deleteAccount({ input, userId: session.user.id }),
        { ...RATE_LIMITS.ACCOUNT_DELETION, userIdentifier: session.user.id },
      );
      await deleteSessionTokenCookie();
      return result;
    } catch (error) {
      if (error instanceof AccountDeletionAuthenticationError) {
        throw new ZSAError("FORBIDDEN", error.message);
      }
      if (error instanceof AccountDeletionBlockedError) {
        throw new ZSAError("CONFLICT", getOwnershipTransferMessage(error.preview));
      }
      throw error;
    }
  });
