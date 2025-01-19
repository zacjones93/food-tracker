export const SITE_NAME = "SaaS Template"
export const SITE_DESCRIPTION = "A modern SaaS template built with Next.js 14 and Cloudflare Workers, designed for scalability and performance."
export const SITE_URL = process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://saas-stack.startupstudio.dev"
export const SITE_DOMAIN = new URL(SITE_URL).hostname
export const SESSION_COOKIE_NAME = "session";
export const GITHUB_REPO_URL = "https://github.com/LubomirGeorgiev/cloudflare-workers-nextjs-saas-template"
export const PASSWORD_RESET_TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60 // 24 hours
export const EMAIL_VERIFICATION_TOKEN_EXPIRATION_SECONDS = 24 * 60 * 60 // 24 hours
