import { mobileAPIErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { mobileChangesQuerySchema } from "@/lib/mobile-sync-contract";
import { getMobileChanges } from "@/lib/mobile-sync";

export async function GET(request: Request) {
  try {
    const { permissions, teamId } = await requireMobileSession();
    const url = new URL(request.url);
    const query = mobileChangesQuerySchema.parse({
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const result = await getMobileChanges({ ...query, permissions, teamId });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
