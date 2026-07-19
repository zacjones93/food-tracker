"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { useServerAction } from "zsa-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BookOpen } from "@/components/ui/themed-icons";
import {
  createRecipeBookSchema,
  type CreateRecipeBookSchema,
} from "@/schemas/recipe-book.schema";
import { createRecipeBookAction } from "../recipe-books.actions";

export function CreateRecipeBookForm() {
  const router = useRouter();
  const { execute, isPending } = useServerAction(createRecipeBookAction);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateRecipeBookSchema>({
    resolver: zodResolver(createRecipeBookSchema),
    defaultValues: { name: "" },
  });

  async function onSubmit(input: CreateRecipeBookSchema) {
    const [data, error] = await execute(input);
    if (error || !data?.recipeBook) {
      toast.error(error?.message ?? "Could not create the recipe book");
      return;
    }

    toast.success("Recipe book created");
    router.push(`/recipe-books/${data.recipeBook.id}`);
    router.refresh();
  }

  return (
    <Card className="max-w-2xl border-cream-300 bg-cream-50 dark:border-mystic-700 dark:bg-mystic-900">
      <CardHeader className="space-y-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mystic-100 text-mystic-700 dark:bg-mystic-800 dark:text-cream-200">
          <BookOpen className="h-5 w-5" />
        </div>
        <CardTitle aria-level={2}>Book details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="name">Book name</Label>
            <Input
              id="name"
              autoComplete="off"
              autoFocus
              placeholder="e.g., Salt, Fat, Acid, Heat"
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "recipe-book-name-error" : undefined}
              {...register("name")}
            />
            {errors.name && (
              <p id="recipe-book-name-error" className="text-sm text-destructive">
                {errors.name.message}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button asChild variant="ghost">
              <Link href="/recipe-books">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Creating…" : "Create Recipe Book"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
