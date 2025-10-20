import { getSessionFromCookie } from "@/utils/auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TeamsManagement } from "./teams-management";

function TeamsManagementSkeleton() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-[200px]" />
          <Skeleton className="h-4 w-[300px]" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default async function TeamsPage() {
  const session = await getSessionFromCookie();

  if (!session) {
    return redirect("/sign-in");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-mystic-900 dark:text-cream-100">Teams</h1>
        <p className="text-mystic-700 dark:text-cream-200">
          Manage your teams, invite members, and control access
        </p>
      </div>

      <Suspense fallback={<TeamsManagementSkeleton />}>
        <TeamsManagement />
      </Suspense>
    </div>
  );
}
