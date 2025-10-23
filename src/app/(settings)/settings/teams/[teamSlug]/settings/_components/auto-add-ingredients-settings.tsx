"use client";

import { useState } from "react";
import { useServerAction } from "zsa-react";
import { updateAutoAddIngredientsAction } from "@/actions/team-settings.actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "@/components/ui/themed-icons";
import { toast } from "sonner";

interface AutoAddIngredientsSettingsProps {
  teamId: string;
  currentSetting: boolean;
}

export function AutoAddIngredientsSettings({ teamId, currentSetting }: AutoAddIngredientsSettingsProps) {
  const [autoAdd, setAutoAdd] = useState<boolean>(currentSetting);
  const [hasChanges, setHasChanges] = useState(false);

  const { execute, isPending, isSuccess } = useServerAction(updateAutoAddIngredientsAction, {
    onSuccess: () => {
      toast.success("Auto-add ingredients setting updated");
      setHasChanges(false);
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update setting");
    },
  });

  const handleSave = () => {
    execute({ teamId, autoAddIngredientsToGrocery: autoAdd });
  };

  const handleChange = (checked: boolean) => {
    setAutoAdd(checked);
    setHasChanges(checked !== currentSetting);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Auto-Add Ingredients to Grocery List</CardTitle>
        <CardDescription>
          Automatically add recipe ingredients to the grocery list when adding recipes to schedules
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <Label htmlFor="auto-add" className="flex flex-col gap-1 cursor-pointer">
            <span className="font-semibold text-mystic-900 dark:text-cream-100">
              {autoAdd ? "Enabled" : "Disabled"}
            </span>
            <span className="text-sm text-mystic-700 dark:text-cream-200 font-normal">
              {autoAdd
                ? "Recipe ingredients will be automatically added to the grocery list"
                : "You'll need to manually add ingredients from recipes to the grocery list"}
            </span>
          </Label>
          <Switch
            id="auto-add"
            checked={autoAdd}
            onCheckedChange={handleChange}
          />
        </div>

        {hasChanges && (
          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={isPending}
            >
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isSuccess && <CheckCircle2 className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
