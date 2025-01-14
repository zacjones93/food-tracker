"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { sendPasswordResetEmail } from "@/utils/email";
import { init } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getResetTokenKey } from "@/utils/auth-utils";
import ms from "ms";
import { turnstileEnabled } from "@/schemas/catcha.schema";
import { validateTurnstileToken } from "@/utils/validateCaptcha";
import { forgotPasswordSchema } from "@/schemas/forgot-password.schema";
import { getSessionFromCookie } from "@/utils/auth";

const createId = init({
  length: 32,
});

export const forgotPasswordAction = createServerAction()
  .input(forgotPasswordSchema)
  .handler(async ({ input }) => {
    if (turnstileEnabled && input.captchaToken) {
      const success = await validateTurnstileToken(input.captchaToken)

      if (!success) {
        throw new ZSAError(
          "INPUT_PARSE_ERROR",
          "Please complete the captcha"
        )
      }
    }

    const session = await getSessionFromCookie()

    if (session?.user && session?.user?.email !== input.email) {
      throw new ZSAError(
        "INPUT_PARSE_ERROR",
        "You cannot reset the password for another user"
      );
    }

    const db = await getDB();
    const { env } = await getCloudflareContext();

    // TODO: If we have a logged in user we need to check if the email is the same as the user's email
    // And also in the page we need to make the email field disabled

    try {
      // Find user by email
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.email, input.email.toLowerCase()),
      });

      // Even if user is not found, return success to prevent email enumeration
      if (!user) {
        return { success: true };
      }

      // Generate reset token
      const token = createId();
      const expiresAt = new Date(Date.now() + ms("1 hour"));

      // Save reset token in KV with expiration
      await env.NEXT_CACHE_WORKERS_KV.put(
        getResetTokenKey(token),
        JSON.stringify({
          userId: user.id,
          expiresAt: expiresAt.toISOString(),
        }),
        {
          expirationTtl: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
        }
      );

      // Send reset email
      if (user?.email) {
        await sendPasswordResetEmail({
          email: user.email,
          resetToken: token,
          username: user.firstName ?? user.email,
        });
      }

      return { success: true };
    } catch (error) {
      console.error(error)

      if (error instanceof ZSAError) {
        throw error;
      }

      throw new ZSAError(
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred"
      );
    }
  });
