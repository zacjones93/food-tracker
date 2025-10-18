import { Suspense } from "react";
import Link from "next/link";
import { getGroceryListTemplatesAction } from "../schedule/grocery-templates.actions";
import { GroceryTemplatesTable } from "./_components/grocery-templates-table";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

async function GroceryTemplatesContent() {
  const [data] = await getGroceryListTemplatesAction();
  const templates = data?.templates || [];

  return <GroceryTemplatesTable templates={templates} />;
}

export default async function GroceryTemplatesPage() {
  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-[[data-collapsible=icon]]/sidebar-wrapper:h-12">
        <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
        </div>
      </header>
      <div className="flex flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Grocery List Templates</h1>
            <p className="text-muted-foreground">Manage reusable grocery list templates</p>
          </div>
          <Button asChild>
            <Link href="/grocery-templates/create">
              <Plus className="h-4 w-4 mr-2" />
              New Template
            </Link>
          </Button>
        </div>

        <Suspense fallback={<div className="flex justify-center py-12">Loading templates...</div>}>
          <GroceryTemplatesContent />
        </Suspense>
      </div>
    </>
  );
}
