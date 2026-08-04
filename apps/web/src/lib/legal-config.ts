export const LEGAL_EFFECTIVE_DATE = "July 22, 2026";

export const LEGAL_CONFIG_KEYS = {
  operatorName: "LEGAL_ENTITY_NAME",
  businessAddress: "LEGAL_BUSINESS_ADDRESS",
  governingLaw: "LEGAL_GOVERNING_LAW",
  privacyEmail: "PRIVACY_CONTACT_EMAIL",
  supportEmail: "SUPPORT_CONTACT_EMAIL",
} as const;

interface LegalConfigEnvironment {
  LEGAL_ENTITY_NAME?: string;
  LEGAL_BUSINESS_ADDRESS?: string;
  LEGAL_GOVERNING_LAW?: string;
  PRIVACY_CONTACT_EMAIL?: string;
  SUPPORT_CONTACT_EMAIL?: string;
}

export interface LegalConfig {
  operatorName: string;
  businessAddress: string;
  governingLaw: string;
  privacyEmail: string;
  supportEmail: string;
  missingKeys: string[];
}

function configuredValue({
  environment,
  key,
}: {
  environment: LegalConfigEnvironment;
  key: keyof LegalConfigEnvironment;
}): string {
  const value = environment[key]?.trim();
  return value || `[NOT CONFIGURED: ${key}]`;
}

export function getLegalConfig(
  environment?: LegalConfigEnvironment,
): LegalConfig {
  const resolvedEnvironment = environment ?? {
    LEGAL_ENTITY_NAME: process.env.LEGAL_ENTITY_NAME,
    LEGAL_BUSINESS_ADDRESS: process.env.LEGAL_BUSINESS_ADDRESS,
    LEGAL_GOVERNING_LAW: process.env.LEGAL_GOVERNING_LAW,
    PRIVACY_CONTACT_EMAIL: process.env.PRIVACY_CONTACT_EMAIL,
    SUPPORT_CONTACT_EMAIL: process.env.SUPPORT_CONTACT_EMAIL,
  };
  const missingKeys = Object.values(LEGAL_CONFIG_KEYS).filter(
    (key) => !resolvedEnvironment[key]?.trim(),
  );

  return {
    operatorName: configuredValue({
      environment: resolvedEnvironment,
      key: LEGAL_CONFIG_KEYS.operatorName,
    }),
    businessAddress: configuredValue({
      environment: resolvedEnvironment,
      key: LEGAL_CONFIG_KEYS.businessAddress,
    }),
    governingLaw: configuredValue({
      environment: resolvedEnvironment,
      key: LEGAL_CONFIG_KEYS.governingLaw,
    }),
    privacyEmail: configuredValue({
      environment: resolvedEnvironment,
      key: LEGAL_CONFIG_KEYS.privacyEmail,
    }),
    supportEmail: configuredValue({
      environment: resolvedEnvironment,
      key: LEGAL_CONFIG_KEYS.supportEmail,
    }),
    missingKeys,
  };
}

export function getEmailHref(email: string): string | null {
  if (email.startsWith("[") || !email.includes("@")) return null;
  return `mailto:${email}`;
}
