"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Forward } from "@/components/ui/themed-icons";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { recipeShareUrl, shareRecipeLink } from "@/lib/recipe-sharing";

interface ShareRecipeButtonProps {
  recipe: { id: string; name: string; visibility: string };
}

export function ShareRecipeButton({ recipe }: ShareRecipeButtonProps) {
  const [isSharing, setIsSharing] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  async function handleShare() {
    setIsSharing(true);
    const url = recipeShareUrl({ origin: window.location.origin, recipeId: recipe.id });
    try {
      const result = await shareRecipeLink({ browser: navigator, title: recipe.name, url });
      if (result === "copied") toast.success("Recipe link copied", {
        description: recipe.visibility === "private" ? "Only members of your team can open this private recipe." : undefined,
      });
      if (result === "manual") setManualUrl(url);
    } finally {
      setIsSharing(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={handleShare} disabled={isSharing} aria-label="Share recipe">
        <Forward className="mr-2 h-4 w-4" />
        Share
      </Button>
      <Dialog open={Boolean(manualUrl)} onOpenChange={(open) => { if (!open) setManualUrl(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share {recipe.name}</DialogTitle>
            <DialogDescription>
              {recipe.visibility === "private"
                ? "Copy this link to share with your team. This recipe is private."
                : "Copy this link. Anyone with the link can open this recipe without an account."}
            </DialogDescription>
          </DialogHeader>
          <Input aria-label="Recipe link" value={manualUrl} readOnly onFocus={(event) => event.target.select()} />
        </DialogContent>
      </Dialog>
    </>
  );
}
