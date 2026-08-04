import { redirect } from "next/navigation";

import { getAccountDeletionPreview } from "@/lib/account-deletion";
import { getSessionFromCookie } from "@/utils/auth";

import { AccountDeletionForm } from "./account-deletion-form";

export default async function AccountSettingsPage() {
  const session = await getSessionFromCookie();
  if (!session) redirect("/sign-in");

  const preview = await getAccountDeletionPreview({ userId: session.user.id });
  return <AccountDeletionForm preview={preview} />;
}
