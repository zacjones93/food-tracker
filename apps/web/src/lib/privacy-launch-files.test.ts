import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const privacyManifestURL = new URL(
  "../../../mobile/FoodTracker/Resources/PrivacyInfo.xcprivacy",
  import.meta.url,
);
const privacyPageURL = new URL("../app/(legal)/privacy/page.tsx", import.meta.url);
const termsPageURL = new URL("../app/(legal)/terms/page.tsx", import.meta.url);
const supportPageURL = new URL("../app/(legal)/support/page.tsx", import.meta.url);
const rootLayoutURL = new URL("../app/layout.tsx", import.meta.url);
const footerURL = new URL("../components/footer.tsx", import.meta.url);
const legalConfigURL = new URL("./legal-config.ts", import.meta.url);

test("iOS privacy manifest declares the audited required reason and data types", async () => {
  const manifest = await readFile(privacyManifestURL, "utf8");
  const expectedDataTypes = [
    "Name",
    "EmailAddress",
    "CoarseLocation",
    "PaymentInfo",
    "CustomerSupport",
    "OtherUserContent",
    "UserID",
    "DeviceID",
    "PurchaseHistory",
    "ProductInteraction",
  ];

  assert.match(manifest, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(manifest, /<string>CA92\.1<\/string>/);
  assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  for (const dataType of expectedDataTypes) {
    assert.match(manifest, new RegExp(`NSPrivacyCollectedDataType${dataType}`));
  }
});

test("public legal and support sources contain no template contact or author metadata", async () => {
  const sources = await Promise.all([
    readFile(privacyPageURL, "utf8"),
    readFile(termsPageURL, "utf8"),
    readFile(supportPageURL, "utf8"),
    readFile(rootLayoutURL, "utf8"),
    readFile(footerURL, "utf8"),
    readFile(legalConfigURL, "utf8"),
  ]);
  const combined = sources.join("\n");

  assert.doesNotMatch(combined, /privacy@example\.com/i);
  assert.doesNotMatch(combined, /LubomirGeorg/i);
  assert.match(combined, /SUPPORT_CONTACT_EMAIL/);
  assert.match(combined, /PRIVACY_CONTACT_EMAIL/);
});
