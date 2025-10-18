"use server";

import { createServerAction, ZSAError } from "zsa"
import { getDB } from "@/db"
import { userTable, teamTable, teamMembershipTable, SYSTEM_ROLES_ENUM } from "@/db/schema"
import { signUpSchema } from "@/schemas/signup.schema";
import { hashPassword } from "@/utils/password-hasher";
import { createAndStoreSession } from "@/utils/auth";
import { eq } from "drizzle-orm";
import { withRateLimit, RATE_LIMITS } from "@/utils/with-rate-limit";
import slugify from "slugify";

export const signUpAction = createServerAction()
  .input(signUpSchema)
  .handler(async ({ input }) => {
    return withRateLimit(
      async () => {
        const db = getDB();

        // Check if email is already taken
        const [existingUser] = await db
          .select()
          .from(userTable)
          .where(eq(userTable.email, input.email))
          .limit(1);

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

        // Create default team for the user
        const teamName = `${input.firstName || user.email}'s Team`;
        const baseSlug = slugify(teamName, { lower: true, strict: true });

        // Ensure slug is unique by appending timestamp if needed
        let slug = baseSlug;
        let slugCounter = 0;
        while (true) {
          const [existingTeam] = await db
            .select()
            .from(teamTable)
            .where(eq(teamTable.slug, slug))
            .limit(1);
          if (!existingTeam) break;
          slugCounter++;
          slug = `${baseSlug}-${slugCounter}`;
        }

        const [team] = await db.insert(teamTable)
          .values({
            name: teamName,
            slug,
            description: `${input.firstName || user.email}'s personal food tracker`,
          })
          .returning();

        if (!team) {
          throw new ZSAError(
            "INTERNAL_SERVER_ERROR",
            "Failed to create default team"
          );
        }

        // Add user as owner of the team
        await db.insert(teamMembershipTable)
          .values({
            teamId: team.id,
            userId: user.id,
            roleId: SYSTEM_ROLES_ENUM.OWNER,
            isSystemRole: 1,
            joinedAt: new Date(),
            isActive: 1,
          });

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
