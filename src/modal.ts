import "dotenv/config";
import { ModalClient } from "modal";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyToSandbox, runSandboxCommand } from "./lib.js";

const log = (message: string) => console.log(`[modal] ${message}`);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modal = new ModalClient();
log("connecting to app little-durable-tutorial");
const app = await modal.apps.fromName("little-durable-tutorial", {
  createIfMissing: true,
});
const volume = await modal.volumes.fromName("little-durable-work", {
  createIfMissing: true,
});
const image = modal.images
  .fromRegistry("node:22")
  .dockerfileCommands([
    "RUN apt-get update && apt-get install -y git curl",
    "RUN curl -fsSL https://claude.ai/install.sh | bash",
    "ENV PATH=/root/.local/bin:$PATH",
  ]);

const [githubUrl, issue] = process.argv.slice(2);
if (!githubUrl || !issue) {
  throw new Error("usage: npm run modal -- <github-url> <issue>");
}

const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) throw new Error("GITHUB_TOKEN is required");

log("creating sandbox (node:22 + claude, volume little-durable-work at /work)");
const sb = await modal.sandboxes.create(app, image, {
  volumes: { "/work": volume },
  timeoutMs: 30 * 60 * 1000,
});

let runError: unknown;
try {
  log("copying project files into sandbox /app");
  await copyToSandbox(sb, root, [
    "package.json",
    "tsconfig.json",
    "src/lib.ts",
    "src/sample-workflow.ts",
  ]);
  log("installing dependencies in sandbox /app");
  await runSandboxCommand(sb, ["npm", "install"], {
    workdir: "/app",
    prefix: "[modal npm] ",
  });

  const secretEntries: Record<string, string> = { GITHUB_TOKEN: githubToken };
  if (process.env.ANTHROPIC_API_KEY) {
    secretEntries.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }

  const runId = process.env.RUN_ID ?? "run-123";
  log(`starting workflow in sandbox (RUN_ID=${runId})`);
  log("---------- everything below is the workflow ----------");
  await runSandboxCommand(
    sb,
    ["npx", "tsx", "src/sample-workflow.ts", githubUrl, issue],
    {
      workdir: "/app",
      env: {
        WORK_DIR: "/work",
        JOURNAL_DIR: "/work/journal",
        RUN_ID: runId,
      },
      secrets: [await modal.secrets.fromObject(secretEntries)],
      pty: true,
    },
  );
} catch (error) {
  runError = error;
}
log("---------- back in modal ----------");

// A v2 Volume only persists writes when `sync` runs on the mountpoint, and the
// journal lives there. Flush it even when the run failed, otherwise resuming
// replays a stale journal.
try {
  log("flushing journal to volume (sync /work)");
  await runSandboxCommand(sb, ["sync", "/work"], { prefix: "[modal sync] " });
} catch (error) {
  if (!runError) throw error;
  log(`sync /work failed: ${error}`);
} finally {
  log("terminating sandbox");
  await sb.terminate();
}

if (runError) throw runError;
