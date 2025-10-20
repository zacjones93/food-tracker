"use client";

import { useState } from "react";
import { useServerAction } from "zsa-react";
import { updateRecipeVisibilityModeAction } from "@/actions/team-settings.actions";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "@/components/ui/themed-icons";
import { toast } from "sonner";

interface RecipeVisibilitySettingsProps {
  teamId: string;
  currentMode: 'all' | 'team_only';
}

export function RecipeVisibilitySettings({ teamId, currentMode }: RecipeVisibilitySettingsProps) {
  const [mode, setMode] = useState<'all' | 'team_only'>(currentMode);
  const [hasChanges, setHasChanges] = useState(false);

  const { execute, isPending, isSuccess } = useServerAction(updateRecipeVisibilityModeAction, {
    onSuccess: () => {
      toast.success("Recipe visibility settings updated");
      setHasChanges(false);
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update settings");
    },
  });

  const handleSave = () => {
    execute({ teamId, recipeVisibilityMode: mode });
  };

  const handleChange = (value: string) => {
    setMode(value as 'all' | 'team_only');
    setHasChanges(value !== currentMode);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recipe Visibility</CardTitle>
        <CardDescription>
          Control which recipes are visible to team members
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={mode} onValueChange={handleChange}>
          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="all" id="all" />
            <Label htmlFor="all" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold text-mystic-900 dark:text-cream-100">All Public Recipes</span>
              <span className="text-sm text-mystic-700 dark:text-cream-200">
                Show recipes owned by your team plus all public recipes from other teams.
                Best for discovering new recipes and collaboration.
              </span>
            </Label>
          </div>

          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="team_only" id="team_only" />
            <Label htmlFor="team_only" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold text-mystic-900 dark:text-cream-100">Team Recipes Only</span>
              <span className="text-sm text-mystic-700 dark:text-cream-200">
                Show only recipes owned by your team (regardless of visibility).
                Use when you want a curated, private recipe collection.
              </span>
            </Label>
          </div>
        </RadioGroup>

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
