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
import type { RecipeBook } from "@/db/schema";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, BookOpen } from "@/components/ui/themed-icons";
import { useRouter, useSearchParams } from "next/navigation";

interface RecipeBooksTableProps {
  recipeBooks: (RecipeBook & { recipeCount: number })[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export function RecipeBooksTable({ recipeBooks, pagination }: RecipeBooksTableProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", newPage.toString());
    router.push(`?${params.toString()}`);
  };

  if (recipeBooks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <BookOpen className="h-12 w-12 text-cream-700 dark:text-cream-200 mb-4" />
        <p className="text-lg font-medium text-cream-900 dark:text-cream-100">
          No recipe books yet
        </p>
        <p className="text-sm text-cream-700 dark:text-cream-200 mt-1">
          Add your first cookbook to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Book Name</TableHead>
              <TableHead className="text-right">Recipes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipeBooks.map((book) => (
              <TableRow
                key={book.id}
                className="cursor-pointer hover:bg-cream-50 dark:hover:bg-cream-200/10"
                onClick={() => router.push(`/recipe-books/${book.id}`)}
              >
                <TableCell className="font-medium text-cream-900 dark:text-cream-100">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-cream-700 dark:text-cream-200" />
                    <span>{book.name}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right text-cream-700 dark:text-cream-200">
                  {book.recipeCount} {book.recipeCount === 1 ? 'recipe' : 'recipes'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-cream-700 dark:text-cream-200">
            Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total} books
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(1)}
              disabled={pagination.page === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={pagination.page === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="text-sm font-medium text-cream-900 dark:text-cream-100">
              Page {pagination.page} of {pagination.totalPages}
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={pagination.page === pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => handlePageChange(pagination.totalPages)}
              disabled={pagination.page === pagination.totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
