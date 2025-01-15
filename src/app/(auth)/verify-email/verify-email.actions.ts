"use server";

import { createServerAction, ZSAError } from "zsa";
import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getVerificationTokenKey } from "@/utils/auth-utils";
import { z } from "zod";

const verifyEmailSchema = z.object({
  token: z.string(),
});

export const verifyEmailAction = createServerAction()
  .input(verifyEmailSchema)
  .handler(async ({ input }) => {
    const db = await getDB();
    const { env } = await getCloudflareContext();

    try {
      // Find valid verification token
      const verificationTokenStr = await env.NEXT_CACHE_WORKERS_KV.get(getVerificationTokenKey(input.token));
      if (!verificationTokenStr) {
        throw new ZSAError(
          "NOT_FOUND",
          "Invalid or expired verification token"
        );
      }

      const verificationToken = JSON.parse(verificationTokenStr) as {
        userId: string;
        expiresAt: string;
      };

      // Check if token is expired (although KV should have auto-deleted it)
      if (new Date() > new Date(verificationToken.expiresAt)) {
        throw new ZSAError(
          "PRECONDITION_FAILED",
          "Verification token has expired"
        );
      }

      // Find user
      const user = await db.query.userTable.findFirst({
        where: eq(userTable.id, verificationToken.userId),
      });

      if (!user) {
        throw new ZSAError(
          "NOT_FOUND",
          "User not found"
        );
      }

      // Update user's email verification status
      await db.update(userTable)
        .set({ emailVerified: new Date() })
        .where(eq(userTable.id, verificationToken.userId));

      // Delete the used token
      await env.NEXT_CACHE_WORKERS_KV.delete(getVerificationTokenKey(input.token));

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
  })
