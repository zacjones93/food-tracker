import { getDB } from "@/db";
import { notificationPushDevicesTable } from "@/db/schema";
import {
  assertMobileMutationOrigin,
  mobileAPIErrorResponse,
  requireMobileSession,
} from "@/lib/mobile-auth";
import {
  pushDeviceRegistrationSchema,
  pushDeviceUnregistrationSchema,
} from "@/lib/push-device-contract";
import { and, eq } from "drizzle-orm";

export async function PUT(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const context = await requireMobileSession();
    const registration = pushDeviceRegistrationSchema.parse(await request.json());
    const now = new Date();
    const db = getDB();

    await db
      .insert(notificationPushDevicesTable)
      .values({
        bundleId: registration.bundleId,
        disabledAt: null,
        enabled: true,
        environment: registration.environment,
        installationId: registration.installationId,
        lastSeenAt: now,
        platform: "ios",
        token: registration.token,
        userId: context.userId,
      })
      .onConflictDoUpdate({
        target: [
          notificationPushDevicesTable.bundleId,
          notificationPushDevicesTable.environment,
          notificationPushDevicesTable.installationId,
        ],
        set: {
          disabledAt: null,
          enabled: true,
          lastSeenAt: now,
          token: registration.token,
          updatedAt: now,
          userId: context.userId,
        },
      });

    return Response.json(
      { registered: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    assertMobileMutationOrigin(request);
    const context = await requireMobileSession();
    const registration = pushDeviceUnregistrationSchema.parse(await request.json());
    const now = new Date();

    await getDB()
      .update(notificationPushDevicesTable)
      .set({ disabledAt: now, enabled: false, updatedAt: now })
      .where(
        and(
          eq(notificationPushDevicesTable.userId, context.userId),
          eq(notificationPushDevicesTable.bundleId, registration.bundleId),
          eq(notificationPushDevicesTable.environment, registration.environment),
          eq(notificationPushDevicesTable.installationId, registration.installationId),
        ),
      );

    return Response.json(
      { registered: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return mobileAPIErrorResponse(error);
  }
}
