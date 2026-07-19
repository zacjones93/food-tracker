import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "@/components/ui/themed-icons";
import { CreateRecipeBookForm } from "./create-recipe-book-form";

export default function CreateRecipeBookPage() {
  return (
    <div className="flex flex-col gap-8 p-6">
      <div className="space-y-4">
        <Button asChild variant="ghost" className="w-fit px-0 hover:bg-transparent">
          <Link href="/recipe-books">
            <ArrowLeft className="h-4 w-4" />
            Back to recipe books
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-mystic-900 dark:text-cream-100">
            New Recipe Book
          </h1>
          <p className="mt-2 text-mystic-700 dark:text-cream-200">
            Add a cookbook to your team library, then connect recipes and page numbers to it.
          </p>
        </div>
      </div>

      <CreateRecipeBookForm />
    </div>
  );
}
