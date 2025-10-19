"use client";

import { useState, useRef, useEffect } from "react";
import { type GroceryItem } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { useServerAction } from "zsa-react";
import {
  createGroceryItemAction,
  deleteGroceryItemAction,
  toggleGroceryItemAction,
  updateGroceryItemAction,
  bulkUpdateGroceryItemsAction,
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
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface CategorizedGroceryListProps {
  weekId: string;
  items: GroceryItem[];
}

interface SortableItemProps {
  item: GroceryItem;
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onEdit: (item: GroceryItem) => void;
  editingId: string | null;
  editValue: string;
  setEditValue: (value: string) => void;
  saveEdit: () => void;
  handleKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

function SortableItem({
  item,
  onToggle,
  onDelete,
  onEdit,
  editingId,
  editValue,
  setEditValue,
  saveEdit,
  handleKeyDown,
  inputRef,
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
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing touch-none"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      <Checkbox
        checked={item.checked}
        onCheckedChange={(checked) => onToggle(item.id, checked as boolean)}
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
          onClick={() => onEdit(item)}
          className={`flex-1 cursor-pointer ${
            item.checked ? "line-through text-muted-foreground" : ""
          }`}
        >
          {item.name}
        </span>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDelete(item.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function CategorizedGroceryList({ weekId, items: initialItems }: CategorizedGroceryListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("");
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [emptyCategories, setEmptyCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = item.category || "Uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, GroceryItem[]>);

  // Sort items within each category: unchecked first, then by order
  Object.keys(groupedItems).forEach(category => {
    groupedItems[category].sort((a, b) => {
      // First sort by checked status (unchecked first)
      if (a.checked !== b.checked) {
        return a.checked ? 1 : -1;
      }
      // Then by order
      return (a.order ?? 0) - (b.order ?? 0);
    });
  });

  // Get unique categories from existing items
  const existingCategories = Array.from(new Set(items.map(i => i.category).filter(Boolean)));

  // Merge empty categories with categories that have items
  const allCategories = Array.from(new Set([
    ...Object.keys(groupedItems),
    ...emptyCategories.filter(cat => !groupedItems[cat])
  ])).sort();

  const categories = allCategories;

  const { execute: createItem, isPending: isCreating } = useServerAction(
    createGroceryItemAction,
    {
      onSuccess: ({ data }) => {
        setItems((prev) => [...prev, data.groceryItem]);
        setNewItemName("");
        setNewItemCategory("");
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
    onSuccess: ({ data }) => {
      setItems((prev) =>
        prev.map((item) =>
          item.id === data.groceryItem.id ? data.groceryItem : item
        )
      );
    },
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

  const { execute: bulkUpdate } = useServerAction(bulkUpdateGroceryItemsAction, {
    onError: ({ err }) => {
      toast.error(err.message || "Failed to reorder items");
    },
  });

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    // Remove category from empty categories if it exists
    if (newItemCategory && emptyCategories.includes(newItemCategory)) {
      setEmptyCategories(prev => prev.filter(cat => cat !== newItemCategory));
    }

    await createItem({
      weekId,
      name: newItemName.trim(),
      category: newItemCategory || undefined,
    });
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    // Check if category already exists
    if (existingCategories.includes(newCategoryName.trim()) ||
        emptyCategories.includes(newCategoryName.trim())) {
      toast.error("Category already exists");
      return;
    }

    setEmptyCategories(prev => [...prev, newCategoryName.trim()]);
    setNewCategoryName("");
    toast.success("Category created");
  };

  const handleDeleteEmptyCategory = (category: string) => {
    setEmptyCategories(prev => prev.filter(cat => cat !== category));
    toast.success("Category deleted");
  };

  const handleToggle = async (id: string, checked: boolean) => {
    await toggleItem({ id, checked });
  };

  const handleDelete = async (id: string) => {
    // Find the item before deleting to check category
    const deletedItem = items.find(item => item.id === id);

    await deleteItem({ id });

    // Update state after successful deletion
    setItems((prev) => {
      const newItems = prev.filter((item) => item.id !== id);

      // If this was the last item in a category, convert to empty category
      if (deletedItem?.category) {
        const remainingInCategory = newItems.filter(
          item => item.category === deletedItem.category
        );
        if (remainingInCategory.length === 0) {
          setEmptyCategories((prevCats) => {
            if (!prevCats.includes(deletedItem.category!)) {
              return [...prevCats, deletedItem.category!];
            }
            return prevCats;
          });
        }
      }

      return newItems;
    });
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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;

    const activeItem = items.find(i => i.id === active.id);
    const overItem = items.find(i => i.id === over.id);

    if (!activeItem || !overItem) return;

    const activeCategory = activeItem.category || "Uncategorized";
    const overCategory = overItem.category || "Uncategorized";

    if (activeCategory !== overCategory) {
      // Moving to a different category
      setItems(prevItems => {
        const updatedItems = prevItems.map(item => {
          if (item.id === activeItem.id) {
            return { ...item, category: overItem.category };
          }
          return item;
        });
        return updatedItems;
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const activeItem = items.find(i => i.id === active.id);
    const overItem = items.find(i => i.id === over.id);

    if (!activeItem || !overItem) return;

    const overCategory = overItem.category || "Uncategorized";

    // Get items in the target category
    const categoryItems = items.filter(
      i => (i.category || "Uncategorized") === overCategory
    );

    const oldIndex = categoryItems.findIndex(i => i.id === active.id);
    const newIndex = categoryItems.findIndex(i => i.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Reorder within category
    const reorderedCategoryItems = arrayMove(categoryItems, oldIndex, newIndex);

    // Update the order property on each reordered item
    const reorderedWithNewOrder: GroceryItem[] = reorderedCategoryItems.map((item, index) => ({
      ...item,
      order: index,
      category: overCategory === "Uncategorized" ? null : overCategory,
    }));

    // Update all items
    const otherItems = items.filter(
      i => (i.category || "Uncategorized") !== overCategory
    );

    const allItems = [...otherItems, ...reorderedWithNewOrder];

    // Update state first with new order values
    setItems(allItems);

    // Prepare bulk update
    const updates = reorderedWithNewOrder.map((item) => ({
      id: item.id,
      category: item.category || undefined,
      order: item.order ?? 0,
    }));

    // Send to server after state update
    await bulkUpdate({ weekId, updates });
  };

  const activeItem = activeId ? items.find(i => i.id === activeId) : null;

  return (
    <Card>
      <CardContent className="p-6">
        <div className="space-y-6 mb-6">
          <form onSubmit={handleAddCategory} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="category-name" className="text-sm font-medium">
                Add New Category
              </Label>
              <div className="flex gap-2">
                <Input
                  id="category-name"
                  placeholder="Category name..."
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  className="flex-1"
                />
                <Button type="submit" variant="outline" disabled={!newCategoryName.trim()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>
          </form>

          <form onSubmit={handleAddItem} className="space-y-3">
            <Label className="text-sm font-medium">Add Grocery Item</Label>
            <div className="space-y-2">
              <Input
                placeholder="Item name..."
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                disabled={isCreating}
              />
              <Input
                placeholder="Category (optional)"
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value)}
                disabled={isCreating}
                list="categories"
              />
              <datalist id="categories">
                {allCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
              <Button type="submit" disabled={isCreating || !newItemName.trim()} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
          </form>
        </div>

        {items.length === 0 && emptyCategories.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No grocery items yet. Add your first item or category above.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="space-y-6">
              {categories.map((category) => {
                const categoryItems = groupedItems[category] || [];
                const isEmpty = categoryItems.length === 0;

                return (
                  <div key={category}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        {category}
                      </h3>
                      {isEmpty && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteEmptyCategory(category)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {isEmpty ? (
                      <div className="text-sm text-muted-foreground italic py-2 px-3 border border-dashed rounded-lg">
                        Empty category - add items above
                      </div>
                    ) : (
                      <SortableContext
                        items={categoryItems.map(i => i.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-1">
                          {categoryItems.map((item) => (
                            <SortableItem
                              key={item.id}
                              item={item}
                              onToggle={handleToggle}
                              onDelete={handleDelete}
                              onEdit={startEdit}
                              editingId={editingId}
                              editValue={editValue}
                              setEditValue={setEditValue}
                              saveEdit={saveEdit}
                              handleKeyDown={handleKeyDown}
                              inputRef={inputRef}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    )}
                  </div>
                );
              })}
            </div>

            <DragOverlay>
              {activeItem ? (
                <div className="flex items-center gap-2 p-2 rounded-lg bg-background border shadow-lg">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Checkbox checked={activeItem.checked} disabled />
                  <span className={activeItem.checked ? "line-through text-muted-foreground" : ""}>
                    {activeItem.name}
                  </span>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
