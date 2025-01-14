"use server";

import { createServerAction, ZSAError } from "zsa"
import { getDB } from "@/db"
import { userTable } from "@/db/schema"
import { signUpSchema } from "@/schemas/signup.schema";
import { hashPassword } from "@/utils/passwordHasher";
import { createSession, generateSessionToken, setSessionTokenCookie } from "@/utils/auth";
import { eq } from "drizzle-orm";

export const signUpAction = createServerAction()
  .input(signUpSchema)
  .handler(async ({ input }) => {
    const db = await getDB();

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
    } catch (error) {
      console.error(error)

      throw new ZSAError(
        "INTERNAL_SERVER_ERROR",
        "Failed to create session after signup"
      );
    }

    return { success: true };
  })
