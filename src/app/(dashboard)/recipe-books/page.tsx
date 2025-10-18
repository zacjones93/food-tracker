import { Suspense } from "react";
import { getRecipeBooksAction } from "./recipe-books.actions";
import { RecipeBooksTable } from "./_components/recipe-books-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Plus, BookOpen } from "lucide-react";

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
      <PageHeader
        title="Recipe Books"
        description="Browse your cookbook collection"
        icon={<BookOpen className="h-8 w-8" />}
      >
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Recipe Book
        </Button>
      </PageHeader>

      <Suspense fallback={<div>Loading...</div>}>
        <RecipeBooksTable recipeBooks={recipeBooks} pagination={pagination} />
      </Suspense>
    </div>
  );
}
