"use client";

import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import { useForm, useFieldArray, Control, UseFormRegister, FieldErrors } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, Save, X } from "@/components/ui/themed-icons";
import { toast } from "sonner";
import type { GroceryListTemplate } from "@/db/schema";
import { createGroceryListTemplateAction, updateGroceryListTemplateAction } from "../../schedule/grocery-templates.actions";
import { groceryTemplateCategorySchema } from "@/schemas/grocery-template.schema";
import { useSessionStore } from "@/state/session";

const formSchema = z.object({
  name: z.string().min(2).max(255),
  categories: z.array(groceryTemplateCategorySchema),
});

type FormValues = z.infer<typeof formSchema>;

interface GroceryTemplateFormProps {
  template?: GroceryListTemplate;
}

export function GroceryTemplateForm({ template }: GroceryTemplateFormProps) {
  const router = useRouter();
  const session = useSessionStore((state) => state.session);
  const { execute: createTemplate, isPending: isCreating } = useServerAction(createGroceryListTemplateAction);
  const { execute: updateTemplate, isPending: isUpdating } = useServerAction(updateGroceryListTemplateAction);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: template?.name || "",
      categories: template?.template || [],
    },
  });

  const { fields: categories, append: appendCategory, remove: removeCategory } = useFieldArray({
    control,
    name: "categories",
  });

  const onSubmit = async (data: FormValues) => {
    if (template) {
      const [, error] = await updateTemplate({
        id: template.id,
        name: data.name,
        template: data.categories,
      });

      if (error) {
        toast.error("Failed to update template");
      } else {
        toast.success("Template updated");
        router.push("/grocery-templates");
        router.refresh();
      }
    } else {
      const teamId = session?.activeTeamId || "";
      const [, error] = await createTemplate({
        teamId,
        name: data.name,
        template: data.categories,
      });

      if (error) {
        toast.error("Failed to create template");
      } else {
        toast.success("Template created");
        router.push("/grocery-templates");
        router.refresh();
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="name" className="text-mystic-900 dark:text-cream-100">Template Name</Label>
        <Input
          id="name"
          {...register("name")}
          placeholder="e.g., Weekly Staples"
        />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-mystic-900 dark:text-cream-100">Categories</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendCategory({ category: "", order: categories.length, items: [] })}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        </div>

        {categories.map((category, categoryIndex) => (
          <CategoryCard
            key={category.id}
            categoryIndex={categoryIndex}
            control={control}
            register={register}
            removeCategory={removeCategory}
            errors={errors}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isCreating || isUpdating}>
          <Save className="h-4 w-4 mr-2" />
          {template ? "Update" : "Create"} Template
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/grocery-templates")}
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CategoryCard({
  categoryIndex,
  control,
  register,
  removeCategory,
  errors,
}: {
  categoryIndex: number;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  removeCategory: (index: number) => void;
  errors: FieldErrors<FormValues>;
}) {
  const { fields: items, append: appendItem, remove: removeItem } = useFieldArray({
    control,
    name: `categories.${categoryIndex}.items`,
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-mystic-400 dark:text-cream-300" />
            <Input
              {...register(`categories.${categoryIndex}.category`)}
              placeholder="Category name (e.g., Produce)"
              className="max-w-xs"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => removeCategory(categoryIndex)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        {errors.categories?.[categoryIndex]?.category && (
          <p className="text-sm text-destructive">
            {errors.categories[categoryIndex].category.message}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item, itemIndex) => (
          <div key={item.id} className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 text-mystic-400 dark:text-cream-300" />
            <Input
              {...register(`categories.${categoryIndex}.items.${itemIndex}.name`)}
              placeholder="Item name"
              className="flex-1"
            />
            <input
              type="hidden"
              {...register(`categories.${categoryIndex}.items.${itemIndex}.order`)}
              value={itemIndex}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => removeItem(itemIndex)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => appendItem({ name: "", order: items.length })}
          className="w-full mt-2"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Item
        </Button>
      </CardContent>
    </Card>
  );
}
