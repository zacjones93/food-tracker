import { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import VerifyEmailClientComponent from "./verify-email.client";
import { getVerificationTokenKey } from "@/utils/auth-utils";

export const metadata: Metadata = {
  title: "Verify Email",
  description: "Verify your email address",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = searchParams.token;

  if (!token) {
    return notFound();
  }

  const { env } = await getCloudflareContext();
  const verificationTokenStr = await env.NEXT_CACHE_WORKERS_KV.get(getVerificationTokenKey(token));

  if (!verificationTokenStr) {
    return notFound();
  }

  return <VerifyEmailClientComponent />;
}
