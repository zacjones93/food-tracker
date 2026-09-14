import "server-only";

import Link from "next/link";
import DashboardLayout from "@/app/(dashboard)/layout";
import { SITE_NAME } from "@/constants";
import { getSessionFromCookie } from "@/utils/auth";

export default async function SharedRecipeLayout({ children }: { children: React.ReactNode }) {
  const session = await getSessionFromCookie();
  if (session) return <DashboardLayout>{children}</DashboardLayout>;

  return (
    <main className="min-h-svh">
      <header className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <Link href="/" className="font-semibold">{SITE_NAME}</Link>
      </header>
      {children}
    </main>
  );
}
