"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import type { GroceryListTemplate } from "@/db/schema";
import { ClipboardList, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteGroceryListTemplateAction } from "../../schedule/grocery-templates.actions";
import { useServerAction } from "zsa-react";
import { toast } from "sonner";

interface GroceryTemplatesTableProps {
  templates: GroceryListTemplate[];
}

export function GroceryTemplatesTable({ templates }: GroceryTemplatesTableProps) {
  const router = useRouter();
  const { execute: deleteTemplate, isPending } = useServerAction(deleteGroceryListTemplateAction);

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`Delete template "${name}"?`)) {
      return;
    }

    const [, error] = await deleteTemplate({ id });

    if (error) {
      toast.error("Failed to delete template");
    } else {
      toast.success("Template deleted");
      router.refresh();
    }
  };

  if (templates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <ClipboardList className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-lg font-medium text-muted-foreground">
          No templates yet
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Create your first grocery list template
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Template Name</TableHead>
            <TableHead className="text-right">Categories</TableHead>
            <TableHead className="text-right">Items</TableHead>
            <TableHead className="text-right w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((template) => {
            const categoryCount = template.template.length;
            const itemCount = template.template.reduce((sum, cat) => sum + cat.items.length, 0);

            return (
              <TableRow
                key={template.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/grocery-templates/${template.id}`)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-muted-foreground" />
                    <span>{template.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {categoryCount}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {itemCount}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/grocery-templates/${template.id}`);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => handleDelete(template.id, template.name, e)}
                      disabled={isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
