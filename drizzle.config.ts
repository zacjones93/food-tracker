import { defineConfig } from 'drizzle-kit';
import fs from "node:fs";
import path from "node:path";

function getLocalD1DB() {
  try {
    const basePath = path.resolve(".wrangler/state/v3/d1");
    const files = fs
      .readdirSync(basePath, { encoding: "utf-8", recursive: true })
      .filter((f) => f.endsWith(".sqlite"))
      .map((f) => ({
        name: f,
        path: path.resolve(basePath, f),
        mtime: fs.statSync(path.resolve(basePath, f)).mtime
      }))
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    if (files.length === 0) {
      throw new Error(`.sqlite file not found in ${basePath}`);
    }

    // Return most recently modified database
    return files[0].path;
  } catch (err) {
    console.error(err)

    return null;
  }
}

export default defineConfig({
  out: './src/db/migrations',
  schema: './src/db/schema.ts',
  dialect: 'sqlite',
  ...(process.env.NODE_ENV === "production"
    ? {
      driver: "d1-http",
      dbCredentials: {
        accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
        databaseId: process.env.DATABASE_ID,
        token: process.env.CLOUDFLARE_API_TOKEN,
      },
    }
    : {
      dbCredentials: {
        url: getLocalD1DB(),
      },
    }),
});
