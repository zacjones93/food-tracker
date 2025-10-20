import { notFound } from "next/navigation";
import { getGroceryListTemplateByIdAction } from "../../schedule/grocery-templates.actions";
import { GroceryTemplateForm } from "../_components/grocery-template-form";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface GroceryTemplatePageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function GroceryTemplatePage({ params }: GroceryTemplatePageProps) {
  const { id } = await params;

  const [data] = await getGroceryListTemplateByIdAction({ id });

  if (!data?.template) {
    notFound();
  }

  return (
    <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-mystic-900 dark:text-cream-100">Edit Template</h1>
          <p className="text-mystic-700 dark:text-cream-200">Update your grocery list template</p>
        </div>

      <GroceryTemplateForm template={data.template} />
    </div>
  );
}
