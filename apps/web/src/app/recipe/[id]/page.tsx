import { permanentRedirect } from "next/navigation";

interface RecipePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function PublicRecipePage({ params }: RecipePageProps) {
  const { id } = await params;

  permanentRedirect(`/recipes/${encodeURIComponent(id)}`);
}
