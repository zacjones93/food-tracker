import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  IOS_PUSH_BUNDLE_ID,
  pushDeviceRegistrationSchema,
  pushDeviceUnregistrationSchema,
} from "./push-device-contract";

describe("pushDeviceRegistrationSchema", () => {
  it("normalizes an app-scoped APNs token", () => {
    assert.deepEqual(
      pushDeviceRegistrationSchema.parse({
        bundleId: IOS_PUSH_BUNDLE_ID,
        environment: "sandbox",
        installationId: "7f415b26-85aa-4a7a-9cd5-c15b761d9d1e",
        token: "AB".repeat(32),
      }),
      {
        bundleId: IOS_PUSH_BUNDLE_ID,
        environment: "sandbox",
        installationId: "7f415b26-85aa-4a7a-9cd5-c15b761d9d1e",
        token: "ab".repeat(32),
      },
    );
  });

  it("rejects malformed tokens and tokens for another app", () => {
    assert.equal(
      pushDeviceRegistrationSchema.safeParse({
        bundleId: IOS_PUSH_BUNDLE_ID,
        environment: "production",
        installationId: "7f415b26-85aa-4a7a-9cd5-c15b761d9d1e",
        token: "not-a-token",
      }).success,
      false,
    );
    assert.equal(
      pushDeviceRegistrationSchema.safeParse({
        bundleId: "com.example.other",
        environment: "sandbox",
        installationId: "7f415b26-85aa-4a7a-9cd5-c15b761d9d1e",
        token: "ab".repeat(32),
      }).success,
      false,
    );
  });

  it("allows sign-out suppression without persisting an APNs token", () => {
    assert.deepEqual(
      pushDeviceUnregistrationSchema.parse({
        bundleId: IOS_PUSH_BUNDLE_ID,
        environment: "sandbox",
        installationId: "7f415b26-85aa-4a7a-9cd5-c15b761d9d1e",
      }),
      {
        bundleId: IOS_PUSH_BUNDLE_ID,
        environment: "sandbox",
        installationId: "7f415b26-85aa-4a7a-9cd5-c15b761d9d1e",
      },
    );
  });
});
