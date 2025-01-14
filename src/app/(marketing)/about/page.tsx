import { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { GITHUB_REPO_URL, SITE_DESCRIPTION, SITE_NAME } from "@/constants";
import { CheckCircle2, Clock, Github } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: `About - ${SITE_NAME}`,
  description: SITE_DESCRIPTION
};

function FeatureItem({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <CheckCircle2 className="h-4 w-4 text-green-500" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

function PlannedFeature({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-2">
      <Clock className="h-4 w-4 text-blue-500" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

export default function AboutPage() {
  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">About {SITE_NAME}</h1>
          <p className="text-muted-foreground">
            {SITE_DESCRIPTION}
          </p>
          <div className="pt-4">
            <Link
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              <Github className="h-4 w-4" />
              <span>View on GitHub</span>
            </Link>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Current Features</CardTitle>
              <CardDescription>What&apos;s already implemented</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <FeatureItem text="Authentication with Lucia Auth" />
              <FeatureItem text="Database with Drizzle and D1" />
              <FeatureItem text="Modern UI with Tailwind & Shadcn" />
              <FeatureItem text="Type-safe with TypeScript" />
              <FeatureItem text="User profiles and settings" />
              <FeatureItem text="Secure session management" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Coming Soon</CardTitle>
              <CardDescription>Features in development</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <PlannedFeature text="Stripe billing integration" />
              <PlannedFeature text="Team collaboration" />
              <PlannedFeature text="Admin dashboard" />
              <PlannedFeature text="Email notifications" />
              <PlannedFeature text="Webhooks" />
              <PlannedFeature text="API rate limiting" />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Edge Computing</CardTitle>
              <CardDescription>Global performance at scale</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Built on Cloudflare Workers with OpenNext, our platform delivers lightning-fast responses worldwide.
                We leverage edge computing capabilities including D1 for database, KV for session storage, and R2 for file storage.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Developer Experience</CardTitle>
              <CardDescription>Built for developers</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Start building your SaaS quickly with our well-structured template. Features React Server Components,
                DrizzleORM for type-safe database access, and comprehensive documentation to get you started fast.
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Documentation</CardTitle>
            <CardDescription>Getting started with the template</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Quick Start</h3>
              <ol className="list-decimal space-y-2 pl-4">
                <li>Install dependencies: <code className="rounded bg-muted px-2 py-1">pnpm install</code></li>
                <li>Copy <code className="rounded bg-muted px-2 py-1">.env.example</code> to <code className="rounded bg-muted px-2 py-1">.env</code> and fill in the values</li>
                <li>Create database: <code className="rounded bg-muted px-2 py-1">pnpm db:migrate:dev</code></li>
                <li>Start development server: <code className="rounded bg-muted px-2 py-1">pnpm dev</code></li>
                <li>Open <Link href="http://localhost:3000">http://localhost:3000</Link></li>
              </ol>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Cloudflare Configuration</h3>
              <p className="text-sm text-muted-foreground">
                After making changes to <code className="rounded bg-muted px-2 py-1">wrangler.toml</code>, run <code className="rounded bg-muted px-2 py-1">pnpm cf-typegen</code> to generate new types.
              </p>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold">Resources</h3>
              <ul className="space-y-1 text-sm">
                <li>
                  <Link
                    href="https://opennextjs.com"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    OpenNext Documentation
                  </Link>
                </li>
                <li>
                  <Link
                    href="https://github.com/cloudflare/workers-sdk/tree/main/packages/create-cloudflare/templates-experimental/next/templates"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Cloudflare Workers Templates
                  </Link>
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
