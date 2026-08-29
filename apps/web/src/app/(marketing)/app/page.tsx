import type { Metadata } from "next";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/constants";

const APP_STORE_ID = "6793734640";
const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
const APP_SHARE_URL = `${SITE_URL}/app`;
const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;

export const metadata: Metadata = {
  title: `${SITE_NAME} for iPhone`,
  description: SITE_DESCRIPTION,
  alternates: {
    canonical: APP_SHARE_URL,
  },
  openGraph: {
    type: "website",
    url: APP_SHARE_URL,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    images: [
      {
        url: OG_IMAGE_URL,
        width: 1200,
        height: 630,
        alt: SITE_NAME,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE_URL],
  },
  itunes: {
    appId: APP_STORE_ID,
    appArgument: APP_SHARE_URL,
  },
};

export default function AppSharePage() {
  return (
    <main className="relative isolate overflow-hidden py-24 sm:py-32">
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6 text-center lg:px-8">
        <Image
          src="/assets/logo.png"
          alt=""
          width={96}
          height={96}
          className="mb-8 rounded-3xl shadow-mystic"
          priority
        />
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-mystic-600 dark:text-cream-300">
          {SITE_NAME} for iPhone
        </p>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          Plan meals. Shop smarter.
        </h1>
        <p className="mt-6 max-w-2xl text-balance text-lg leading-8 text-muted-foreground">
          Keep recipes, weekly meal plans, and grocery shopping organized in one shared kitchen.
        </p>
        <Button asChild variant="mystic" size="lg" className="mt-10 rounded-full">
          <a href={APP_STORE_URL}>View on the App Store</a>
        </Button>
      </div>
    </main>
  );
}
