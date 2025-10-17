import { Button } from "@/components/ui/button";
import Link from "next/link";

export function Hero() {
  return (
    <div className="relative isolate pt-14 dark:bg-gray-900">
      <div className="pt-20 pb-24 sm:pt-20 sm:pb-32 lg:pb-40">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent">
              Plan Your Meals with Ease
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Organize your favorite recipes, plan weekly menus, and track what you love to cook.
              Simple meal planning for home cooks.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-4 md:gap-x-6">
              <Link href="/sign-up">
                <Button size="lg" className="rounded-full">
                  Get Started Free
                </Button>
              </Link>
              <Link href="/sign-in">
                <Button variant="outline" size="lg" className="rounded-full">
                  Sign In
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
