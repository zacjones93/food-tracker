interface CloudflareEnv {
  // TODO Remove them from here because we are not longer loading them from the Cloudflare Context
  RESEND_API_KEY?: string;
  NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  BREVO_API_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  APPLE_APP_ID?: string;
  APPLE_BUNDLE_ID?: string;
  APPLE_ENABLE_ONLINE_CHECKS?: string;
  APPLE_IAP_ISSUER_ID?: string;
  APPLE_IAP_KEY_ID?: string;
  APPLE_IAP_PRIVATE_KEY?: string;
  APPLE_ROOT_CA_1_BASE64?: string;
  APPLE_ROOT_CA_2_BASE64?: string;
  APPLE_ROOT_CA_3_BASE64?: string;
  APPLE_SUBSCRIPTION_PRODUCT_IDS?: string;
}

declare namespace NodeJS {
  interface ProcessEnv extends CloudflareEnv {}
}
