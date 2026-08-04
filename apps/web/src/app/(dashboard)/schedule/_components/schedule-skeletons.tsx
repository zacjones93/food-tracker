import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function WeeksBoardSkeleton() {
  return (
    <div className="space-y-8" aria-label="Loading meal schedule" role="status">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-6 w-8 rounded-full" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <Card key={index}>
              <CardHeader className="space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-full" />
                  <Skeleton className="h-5 w-40" />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-full" />
                <Skeleton className="h-11 w-4/5" />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}

export function SchedulePageSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col items-center justify-center gap-4 sm:flex-row sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-5 w-72" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>
      <WeeksBoardSkeleton />
    </div>
  );
}

export function WeekDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6" aria-label="Loading week" role="status">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-36" />
          <Skeleton className="h-10 w-24" />
        </div>
      </div>
      <div className="space-y-8">
        <section className="space-y-4">
          <Skeleton className="h-8 w-28" />
          <Card>
            <CardContent className="space-y-3 p-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </CardContent>
          </Card>
        </section>
        <section className="space-y-4">
          <Skeleton className="h-8 w-36" />
          <Card>
            <CardContent className="space-y-3 p-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-5/6" />
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
