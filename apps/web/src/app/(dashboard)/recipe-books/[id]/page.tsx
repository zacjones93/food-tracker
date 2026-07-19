import { notFound } from "next/navigation";
import { getRecipeBookByIdAction } from "../recipe-books.actions";
import { PageHeader } from "@/components/page-header";
import { BookOpen } from "@/components/ui/themed-icons";
import { RecipeBookRecipesList } from "./_components/recipe-book-recipes-list";

interface RecipeBookDetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function RecipeBookDetailPage({ params }: RecipeBookDetailPageProps) {
  const { id } = await params;

  const [data, error] = await getRecipeBookByIdAction({ id });

  if (error || !data?.recipeBook) {
    notFound();
  }

  const { recipeBook } = data;

  return (
    <div className="flex flex-col gap-6 p-6">
      <PageHeader
        title={recipeBook.name}
        description={`${recipeBook.recipes.length} ${recipeBook.recipes.length === 1 ? 'recipe' : 'recipes'} in this book`}
        icon={<BookOpen className="h-8 w-8 text-cream-700 dark:text-cream-200" />}
      />

      <RecipeBookRecipesList recipes={recipeBook.recipes} />
    </div>
  );
}
