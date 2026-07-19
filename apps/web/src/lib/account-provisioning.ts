import "server-only";

import { getDB } from "@/db";
import {
  SYSTEM_ROLES_ENUM,
  teamMembershipTable,
  teamTable,
  userTable,
} from "@/db/schema";
import type { SignUpSchema } from "@/schemas/signup.schema";
import { hashPassword } from "@/utils/password-hasher";
import { eq, sql } from "drizzle-orm";
import slugify from "slugify";

export class AccountProvisioningError extends Error {
  constructor(
    public readonly code: "EMAIL_TAKEN" | "PROVISIONING_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "AccountProvisioningError";
  }
}

export async function createPasswordAccountWithPersonalTeam({
  input,
}: {
  input: SignUpSchema;
}) {
  const db = getDB();
  const existingUser = await db.query.userTable.findFirst({
    where: sql`lower(${userTable.email}) = ${input.email}`,
  });
  if (existingUser) {
    throw new AccountProvisioningError("EMAIL_TAKEN", "Email already taken");
  }

  let createdUserId: string | undefined;
  let createdTeamId: string | undefined;

  try {
    const passwordHash = await hashPassword({ password: input.password });
    const [user] = await db
      .insert(userTable)
      .values({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
      })
      .returning();
    if (!user) {
      throw new AccountProvisioningError("PROVISIONING_FAILED", "Failed to create user");
    }
    createdUserId = user.id;

    const teamName = `${input.firstName}'s Team`;
    const baseSlug = slugify(teamName, { lower: true, strict: true });
    let slug = baseSlug;
    let suffix = 0;
    while (await db.query.teamTable.findFirst({ where: eq(teamTable.slug, slug) })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const [team] = await db
      .insert(teamTable)
      .values({
        name: teamName,
        slug,
        description: `${input.firstName}'s personal food tracker`,
      })
      .returning();
    if (!team) {
      throw new AccountProvisioningError("PROVISIONING_FAILED", "Failed to create team");
    }
    createdTeamId = team.id;

    await db.insert(teamMembershipTable).values({
      teamId: team.id,
      userId: user.id,
      roleId: SYSTEM_ROLES_ENUM.OWNER,
      isSystemRole: 1,
      joinedAt: new Date(),
      isActive: 1,
    });

    const [updatedUser] = await db
      .update(userTable)
      .set({ defaultTeamId: team.id })
      .where(eq(userTable.id, user.id))
      .returning();
    if (!updatedUser) {
      throw new AccountProvisioningError(
        "PROVISIONING_FAILED",
        "Failed to select the new team",
      );
    }

    return { user: updatedUser, team };
  } catch (error) {
    try {
      if (createdTeamId) {
        await db.delete(teamTable).where(eq(teamTable.id, createdTeamId));
      }
      if (createdUserId) {
        await db.delete(userTable).where(eq(userTable.id, createdUserId));
      }
    } catch (cleanupError) {
      console.error("Failed to clean up partial account provisioning", cleanupError);
    }

    if (error instanceof AccountProvisioningError) throw error;
    throw new AccountProvisioningError(
      "PROVISIONING_FAILED",
      "Failed to provision the account team",
    );
  }
}
