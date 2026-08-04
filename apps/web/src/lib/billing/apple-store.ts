import "server-only";

import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  type JWSRenewalInfoDecodedPayload,
  type JWSTransactionDecodedPayload,
  type ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library";
import { parseAppleProductIds } from "./apple-subscription-state";

export interface AppleServerConfiguration {
  appAppleId: number | undefined;
  bundleId: string;
  enableOnlineChecks: boolean;
  productIds: string[];
  rootCertificates: Buffer[];
}

const verifierCache = new Map<Environment, SignedDataVerifier>();

function readRootCertificates(): Buffer[] {
  return [
    process.env.APPLE_ROOT_CA_1_BASE64,
    process.env.APPLE_ROOT_CA_2_BASE64,
    process.env.APPLE_ROOT_CA_3_BASE64,
  ].filter((value): value is string => Boolean(value?.trim()))
    .map((value) => Buffer.from(value.replaceAll(/\s/g, ""), "base64"));
}

export function getAppleServerConfiguration(): AppleServerConfiguration {
  const bundleId = process.env.APPLE_BUNDLE_ID?.trim();
  const productIds = parseAppleProductIds(process.env.APPLE_SUBSCRIPTION_PRODUCT_IDS);
  const rootCertificates = readRootCertificates();
  const appAppleIdValue = process.env.APPLE_APP_ID?.trim();
  const appAppleId = appAppleIdValue ? Number(appAppleIdValue) : undefined;

  if (!bundleId) throw new Error("APPLE_BUNDLE_ID is not configured");
  if (productIds.length === 0) throw new Error("APPLE_SUBSCRIPTION_PRODUCT_IDS is not configured");
  if (rootCertificates.length === 0) throw new Error("Apple root certificates are not configured");
  if (appAppleIdValue && (!Number.isInteger(appAppleId) || (appAppleId ?? 0) <= 0)) {
    throw new Error("APPLE_APP_ID must be a positive integer");
  }

  return {
    appAppleId,
    bundleId,
    enableOnlineChecks: process.env.APPLE_ENABLE_ONLINE_CHECKS !== "false",
    productIds,
    rootCertificates,
  };
}

export function getAppleSignedDataVerifier(environment: Environment): SignedDataVerifier {
  const existing = verifierCache.get(environment);
  if (existing) return existing;

  const configuration = getAppleServerConfiguration();
  if (environment === Environment.PRODUCTION && !configuration.appAppleId) {
    throw new Error("APPLE_APP_ID is required for production verification");
  }
  const verifier = new SignedDataVerifier(
    configuration.rootCertificates,
    configuration.enableOnlineChecks,
    environment,
    configuration.bundleId,
    environment === Environment.PRODUCTION ? configuration.appAppleId : undefined,
  );
  verifierCache.set(environment, verifier);
  return verifier;
}

async function verifyInConfiguredEnvironment<T>({
  operation,
}: {
  operation: (verifier: SignedDataVerifier) => Promise<T>;
}): Promise<{ environment: Environment; value: T }> {
  let lastError: unknown;
  for (const environment of [Environment.PRODUCTION, Environment.SANDBOX]) {
    try {
      return { environment, value: await operation(getAppleSignedDataVerifier(environment)) };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Apple signed data verification failed");
}

export function verifyAppleTransaction(
  signedTransaction: string,
): Promise<{ environment: Environment; value: JWSTransactionDecodedPayload }> {
  return verifyInConfiguredEnvironment({
    operation: (verifier) => verifier.verifyAndDecodeTransaction(signedTransaction),
  });
}

export async function verifyAppleTransactionInEnvironment({
  environment,
  signedTransaction,
}: {
  environment: Environment;
  signedTransaction: string;
}): Promise<JWSTransactionDecodedPayload> {
  return getAppleSignedDataVerifier(environment).verifyAndDecodeTransaction(signedTransaction);
}

export async function verifyAppleRenewalInfoInEnvironment({
  environment,
  signedRenewalInfo,
}: {
  environment: Environment;
  signedRenewalInfo: string;
}): Promise<JWSRenewalInfoDecodedPayload> {
  return getAppleSignedDataVerifier(environment).verifyAndDecodeRenewalInfo(signedRenewalInfo);
}

export function verifyAppleNotification(
  signedPayload: string,
): Promise<{ environment: Environment; value: ResponseBodyV2DecodedPayload }> {
  return verifyInConfiguredEnvironment({
    operation: (verifier) => verifier.verifyAndDecodeNotification(signedPayload),
  });
}

export function getAppStoreServerAPIClient(
  environment: Environment,
): AppStoreServerAPIClient | null {
  const signingKey = process.env.APPLE_IAP_PRIVATE_KEY?.replaceAll("\\n", "\n").trim();
  const keyId = process.env.APPLE_IAP_KEY_ID?.trim();
  const issuerId = process.env.APPLE_IAP_ISSUER_ID?.trim();
  const configuredValues = [signingKey, keyId, issuerId].filter(Boolean).length;
  if (configuredValues === 0) return null;
  if (configuredValues !== 3) {
    throw new Error("APPLE_IAP_PRIVATE_KEY, APPLE_IAP_KEY_ID, and APPLE_IAP_ISSUER_ID must be configured together");
  }

  return new AppStoreServerAPIClient(
    signingKey!,
    keyId!,
    issuerId!,
    getAppleServerConfiguration().bundleId,
    environment,
  );
}
