# Food Tracker

[![.github/workflows/deploy.yml](https://github.com/LubomirGeorgiev/cloudflare-workers-nextjs-saas-template/actions/workflows/deploy.yml/badge.svg)](https://github.com/LubomirGeorgiev/cloudflare-workers-nextjs-saas-template/actions/workflows/deploy.yml)

# [Live Demo](https://nextjs-saas-template.lubomirgeorgiev.com/sign-up)
# [Github Repo](https://github.com/LubomirGeorgiev/cloudflare-workers-nextjs-saas-template)

Food Tracker is a pnpm/Turborepo monorepo. The existing Next.js application lives in `apps/web` and deploys to Cloudflare Workers through [OpenNext](https://opennext.js.org/cloudflare).

See [`apps/mobile/README.md`](apps/mobile/README.md) for the Swift app and [`docs/mobile-sync.md`](docs/mobile-sync.md) for the authenticated offline-sync contract.

## Workspace layout

```text
apps/
  web/       Next.js, OpenNext, Wrangler, D1 migrations, and web assets
  mobile/    Native Apple application
```

Run `pnpm install` once at the repository root. Existing root commands such as `pnpm dev`, `pnpm build`, `pnpm deploy`, and the `pnpm db:*` scripts continue to target the web application. To run a web-only command directly, use `pnpm --filter @food-tracker/web <command>`.

Have a look at the [project plan](./cursor-docs/project-plan.md) to get an overview of the project.

> [!TIP]
> This template is brought to you by 👉 [AgenticDev](https://agenticdev.agency/?ref=github-readme-nextjs-template) 👈 - where we help businesses automate operations and boost productivity through custom AI implementations. Just like this open-source project demonstrates technical excellence, we deliver:
>
> - Process automation with LLM-powered workflows
> - AI strategy consulting for sustainable scaling
> - Custom SaaS development using cutting-edge stacks
>
> Hundrets of developers already trust our codebase - Just Imagine what we could build for your business.

# Supported Features:

- 🔐 Authentication with Lucia Auth
  - 📧 Email/Password Sign In
  - 📝 Email/Password Sign Up
  - 🔑 WebAuthn/Passkey Authentication
  - 🌐 Google OAuth/SSO Integration
  - 🔄 Forgot Password Flow
  - 🔒 Change Password
  - ✉️ Email Verification
  - 🗝️ Session Management with Cloudflare KV
  - 🤖 Turnstile Captcha Integration
  - ⚡ Rate Limiting for Auth Endpoints
  - 🛡️ Protected Routes and Layouts
  - 📋 Session Listing and Management
  - 🔒 Anti-Disposable Email Protection
- 💾 Database with Drizzle and Cloudflare D1
  - 🏗️ Type-safe Database Operations
  - 🔄 Automatic Migration Generation
  - 💻 SQLite for Local Development
  - ⚡ Efficient Data Fetching
  - 🔍 Type-safe Queries
- 📨 Email Service with React Email and Resend or Brevo
  - 🎨 Beautiful Email Templates
  - 👀 Email Preview Mode
  - 🔧 Local Email Development Server
  - 📬 Transactional Emails
  - ✉️ Email Verification Flow
  - 📱 Responsive Email Templates
- 🚀 Deployment with Github Actions
  - ⚙️ Automatic Deployments
  - 🔐 Environment Variables Management
  - 📦 Database Migrations
  - 🔄 Comprehensive CI/CD Pipeline
  - 🧹 Cache Purging
  - ✅ Type Checking
- 🎨 Modern UI
  - 🎨 Tailwind CSS
  - 🧩 Shadcn UI Components
  - 🌓 Dark/Light Mode
  - 📱 Responsive Design
  - ⚡ Loading States and Animations
  - 🔔 Toast Notifications
  - ⚙️ Settings Dashboard
  - 🏠 Landing Page
  - ✨ Beautiful Email Templates
  - 👤 Profile Settings Page
  - 🎯 Form Validation States
- 💳 Credit Billing System
  - 💰 Credit-based Pricing Model
  - 🔄 Monthly Credit Refresh
  - 📊 Credit Usage Tracking
  - 💳 Stripe Payment Integration
  - 📜 Transaction History
  - 📦 Credit Package Management
  - 💸 Pay-as-you-go Model
  - 📈 Usage Analytics
- 👑 Admin Dashboard
  - 👥 User Management
- ✨ Validations with Zod and React Hook Form
  - 🛡️ Type-safe Form Validations
  - 🔒 Server-side Validations
  - 🔍 Client-side Validations
  - 🧹 Input Sanitization
  - ⚡ Real-time Validation
  - 🔄 Form State Management
- 👨‍💻 Developer Experience
  - 🧪 Local Development Setup
  - 📘 TypeScript Support
  - 🔍 ESLint Configuration
  - ✨ Prettier Configuration
  - 🔐 Type-safe Environment Variables
  - 🏗️ Cloudflare Types Generation
  - 🤖 AI-powered Development with Cursor
  - 📚 Comprehensive Documentation
  - 📐 Project Structure Best Practices
- ⚡ Edge Computing
  - 🌍 Global Deployment with Cloudflare Workers
  - 🚀 Zero Cold Starts
  - 💨 Edge Caching
  - ⚛️ React Server Components
  - 🖥️ Server-side Rendering
  - 💾 Edge Database with D1
  - 🗄️ Session Storage with KV
  - ⚡ API Rate Limiting
- 🏢 Multi-tenancy Support
  - 👥 Organization Management
  - 👤 User Roles and Permissions
  - 🔍 Tenant Isolation
  - 🔄 Resource Sharing Controls
  - 📊 Per-tenant Analytics
  - 🔐 Tenant-specific Configurations
  - 💼 Team Collaboration Features

## Planned features (TODO):

- [ ] Add an eslint rule to check for unused imports and exports
- [ ] Add an eslint rule to check for unused variables and functions
- [ ] Upgrade to Tailwind 4 and fix the errors and visual regressions. Already started here https://github.com/LubomirGeorgiev/cloudflare-workers-nextjs-saas-template/tree/tailwind-4-upgrade
- [ ] Update Meta SEO tags 🔍
- [ ] Dynamic OpenGraph images 📸
- [ ] sitemap.xml 📄
- [ ] robots.txt 📄
- [ ] Multi-language support (i18n) 🌐
- [ ] Notifications 🔔
- [ ] Webhooks 🔗

# Running it locally

1. `pnpm install`
2. Copy `apps/web/.dev.vars.example` to `apps/web/.dev.vars` and fill in the values.
3. Copy `apps/web/.env.example` to `apps/web/.env` and fill in the values.
4. `pnpm db:migrate:local` - Creates a local SQLite database and applies migrations
5. `pnpm dev`
6.  Open http://localhost:3000

## Changes to wrangler.jsonc

After making a change to `apps/web/wrangler.jsonc`, run `pnpm cf-typegen` to generate the new types.

## Things to change and customize before deploying to production
1. Go to `apps/web/src/constants.ts` and update it with your project details
2. Update `.cursor/rules/001-main-project-context.mdc` with your project specification so that Cursor AI can give you better suggestions
3. Update the footer in `apps/web/src/components/footer.tsx` with your project details and links
4. Optional: Update the color palette in `apps/web/src/app/globals.css`
5. Update the metadata in `apps/web/src/app/layout.tsx` with your project details

## Deploying to Cloudflare with Github Actions

1. Create D1 and KV namespaces
2. Set either `RESEND_API_KEY` or `BREVO_API_KEY` as a secret in your Cloudflare Worker depending on which email service you want to use.
3. Create a Turnstile catcha in your Cloudflare account, and set the `NEXT_PUBLIC_TURNSTILE_SITE_KEY` as a Github Actions variable.
4. Set `TURNSTILE_SECRET_KEY` as a secret in your Cloudflare Worker.
5. Update `apps/web/wrangler.jsonc` with the new database and KV namespaces, environment variables, and account ID. The Worker name must match `services->[0]->service` in the same file.
6. Go to https://dash.cloudflare.com/profile/api-tokens and click on "Use template" next to "Edit Cloudflare Workers". On the next, page add the following permissions in addition to the ones from the template:
    - Account:AI Gateway:Edit
    - Account:Workers AI:Edit
    - Account:Workers AI:Read
    - Account:Queues:Edit
    - Account:Vectorize:Edit
    - Account:D1:Edit
    - Account:Cloudflare Images:Edit
    - Account:Workers KV Storage:Edit
    - Zone:Cache Purge:Purge
7. Add the API token to the Github repository secrets as `CLOUDFLARE_API_TOKEN`
8. Add the Cloudflare account id to the Github repository variables as `CLOUDFLARE_ACCOUNT_ID`
9. Optional: If you want clear the CDN cache on deploy, add `CLOUDFLARE_ZONE_ID` to the Github repository variables for the zone id of your domain. This is the zone id of your domain, not the account id.
10. Push to the main branch

## Email templates
If you want to preview and edit the email templates you can:
1. `pnpm email:dev`
2. Open http://localhost:3001
3. Edit the email templates in `apps/web/src/react-email`
4. For inspiration you can checkout https://react.email/templates
