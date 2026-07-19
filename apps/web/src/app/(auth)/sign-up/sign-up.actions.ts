"use server";

import { createServerAction, ZSAError } from "zsa"
import { signUpSchema } from "@/schemas/signup.schema";
import { createAndStoreSession } from "@/utils/auth";
import { withRateLimit, RATE_LIMITS } from "@/utils/with-rate-limit";
import {
  AccountProvisioningError,
  createPasswordAccountWithPersonalTeam,
} from "@/lib/account-provisioning";

export const signUpAction = createServerAction()
  .input(signUpSchema)
  .handler(async ({ input }) => {
    return withRateLimit(
      async () => {
        try {
          const { user, team } = await createPasswordAccountWithPersonalTeam({ input });
          await createAndStoreSession(user.id, "password");
          return { success: true, activeTeamId: team.id };
        } catch (error) {
          if (error instanceof AccountProvisioningError) {
            throw new ZSAError(
              error.code === "EMAIL_TAKEN" ? "CONFLICT" : "INTERNAL_SERVER_ERROR",
              error.message,
            );
          }
          if (error instanceof ZSAError) throw error;

          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "Failed to create session after signup"
          );
        }
      },
      RATE_LIMITS.SIGN_UP
    );
  })
