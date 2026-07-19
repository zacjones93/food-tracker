import { getDB } from "@/db";
import { userTable } from "@/db/schema";
import {
  assertMobileMutationOrigin,
  MobileAPIError,
  mobileAPIErrorResponse,
} from "@/lib/mobile-auth";
import { signInSchema } from "@/schemas/signin.schema";
import {
  createAndStoreSession,
  deleteSessionTokenCookie,
  invalidateSession,
} from "@/utils/auth";
import { verifyPassword } from "@/utils/password-hasher";
import { RATE_LIMITS, withRateLimit } from "@/utils/with-rate-limit";
import { sql } from "drizzle-orm";

export async function POST(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const input = signInSchema.parse(await request.json());

    await withRateLimit(async () => {
      const db = getDB();
      const user = await db.query.userTable.findFirst({
        where: sql`lower(${userTable.email}) = ${input.email}`,
      });
      if (!user) throw new MobileAPIError(401, "Invalid email or password");

      const isValid = await verifyPassword({
        storedHash: user.passwordHash,
        passwordAttempt: input.password,
      });
      if (!isValid) throw new MobileAPIError(401, "Invalid email or password");

      const session = await createAndStoreSession(user.id, "password");
      if (!session.activeTeamId) {
        await invalidateSession(session.id, session.userId);
        await deleteSessionTokenCookie();
        throw new MobileAPIError(403, "No active team membership is available");
      }
    }, RATE_LIMITS.SIGN_IN);

    return Response.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
