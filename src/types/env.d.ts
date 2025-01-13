export interface CloudflareEnv {
  DATABASE: D1Database;
  NEXT_CACHE_WORKERS_KV: KVNamespace;
  RESEND_API_KEY: string;
  APP_URL: string;
}
