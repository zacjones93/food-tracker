import { GroceryTemplateForm } from "../_components/grocery-template-form";

export default function CreateGroceryTemplatePage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Create Template</h1>
        <p className="text-muted-foreground">Create a new grocery list template</p>
      </div>

      <GroceryTemplateForm />
    </div>
  );
}
