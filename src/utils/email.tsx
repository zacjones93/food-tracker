import "server-only";

import { Resend } from "resend";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SITE_DOMAIN, SITE_URL } from "@/constants";
import isProd from "./isProd";
import { render } from '@react-email/render'
import { ResetPasswordEmail } from "@/react-email/reset-password";
import { VerifyEmail } from "@/react-email/verify-email";

export async function sendPasswordResetEmail({
  email,
  resetToken,
  username
}: {
  email: string;
  resetToken: string;
  username: string;
}) {
  const resetUrl = `${SITE_URL}/reset-password?token=${resetToken}`;
  const { env } = await getCloudflareContext();

  if (!isProd) {
    console.warn("\n\n\nPassword reset link", resetUrl, "\n\n\n");
    return
  }

  const resend = new Resend(env.RESEND_API_KEY);

  const html = await render(ResetPasswordEmail({ resetLink: resetUrl, username }))

  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: email,
    subject: `Reset your password for ${SITE_DOMAIN}`,
    html
  });
}

export async function sendVerificationEmail({
  email,
  verificationToken,
  username
}: {
  email: string;
  verificationToken: string;
  username: string;
}) {
  const verificationUrl = `${SITE_URL}/verify-email?token=${verificationToken}`;
  const { env } = await getCloudflareContext();

  if (!isProd) {
    console.warn("\n\n\nVerification link", verificationUrl, "\n\n\n");
    return
  }

  const resend = new Resend(env.RESEND_API_KEY);

  const html = await render(VerifyEmail({ verificationLink: verificationUrl, username }))

  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: email,
    subject: `Verify your email for ${SITE_DOMAIN}`,
    html
  });
}
