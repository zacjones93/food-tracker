import "server-only";

import { Resend } from "resend";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SITE_URL } from "@/constants";
import isProd from "./isProd";
import { ResetPasswordEmail } from "@/react-email/emails/reset-password";

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

  await resend.emails.send({
    from: env.RESEND_FROM_EMAIL,
    to: email,
    subject: "Reset your password",
    react: <ResetPasswordEmail resetLink={resetUrl} username={username} />,
  });
}
