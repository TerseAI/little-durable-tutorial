import "dotenv/config";
import { ModalClient } from "modal";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { copyToSandbox, runSandboxCommand } from "./lib.js";
import {
  OUTPUT_INDENT,
  printProblem,
  printSandboxDone,
  printSandboxStep,
  printSection,
  printTutorialHeader,
  printUsage,
} from "./tutorial-output.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [githubUrl, issue] = process.argv.slice(2);
if (!githubUrl || !issue) {
  printUsage({
    message: "A repository URL and issue description are required.",
    command:
      'npm run modal -- https://github.com/your-user/your-repo "Describe the issue to fix"',
  });
  process.exit(1);
}

const githubToken = process.env.GITHUB_TOKEN;
if (!githubToken) {
  printProblem(
    "GitHub authentication is missing",
    "GITHUB_TOKEN is not set.",
    "Add GITHUB_TOKEN to .env, then run the command again.",
  );
  process.exit(1);
}

const runId = process.env.RUN_ID ?? "run-123";
printTutorialHeader({ repository: githubUrl, runId });

printSandboxStep(
  "Preparing Modal resources",
  "App: little-durable-tutorial · Volume: little-durable-work",
);
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
printSandboxDone("Modal resources ready");

printSandboxStep(
  "Creating sandbox",
  "Node.js 22 + Claude Code · durable journal mounted at /work",
);
const sb = await modal.sandboxes.create(app, image, {
  volumes: { "/work": volume },
  timeoutMs: 30 * 60 * 1000,
});
printSandboxDone("Sandbox ready");

let runError: unknown;
try {
  printSandboxStep("Copying tutorial files", "Destination: /app");
  await copyToSandbox(sb, root, [
    "package.json",
    "tsconfig.json",
    "src/lib.ts",
    "src/sample-workflow.ts",
    "src/tutorial-output.ts",
  ]);
  printSandboxDone("Tutorial files copied");

  printSandboxStep("Installing dependencies", "Working directory: /app");
  await runSandboxCommand(sb, ["npm", "install"], {
    workdir: "/app",
    prefix: OUTPUT_INDENT,
  });
  printSandboxDone("Dependencies installed");

  const secretEntries: Record<string, string> = { GITHUB_TOKEN: githubToken };
  if (process.env.ANTHROPIC_API_KEY) {
    secretEntries.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  }

  printSection(
    "Workflow output",
    "The lines below come from src/sample-workflow.ts inside the sandbox.",
  );
  await runSandboxCommand(
    sb,
    ["npx", "tsx", "src/sample-workflow.ts", githubUrl, issue],
    {
      workdir: "/app",
      env: {
        WORK_DIR: "/work",
        JOURNAL_DIR: "/work/journal",
        RUN_ID: runId,
        // chalk only colorizes a TTY, and the sandbox output is piped back here.
        FORCE_COLOR: "1",
      },
      secrets: [await modal.secrets.fromObject(secretEntries)],
      pty: true,
    },
  );
} catch (error) {
  runError = error;
}

printSection(
  "Sandbox cleanup",
  "The journal is saved even when a workflow step fails.",
);

// A v2 Volume only persists writes when `sync` runs on the mountpoint, and the
// journal lives there. Flush it even when the run failed, otherwise resuming
// replays a stale journal.
try {
  printSandboxStep("Saving durable journal", "Syncing /work to the Modal Volume");
  await runSandboxCommand(sb, ["sync", "/work"], { prefix: OUTPUT_INDENT });
  printSandboxDone("Journal saved");
} catch (error) {
  if (!runError) throw error;
  printProblem("Journal could not be saved", error);
} finally {
  printSandboxStep("Stopping sandbox");
  await sb.terminate();
  printSandboxDone("Sandbox stopped");
}

if (runError) {
  printProblem(
    "Tutorial run did not finish",
    runError,
    `Fix the reported problem, then run the same command with RUN_ID=${runId} to resume.`,
  );
  process.exitCode = 1;
} else {
  printSandboxDone(
    "Tutorial run finished",
    `Run ${runId} is saved. Choose a new RUN_ID to start from the beginning.`,
  );
}
