"use client";

import { useState, useRef, useEffect } from "react";
import { type GroceryItem } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, GripVertical } from "@/components/ui/themed-icons";
import { useServerAction } from "zsa-react";
import {
  createGroceryItemAction,
  deleteGroceryItemAction,
  toggleGroceryItemAction,
  updateGroceryItemAction,
} from "../../grocery-items.actions";
import { toast } from "sonner";
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

interface GroceryListProps {
  weekId: string;
  items: GroceryItem[];
}

interface SortableCategoryProps {
  category: string;
  categoryItems: GroceryItem[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  editingId: string | null;
  editValue: string;
  setEditValue: (value: string) => void;
  saveEdit: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  startEdit: (item: GroceryItem) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function SortableCategory({
  category,
  categoryItems,
  onToggle,
  onDelete,
  editingId,
  editValue,
  setEditValue,
  saveEdit,
  handleKeyDown,
  startEdit,
  inputRef,
}: SortableCategoryProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Sort items within category: unchecked first, then checked
  const sortedItems = [...categoryItems].sort((a, b) => {
    if (a.checked === b.checked) return 0;
    return a.checked ? 1 : -1;
  });

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 mb-2">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing touch-none"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground dark:text-cream-300" />
        </div>
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          {category}
        </h3>
      </div>
      <div className="space-y-2">
        {sortedItems.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Checkbox
              checked={item.checked}
              onCheckedChange={(checked) =>
                onToggle(item.id, checked as boolean)
              }
            />
            {editingId === item.id ? (
              <Input
                ref={inputRef}
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={handleKeyDown}
                className="flex-1 h-8"
              />
            ) : (
              <span
                onClick={() => startEdit(item)}
                className={`flex-1 cursor-pointer ${
                  item.checked ? "line-through text-muted-foreground" : ""
                }`}
              >
                {item.name}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
              <Trash2 className="h-4 w-4 dark:text-cream-300" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GroceryList({ weekId, items: initialItems }: GroceryListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Load category order from localStorage
  const [categoryOrder, setCategoryOrder] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    const stored = localStorage.getItem(`grocery-category-order-${weekId}`);
    return stored ? JSON.parse(stored) : [];
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

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Save category order to localStorage
  useEffect(() => {
    if (categoryOrder.length > 0) {
      localStorage.setItem(
        `grocery-category-order-${weekId}`,
        JSON.stringify(categoryOrder)
      );
    }
  }, [categoryOrder, weekId]);

  const { execute: createItem, isPending: isCreating } = useServerAction(
    createGroceryItemAction,
    {
      onSuccess: ({ data }) => {
        setItems((prev) => [...prev, data.groceryItem]);
        setNewItemName("");
        toast.success("Item added");
      },
      onError: ({ err }) => {
        toast.error(err.message || "Failed to add item");
      },
    }
  );

  const { execute: deleteItem } = useServerAction(deleteGroceryItemAction, {
    onSuccess: () => {
      toast.success("Item deleted");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to delete item");
    },
  });

  const { execute: toggleItem } = useServerAction(toggleGroceryItemAction, {
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update item");
    },
  });

  const { execute: updateItem } = useServerAction(updateGroceryItemAction, {
    onSuccess: ({ data }) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === data.groceryItem.id ? data.groceryItem : item
        )
      );
      setEditingId(null);
      toast.success("Item updated");
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update item");
    },
  });

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    await createItem({ weekId, name: newItemName.trim() });
  };

  const handleToggle = async (id: string, checked: boolean) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, checked } : item
      )
    );

    // Revert on error
    const [, err] = await toggleItem({ id, checked });
    if (err) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, checked: !checked } : item
        )
      );
    }
  };

  const handleDelete = async (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
    await deleteItem({ id });
  };

  const startEdit = (item: GroceryItem) => {
    setEditingId(item.id);
    setEditValue(item.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async () => {
    if (!editingId || !editValue.trim()) {
      cancelEdit();
      return;
    }

    await updateItem({ id: editingId, name: editValue.trim() });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveEdit();
    } else if (e.key === "Escape") {
      cancelEdit();
    }
  };

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    setCategoryOrder((currentOrder) => {
      // Get all current categories
      const allCategories = Array.from(
        new Set(items.map((item) => item.category || "Uncategorized"))
      );

      // If we don't have a custom order yet, initialize with current categories
      const workingOrder =
        currentOrder.length === 0 ? allCategories : currentOrder;

      // Add any new categories that aren't in the order yet
      const missingCategories = allCategories.filter(
        (cat) => !workingOrder.includes(cat)
      );
      const fullOrder = [...workingOrder, ...missingCategories];

      const oldIndex = fullOrder.indexOf(active.id as string);
      const newIndex = fullOrder.indexOf(over.id as string);

      if (oldIndex === -1 || newIndex === -1) return fullOrder;

      return arrayMove(fullOrder, oldIndex, newIndex);
    });
  };

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, GroceryItem[]>);

  // Get all categories
  const allCategories = Object.keys(groupedItems);

  // Sort categories by custom order, then alphabetically for new categories
  const sortedCategories = [...allCategories].sort((a, b) => {
    const aIndex = categoryOrder.indexOf(a);
    const bIndex = categoryOrder.indexOf(b);

    // Both in custom order
    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }

    // Only a is in custom order
    if (aIndex !== -1) return -1;

    // Only b is in custom order
    if (bIndex !== -1) return 1;

    // Neither in custom order, sort alphabetically
    return a.localeCompare(b);
  });

  // Initialize category order if empty and we have categories
  useEffect(() => {
    if (categoryOrder.length === 0 && allCategories.length > 0) {
      setCategoryOrder([...allCategories].sort());
    }
  }, [allCategories.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleAddItem} className="flex gap-2 mb-4">
          <Input
            placeholder="Add grocery item..."
            value={newItemName}
            onChange={(e) => setNewItemName(e.target.value)}
            disabled={isCreating}
          />
          <Button type="submit" disabled={isCreating || !newItemName.trim()}>
            <Plus className="h-4 w-4 dark:text-cream-100" />
          </Button>
        </form>

        {items.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No grocery items yet. Add your first item above.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleCategoryDragEnd}
          >
            <SortableContext
              items={sortedCategories}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-6">
                {sortedCategories.map((category) => {
                  const categoryItems = groupedItems[category] || [];

                  return (
                    <SortableCategory
                      key={category}
                      category={category}
                      categoryItems={categoryItems}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                      editingId={editingId}
                      editValue={editValue}
                      setEditValue={setEditValue}
                      saveEdit={saveEdit}
                      handleKeyDown={handleKeyDown}
                      startEdit={startEdit}
                      inputRef={inputRef}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
