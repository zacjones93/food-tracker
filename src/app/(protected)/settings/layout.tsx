import { getSessionFromCookie } from "@/utils/auth";
import { redirect } from "next/navigation";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSessionFromCookie();

  if (!session) {
    redirect("/sign-in");
  }

  return children;
}
