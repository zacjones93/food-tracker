import { GroceryTemplateForm } from "../_components/grocery-template-form";

export default function CreateGroceryTemplatePage() {
  return (
    <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-center sm:text-left text-mystic-900 dark:text-cream-100">Create Template</h1>
          <p className="text-mystic-700 dark:text-cream-200 text-center sm:text-left">Create a new grocery list template</p>
        </div>

      <GroceryTemplateForm />
    </div>
  );
}
