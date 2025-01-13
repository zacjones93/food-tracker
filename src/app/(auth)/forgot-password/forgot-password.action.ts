"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { sendPasswordResetEmail } from "@/utils/email";
import { init } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getResetTokenKey } from "@/utils/auth-utils";
import ms from "ms";

const createId = init({
  length: 32,
});

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export const forgotPasswordAction = createServerAction()
  .input(forgotPasswordSchema)
  .handler(async ({ input }) => {
    const db = await getDB();
    const { env } = await getCloudflareContext();

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
          expirationTtl: Math.floor(expiresAt.getTime() / 1000),
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
      if (error instanceof ZSAError) {
        throw error;
      }

      throw new ZSAError(
        "INTERNAL_SERVER_ERROR",
        "An unexpected error occurred"
      );
    }
  });
