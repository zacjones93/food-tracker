"use client";

import { useState, useRef, useEffect } from "react";
import { type GroceryItem } from "@/db/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { useServerAction } from "zsa-react";
import {
  createGroceryItemAction,
  deleteGroceryItemAction,
  toggleGroceryItemAction,
  updateGroceryItemAction,
} from "../../grocery-items.actions";
import { toast } from "sonner";

interface GroceryListProps {
  weekId: string;
  items: GroceryItem[];
}

export function GroceryList({ weekId, items: initialItems }: GroceryListProps) {
  const [newItemName, setNewItemName] = useState("");
  const [items, setItems] = useState(initialItems);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

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

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    await createItem({ weekId, name: newItemName.trim() });
  };

  const handleToggle = async (id: string, checked: boolean) => {
    await toggleItem({ id, checked });
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
            <Plus className="h-4 w-4" />
          </Button>
        </form>

        {items.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No grocery items yet. Add your first item above.
          </div>
        ) : (
          <div className="space-y-2">
            {items
              .sort((a, b) => {
                // First sort by category
                const categoryA = a.category || "Uncategorized";
                const categoryB = b.category || "Uncategorized";
                if (categoryA !== categoryB) {
                  return categoryA.localeCompare(categoryB);
                }
                // Within same category, unchecked items first, checked items at bottom
                if (a.checked === b.checked) return 0;
                return a.checked ? 1 : -1;
              })
              .map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Checkbox
                    checked={item.checked}
                    onCheckedChange={(checked) =>
                      handleToggle(item.id, checked as boolean)
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
                  {item.category && (
                    <span className="text-xs text-muted-foreground">
                      {item.category}
                    </span>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
