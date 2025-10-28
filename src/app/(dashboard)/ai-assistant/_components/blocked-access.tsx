"use client";

import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function BlockedAccess() {
  return (
    <div className="container mx-auto max-w-2xl p-6">
      <Card className="border-amber-200 bg-amber-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <CardTitle className="text-amber-900">AI Assistant Unavailable</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>Access Restricted</AlertTitle>
            <AlertDescription className="mt-2 space-y-2">
              <p>
                This feature is currently restricted to specific teams.
              </p>
              <p className="font-medium">
                Please talk to Zac or Mariah about using this feature.
              </p>
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
