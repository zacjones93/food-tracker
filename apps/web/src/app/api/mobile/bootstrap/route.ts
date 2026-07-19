import { mobileAPIErrorResponse, requireMobileSession } from "@/lib/mobile-auth";
import { getMobileWorkspace } from "@/lib/mobile-workspace";

export async function GET() {
  try {
    const { permissions, teamId } = await requireMobileSession();
    const workspace = await getMobileWorkspace({ permissions, teamId });
    return Response.json(workspace, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
