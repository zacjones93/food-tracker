"use client";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@/components/ui/themed-icons";
import Link from "next/link";
import { WeekForm } from "../_components/week-form";

export default function CreateWeekPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-mystic-900 dark:text-cream-100">
            Create Week
          </h1>
          <p className="text-mystic-700 dark:text-cream-200">
            Add a new week to your meal schedule
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/schedule">
            <ArrowLeft className="h-4 w-4 mr-2 dark:text-cream-200" />
            Back to Schedule
          </Link>
        </Button>
      </div>

      <WeekForm mode="create" />
    </div>
  );
}
