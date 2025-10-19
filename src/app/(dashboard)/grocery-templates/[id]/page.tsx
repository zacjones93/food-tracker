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
          <h1 className="text-3xl font-bold tracking-tight">Edit Template</h1>
          <p className="text-muted-foreground">Update your grocery list template</p>
        </div>

      <GroceryTemplateForm template={data.template} />
    </div>
  );
}
