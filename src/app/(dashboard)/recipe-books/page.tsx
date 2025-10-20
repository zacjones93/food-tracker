import { Suspense } from "react";
import { getRecipeBooksAction } from "./recipe-books.actions";
import { RecipeBooksTable } from "./_components/recipe-books-table";
import { Button } from "@/components/ui/button";
import { Plus } from "@/components/ui/themed-icons";
import Link from "next/link";

interface RecipeBooksPageProps {
  searchParams: Promise<{
    search?: string;
    page?: string;
  }>;
}

export default async function RecipeBooksPage({ searchParams }: RecipeBooksPageProps) {
  const params = await searchParams;

  const [data] = await getRecipeBooksAction({
    search: params.search,
    page: params.page ? parseInt(params.page) : 1,
  });

  const recipeBooks = data?.recipeBooks || [];
  const pagination = data?.pagination;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center sm:justify-between justify-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-center sm:text-left text-cream-900 dark:text-cream-100">Recipe Books</h1>
          <p className="text-cream-700 dark:text-cream-200">Browse your cookbook collection</p>
        </div>
        <Button asChild>
          <Link href="/recipe-books/create">
            <Plus className="h-4 w-4 mr-2" />
            New Recipe Book
          </Link>
        </Button>
      </div>

      <Suspense fallback={<div>Loading...</div>}>
        <RecipeBooksTable recipeBooks={recipeBooks} pagination={pagination} />
      </Suspense>
    </div>
  );
}
