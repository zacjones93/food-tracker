"use client";

import { useState } from "react";
import { useServerAction } from "zsa-react";
import { updateDefaultRecipeVisibilityAction } from "@/actions/team-settings.actions";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2 } from "@/components/ui/themed-icons";
import { toast } from "sonner";

interface DefaultRecipeVisibilitySettingsProps {
  teamId: string;
  currentVisibility: 'public' | 'private' | 'unlisted';
}

export function DefaultRecipeVisibilitySettings({ teamId, currentVisibility }: DefaultRecipeVisibilitySettingsProps) {
  const [visibility, setVisibility] = useState<'public' | 'private' | 'unlisted'>(currentVisibility);
  const [hasChanges, setHasChanges] = useState(false);

  const { execute, isPending, isSuccess } = useServerAction(updateDefaultRecipeVisibilityAction, {
    onSuccess: () => {
      toast.success("Default recipe visibility updated");
      setHasChanges(false);
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update settings");
    },
  });

  const handleSave = () => {
    execute({ teamId, defaultRecipeVisibility: visibility });
  };

  const handleChange = (value: string) => {
    setVisibility(value as 'public' | 'private' | 'unlisted');
    setHasChanges(value !== currentVisibility);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default Recipe Visibility</CardTitle>
        <CardDescription>
          Set the default visibility for new recipes created by your team
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup value={visibility} onValueChange={handleChange}>
          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="public" id="public" />
            <Label htmlFor="public" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold text-mystic-900 dark:text-cream-100">Public</span>
              <span className="text-sm text-mystic-700 dark:text-cream-200">
                Recipes are visible to all teams. Anyone can discover and view them.
              </span>
            </Label>
          </div>

          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="unlisted" id="unlisted" />
            <Label htmlFor="unlisted" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold text-mystic-900 dark:text-cream-100">Unlisted</span>
              <span className="text-sm text-mystic-700 dark:text-cream-200">
                Recipes are only accessible via direct link. Not shown in public listings.
              </span>
            </Label>
          </div>

          <div className="flex items-start space-x-3 space-y-0 p-4 border rounded-lg">
            <RadioGroupItem value="private" id="private" />
            <Label htmlFor="private" className="flex flex-col gap-1 cursor-pointer font-normal">
              <span className="font-semibold text-mystic-900 dark:text-cream-100">Private</span>
              <span className="text-sm text-mystic-700 dark:text-cream-200">
                Recipes are only visible to your team members. Maximum privacy.
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
