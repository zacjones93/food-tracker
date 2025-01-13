export const SITE_NAME = "SaaS Template"
export const SITE_DESCRIPTION = "A modern SaaS template built with Next.js 14 and Cloudflare Workers, designed for scalability and performance."
export const SITE_URL = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://saas-stack.startupstudio.dev"
export const SITE_DOMAIN = new URL(SITE_URL).hostname
