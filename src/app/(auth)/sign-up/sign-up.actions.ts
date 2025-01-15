"use server";

import { createServerAction, ZSAError } from "zsa"
import { getDB } from "@/db"
import { userTable } from "@/db/schema"
import { signUpSchema } from "@/schemas/signup.schema";
import { hashPassword } from "@/utils/passwordHasher";
import { createSession, generateSessionToken, setSessionTokenCookie } from "@/utils/auth";
import { eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getVerificationTokenKey } from "@/utils/auth-utils";
import { sendVerificationEmail } from "@/utils/email";
import ms from "ms";

export const signUpAction = createServerAction()
  .input(signUpSchema)
  .handler(async ({ input }) => {
    const db = await getDB();
    const { env } = await getCloudflareContext();

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
      // Create a session
      const sessionToken = generateSessionToken();
      const session = await createSession(sessionToken, user.id);

      // Set the session cookie
      await setSessionTokenCookie({
        token: sessionToken,
        userId: user.id,
        expiresAt: new Date(session.expiresAt)
      });

      // Generate verification token
      const verificationToken = createId();
      const expiresAt = new Date(Date.now() + ms("24h"));

      // Save verification token in KV with expiration
      await env.NEXT_CACHE_WORKERS_KV.put(
        getVerificationTokenKey(verificationToken),
        JSON.stringify({
          userId: user.id,
          expiresAt: expiresAt.toISOString(),
        }),
        {
          expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        }
      );

      // Send verification email
      await sendVerificationEmail({
        email: user.email,
        verificationToken,
        username: user.firstName || user.email,
      });
    } catch (error) {
      console.error(error)

      throw new ZSAError(
        "INTERNAL_SERVER_ERROR",
        "Failed to create session after signup"
      );
    }

    return { success: true };
  })
