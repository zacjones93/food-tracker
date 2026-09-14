interface RecipeShareBrowser {
  share?: (data: ShareData) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

export function recipeShareUrl({ origin, recipeId }: { origin: string; recipeId: string }): string {
  return new URL(`/recipes/${encodeURIComponent(recipeId)}`, origin).href;
}

export async function shareRecipeLink({
  browser,
  title,
  url,
}: {
  browser: RecipeShareBrowser;
  title: string;
  url: string;
}): Promise<"shared" | "copied" | "cancelled" | "manual"> {
  if (browser.share) {
    try {
      await browser.share({ title, url });
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return "cancelled";
    }
  }

  try {
    if (browser.clipboard) {
      await browser.clipboard.writeText(url);
      return "copied";
    }
  } catch {
    // Browsers may deny clipboard access; keep the link available to copy manually.
  }
  return "manual";
}
