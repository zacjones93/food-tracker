import { processAppleServerNotification } from "@/lib/billing/apple-sync";
import {
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library";
import { z } from "zod";

const MAX_NOTIFICATION_BYTES = 256_000;
const notificationSchema = z.object({
  signedPayload: z.string().min(1).max(240_000),
});

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_NOTIFICATION_BYTES) {
    return Response.json({ error: "Notification is too large" }, { status: 413 });
  }

  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_NOTIFICATION_BYTES) {
      return Response.json({ error: "Notification is too large" }, { status: 413 });
    }
    const { signedPayload } = notificationSchema.parse(JSON.parse(rawBody));
    const outcome = await processAppleServerNotification({ signedPayload });
    return Response.json({ received: true, ...outcome });
  } catch (error) {
    console.error("App Store notification processing failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return Response.json({ error: "Invalid notification body" }, { status: 400 });
    }
    if (
      error instanceof VerificationException &&
      error.status !== VerificationStatus.RETRYABLE_VERIFICATION_FAILURE
    ) {
      return Response.json({ error: "Invalid notification signature" }, { status: 400 });
    }
    return Response.json({ error: "Notification processing failed" }, { status: 500 });
  }
}
