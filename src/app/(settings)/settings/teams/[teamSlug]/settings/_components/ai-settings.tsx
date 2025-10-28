"use client";

import { useState } from "react";
import { useServerAction } from "zsa-react";
import { updateAiSettingsAction } from "@/actions/team-settings.actions";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, Sparkles } from "@/components/ui/themed-icons";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AiSettingsProps {
  teamId: string;
  teamSlug: string;
  currentSettings: {
    aiEnabled: boolean;
    aiMonthlyBudgetUsd: string;
    aiMaxTokensPerRequest: number;
    aiMaxRequestsPerDay: number;
  };
}

export function AiSettings({ teamId, teamSlug, currentSettings }: AiSettingsProps) {
  const [aiEnabled, setAiEnabled] = useState(currentSettings.aiEnabled);
  const [monthlyBudget, setMonthlyBudget] = useState(currentSettings.aiMonthlyBudgetUsd);
  const [maxTokens, setMaxTokens] = useState(currentSettings.aiMaxTokensPerRequest.toString());
  const [maxRequests, setMaxRequests] = useState(currentSettings.aiMaxRequestsPerDay.toString());
  const [hasChanges, setHasChanges] = useState(false);

  const allowedTeams = ["default", "team_default"];
  const isAllowedTeam = allowedTeams.includes(teamSlug);

  const { execute, isPending, isSuccess } = useServerAction(updateAiSettingsAction, {
    onSuccess: () => {
      toast.success("AI settings updated successfully");
      setHasChanges(false);
    },
    onError: ({ err }) => {
      toast.error(err.message || "Failed to update AI settings");
    },
  });

  const handleSave = () => {
    execute({
      teamId,
      aiEnabled,
      aiMonthlyBudgetUsd: monthlyBudget,
      aiMaxTokensPerRequest: parseInt(maxTokens, 10),
      aiMaxRequestsPerDay: parseInt(maxRequests, 10),
    });
  };

  const handleEnabledChange = (checked: boolean) => {
    setAiEnabled(checked);
    setHasChanges(
      checked !== currentSettings.aiEnabled ||
      monthlyBudget !== currentSettings.aiMonthlyBudgetUsd ||
      maxTokens !== currentSettings.aiMaxTokensPerRequest.toString() ||
      maxRequests !== currentSettings.aiMaxRequestsPerDay.toString()
    );
  };

  const handleBudgetChange = (value: string) => {
    setMonthlyBudget(value);
    setHasChanges(true);
  };

  const handleTokensChange = (value: string) => {
    setMaxTokens(value);
    setHasChanges(true);
  };

  const handleRequestsChange = (value: string) => {
    setMaxRequests(value);
    setHasChanges(true);
  };

  if (!isAllowedTeam) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Assistant Settings
          </CardTitle>
          <CardDescription>
            Configure AI-powered features for your team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              AI features are currently restricted to specific teams. Please contact Zac or Mariah to enable this feature for your team.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          AI Assistant Settings
        </CardTitle>
        <CardDescription>
          Configure AI-powered features, usage limits, and budget controls
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <Label htmlFor="ai-enabled" className="flex flex-col gap-1 cursor-pointer">
            <span className="font-semibold text-mystic-900 dark:text-cream-100">
              {aiEnabled ? "Enabled" : "Disabled"}
            </span>
            <span className="text-sm text-mystic-700 dark:text-cream-200 font-normal">
              {aiEnabled
                ? "AI assistant is available for this team"
                : "Enable AI assistant to use AI-powered meal planning features"}
            </span>
          </Label>
          <Switch
            id="ai-enabled"
            checked={aiEnabled}
            onCheckedChange={handleEnabledChange}
          />
        </div>

        {aiEnabled && (
          <>
            {/* Budget Settings */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div>
                <Label htmlFor="monthly-budget" className="text-sm font-semibold">
                  Monthly Budget (USD)
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum amount to spend on AI requests per month
                </p>
              </div>
              <Input
                id="monthly-budget"
                type="number"
                step="0.01"
                min="0"
                value={monthlyBudget}
                onChange={(e) => handleBudgetChange(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {/* Token Limit */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div>
                <Label htmlFor="max-tokens" className="text-sm font-semibold">
                  Max Tokens Per Request
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum number of tokens (words) per AI response
                </p>
              </div>
              <Input
                id="max-tokens"
                type="number"
                step="100"
                min="100"
                max="10000"
                value={maxTokens}
                onChange={(e) => handleTokensChange(e.target.value)}
                className="max-w-xs"
              />
            </div>

            {/* Request Rate Limit */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
              <div>
                <Label htmlFor="max-requests" className="text-sm font-semibold">
                  Daily Request Limit
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Maximum number of AI requests per day
                </p>
              </div>
              <Input
                id="max-requests"
                type="number"
                step="10"
                min="10"
                max="1000"
                value={maxRequests}
                onChange={(e) => handleRequestsChange(e.target.value)}
                className="max-w-xs"
              />
            </div>
          </>
        )}

        {hasChanges && (
          <div className="flex justify-end pt-4 border-t">
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
