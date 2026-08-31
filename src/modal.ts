import "dotenv/config";
import { ModalClient } from "modal";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyToSandbox, runSandboxCommand } from "./lib.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modal = new ModalClient();
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

const sb = await modal.sandboxes.create(app, image, {
  volumes: { "/work": volume },
  timeoutMs: 30 * 60 * 1000,
});

try {
  await copyToSandbox(sb, root, [
    "package.json",
    "tsconfig.json",
    "src/lib.ts",
    "src/sample-workflow.ts",
  ]);
  await runSandboxCommand(sb, ["npm", "install"], { workdir: "/app" });

  const secretEntries: Record<string, string> = { GITHUB_TOKEN: githubToken };
  if (process.env.ANTHROPIC_API_KEY) {
    secretEntries.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }

  await runSandboxCommand(
    sb,
    ["npx", "tsx", "src/sample-workflow.ts", githubUrl, issue],
    {
      workdir: "/app",
      env: {
        WORK_DIR: "/work",
        JOURNAL_DIR: "/work/journal",
        RUN_ID: process.env.RUN_ID ?? "run-123",
      },
      secrets: [await modal.secrets.fromObject(secretEntries)],
      pty: true,
    },
  );
} finally {
  await sb.terminate();
}
