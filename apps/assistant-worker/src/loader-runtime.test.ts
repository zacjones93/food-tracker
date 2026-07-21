import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

async function reservePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        server.close();
        reject(new Error("Unable to reserve a local port"));
        return;
      }
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function waitForSmokeResponse({ port, logs }: { port: number; logs: () => string }) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/`);
      if (response.status >= 200) return response;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error(`Loader smoke Worker did not start: ${logs().slice(-2_000)}`);
}

test("Wrangler exposes Worker Loader and DynamicWorkerExecutor runs acceptance code", { timeout: 60_000 }, async () => {
  const port = await reservePort();
  let output = "";
  const child = spawn(
    "pnpm",
    ["exec", "wrangler", "dev", "--local", "--config", "loader-smoke.wrangler.jsonc", "--port", String(port)],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        WRANGLER_LOG_PATH: join(tmpdir(), `food-tracker-loader-smoke-${process.pid}.log`),
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout.on("data", (chunk) => { output += String(chunk); });
  child.stderr.on("data", (chunk) => { output += String(chunk); });

  try {
    const response = await waitForSmokeResponse({ port, logs: () => output });
    const result = await response.json();
    assert.deepEqual(result, {
      ok: true,
      binding: "function",
      cases: {
        chickenSearch: true,
        currentSchedule: true,
        twoRecipeComparison: true,
      },
      errors: {
        chickenSearch: false,
        currentSchedule: false,
        twoRecipeComparison: false,
      },
    });
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
  }
});
