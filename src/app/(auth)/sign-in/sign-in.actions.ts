"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { signInSchema } from "@/schemas/signin.schema";
import { verifyPassword } from "@/utils/passwordHasher";
import { createSession, generateSessionToken, setSessionTokenCookie } from "@/utils/auth";
import { eq } from "drizzle-orm";

export const signInAction = createServerAction()
  .input(signInSchema)
  .handler(async ({ input }) => {
    const db = await getDB();

    try {
      // Find user by email
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.email, input.email),
      });

      if (!user || !user.passwordHash) {
        throw new ZSAError(
          "NOT_AUTHORIZED",
          "Invalid email or password"
        );
      }

      // Verify password
      const isValid = await verifyPassword({
        storedHash: user.passwordHash,
        passwordAttempt: input.password
      });

      if (!isValid) {
        throw new ZSAError(
          "NOT_AUTHORIZED",
          "Invalid email or password"
        );
      }

      // Create session
      const sessionToken = generateSessionToken();
      const session = await createSession(sessionToken, user.id);
      await setSessionTokenCookie({
        token: sessionToken,
        userId: user.id,
        expiresAt: new Date(session.expiresAt)
      });

      return { success: true };
    } catch (error) {
      if (error instanceof ZSAError) {
        throw error;
      }

      throw new ZSAError(
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred"
      );
    }
  });
