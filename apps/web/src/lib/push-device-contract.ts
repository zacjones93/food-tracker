import { z } from "zod";

export const IOS_PUSH_BUNDLE_ID = "com.wodsmith.listtoladle";

const hexadecimalDeviceToken = z
  .string()
  .min(2)
  .max(1_024)
  .regex(/^(?:[0-9a-f]{2})+$/i, "Expected an even-length hexadecimal APNs token")
  .transform((value) => value.toLowerCase());

export const pushDeviceRegistrationSchema = z.object({
  bundleId: z.literal(IOS_PUSH_BUNDLE_ID),
  environment: z.enum(["sandbox", "production"]),
  installationId: z.string().uuid(),
  token: hexadecimalDeviceToken,
});

export const pushDeviceUnregistrationSchema = pushDeviceRegistrationSchema.omit({ token: true });

export type PushDeviceRegistration = z.infer<typeof pushDeviceRegistrationSchema>;
