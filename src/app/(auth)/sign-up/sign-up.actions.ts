"use server";

import { createServerAction, ZSAError } from "zsa"
import { getDB } from "@/db"
import { userTable } from "@/db/schema"
import { signUpSchema } from "@/schemas/signup.schema";
import { hashPassword } from "@/utils/password-hasher";
import { createAndStoreSession } from "@/utils/auth";
import { eq } from "drizzle-orm";
import { withRateLimit, RATE_LIMITS } from "@/utils/with-rate-limit";

export const signUpAction = createServerAction()
  .input(signUpSchema)
  .handler(async ({ input }) => {
    return withRateLimit(
      async () => {
        const db = getDB();

        // Check if email is already taken
        const existingUser = await db.query.userTable.findFirst({
          where: eq(userTable.email, input.email),
        });

        if (existingUser) {
          throw new ZSAError(
            "CONFLICT",
            "Email already taken"
          );
        }

        // Hash the password
        const hashedPassword = await hashPassword({ password: input.password });

        // Create the user
        const [user] = await db.insert(userTable)
          .values({
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash: hashedPassword,
          })
          .returning();

        if (!user || !user.email) {
          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "Failed to create user"
          );
        }

        try {
          // Create session immediately (no email verification)
          await createAndStoreSession(user.id, "password");
        } catch (error) {
          console.error(error)

          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "Failed to create session after signup"
          );
        }

        return { success: true };
      },
      RATE_LIMITS.SIGN_UP
    );
  })
