import assert from "node:assert/strict";
import test from "node:test";

import {
  getEmailHref,
  getLegalConfig,
  LEGAL_CONFIG_KEYS,
} from "./legal-config";

test("legal configuration exposes explicit missing-value markers", () => {
  const config = getLegalConfig({});

  assert.deepEqual(config.missingKeys.sort(), Object.values(LEGAL_CONFIG_KEYS).sort());
  assert.equal(config.operatorName, "[NOT CONFIGURED: LEGAL_ENTITY_NAME]");
  assert.equal(config.privacyEmail, "[NOT CONFIGURED: PRIVACY_CONTACT_EMAIL]");
  assert.equal(getEmailHref(config.privacyEmail), null);
});

test("legal configuration trims configured launch values", () => {
  const config = getLegalConfig({
    LEGAL_ENTITY_NAME: "  Example Operator LLC ",
    LEGAL_BUSINESS_ADDRESS: "  User-supplied address ",
    LEGAL_GOVERNING_LAW: "  User-supplied jurisdiction ",
    PRIVACY_CONTACT_EMAIL: " privacy@listtoladle.test ",
    SUPPORT_CONTACT_EMAIL: " support@listtoladle.test ",
  });

  assert.deepEqual(config.missingKeys, []);
  assert.equal(config.operatorName, "Example Operator LLC");
  assert.equal(config.businessAddress, "User-supplied address");
  assert.equal(config.governingLaw, "User-supplied jurisdiction");
  assert.equal(getEmailHref(config.privacyEmail), "mailto:privacy@listtoladle.test");
});

test("email links reject non-email configuration values", () => {
  assert.equal(getEmailHref("not configured"), null);
  assert.equal(getEmailHref("support@listtoladle.com"), "mailto:support@listtoladle.com");
});
