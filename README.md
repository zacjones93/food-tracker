# Cloudflare Workers SaaS Template

This is a SaaS template for Cloudflare Workers. It uses the [OpenNext](https://opennextjs.com/) framework to build a SaaS application.

It is based on https://github.com/flarelabs-net/workers-next

Supported Features:

- ✅ Authentication with NextAuth
- ✅ Database with Drizzle and Cloudflare D1
- ✅ Deployment with Github Actions
- ✅ Tailwind CSS

Planned features (TODO):

- [ ] Fotgot password
- [ ] Billing
- [ ] Admin dashboard
- [ ] Email
- [ ] Notifications
- [ ] Payments
- [ ] Webhooks

## Running it locally

1. `pnpm install`
2. Copy `.env.example` to `.env` and fill in the values
3. `pnpm db:migrate:dev` - Creates a local SQLite database and applies migrations
4. Update the documentation in `./cursor-docs` with your project details so that Cursor AI can give you better suggestions
5. `pnpm dev`
6. Open http://localhost:3000

## Changes to wrangler.toml

After making a change to wrangler.toml, you need to run `pnpm cf-typegen` to generate the new types.

## Deploying to Cloudflare with Github Actions
TODO

### How to upgrade this template
Go [here](https://github.com/cloudflare/workers-sdk/tree/main/packages/create-cloudflare/templates-experimental/next/templates) and check which have have recent commits.

[This](https://github.com/cloudflare/workers-sdk/tree/a5725bdb32f0b1c67063b988d09e1b76266aa19e/packages/create-cloudflare/templates-experimental/next/templates) is the git commit we are using
