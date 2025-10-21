"use client";

import { useRouter } from "next/navigation";
import { useServerAction } from "zsa-react";
import {
  useForm,
  useFieldArray,
  Control,
  UseFormRegister,
  FieldErrors,
  UseFormSetValue,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  X,
} from "@/components/ui/themed-icons";
import { toast } from "sonner";
import type { GroceryListTemplate } from "@/db/schema";
import {
  createGroceryListTemplateAction,
  updateGroceryListTemplateAction,
} from "../../schedule/grocery-templates.actions";
import { groceryTemplateCategorySchema } from "@/schemas/grocery-template.schema";
import { useSessionStore } from "@/state/session";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  const { execute: createTemplate, isPending: isCreating } = useServerAction(
    createGroceryListTemplateAction
  );
  const { execute: updateTemplate, isPending: isUpdating } = useServerAction(
    updateGroceryListTemplateAction
  );

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
    setValue,
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: template?.name || "",
      categories: template?.template || [],
    },
  });

  const {
    fields: categories,
    append: appendCategory,
    remove: removeCategory,
    move: moveCategory,
  } = useFieldArray({
    control,
    name: "categories",
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((cat) => cat.id === active.id);
    const newIndex = categories.findIndex((cat) => cat.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      moveCategory(oldIndex, newIndex);

      // Update order values
      const reordered = arrayMove(categories, oldIndex, newIndex);
      reordered.forEach((cat, index) => {
        setValue(`categories.${index}.order`, index);
      });
    }
  };

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
        <Label htmlFor="name" className="text-mystic-900 dark:text-cream-100">
          Template Name
        </Label>
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
          <Label className="text-mystic-900 dark:text-cream-100">
            Categories
          </Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendCategory({
                category: "",
                order: categories.length,
                items: [],
              })
            }
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleCategoryDragEnd}
        >
          <SortableContext
            items={categories.map((cat) => cat.id)}
            strategy={verticalListSortingStrategy}
          >
            {categories.map((category, categoryIndex) => (
              <CategoryCard
                key={category.id}
                category={category}
                categoryIndex={categoryIndex}
                control={control}
                register={register}
                removeCategory={removeCategory}
                errors={errors}
                setValue={setValue}
              />
            ))}
          </SortableContext>
        </DndContext>
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

interface SortableItemProps {
  item: { id: string; name: string; order: number };
  categoryIndex: number;
  itemIndex: number;
  register: UseFormRegister<FormValues>;
  removeItem: (index: number) => void;
}

function SortableItem({
  item,
  categoryIndex,
  itemIndex,
  register,
  removeItem,
}: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2">
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-mystic-400 dark:text-cream-300" />
      </div>
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
  );
}

function CategoryCard({
  category,
  categoryIndex,
  control,
  register,
  removeCategory,
  errors,
  setValue,
}: {
  category: { id: string };
  categoryIndex: number;
  control: Control<FormValues>;
  register: UseFormRegister<FormValues>;
  removeCategory: (index: number) => void;
  errors: FieldErrors<FormValues>;
  setValue: UseFormSetValue<FormValues>;
}) {
  const {
    fields: items,
    append: appendItem,
    remove: removeItem,
    move: moveItem,
  } = useFieldArray({
    control,
    name: `categories.${categoryIndex}.items`,
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleItemDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((item) => item.id === active.id);
    const newIndex = items.findIndex((item) => item.id === over.id);

    if (oldIndex !== -1 && newIndex !== -1) {
      moveItem(oldIndex, newIndex);

      // Update order values
      const reordered = arrayMove(items, oldIndex, newIndex);
      reordered.forEach((item, index) => {
        setValue(`categories.${categoryIndex}.items.${index}.order`, index);
      });
    }
  };

  return (
    <Card ref={setNodeRef} style={style}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 flex items-center gap-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing touch-none"
            >
              <GripVertical className="h-4 w-4 text-mystic-400 dark:text-cream-300" />
            </div>
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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleItemDragEnd}
        >
          <SortableContext
            items={items.map((item) => item.id)}
            strategy={verticalListSortingStrategy}
          >
            {items.map((item, itemIndex) => (
              <SortableItem
                key={item.id}
                item={item}
                categoryIndex={categoryIndex}
                itemIndex={itemIndex}
                register={register}
                removeItem={removeItem}
              />
            ))}
          </SortableContext>
        </DndContext>
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
