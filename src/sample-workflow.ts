import type { WorkflowDefinition } from "little-durable";
import {
  defineWorkflow,
  FileJournalStore,
  Runtime,
  step,
} from "little-durable";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { git, runCommand } from "./lib.js";

export function fixIssuesInRepoWorkflow({}: WorkflowOptions): WorkflowDefinition<
  typeof NewIssueSchema
> {
  return defineWorkflow({
    name: "auto-fix-issues-in-repo",
    input: NewIssueSchema,
    run: async (input) => {
      await step({
        name: "Clone repo",
        input: {
          githubUrl: input.githubUrl,
        },
        run: async ({ githubUrl }) =>
          await runCommand(
            `rm -rf targetRepo && ${git(`clone ${githubUrl} targetRepo`)}`,
          ),
      });

      await step({
        name: "Install dependencies",
        input: {},
        run: async () => await runCommand("cd targetRepo && npm install"),
      });

      await step({
        name: "Run claude code",
        input: {
          issue: input.issue,
        },
        run: async ({ issue }) =>
          await runCommand(
            `cd targetRepo && claude -p --bare --allowedTools "Read,Edit,Bash" --permission-mode dontAsk ${JSON.stringify(`Create a fix for this issue: ${issue} Do not commit the changes or try to push them to the repo`)}`,
          ),
      });

      await step({
        name: "commit and push on new branch",
        input: {},
        run: async () => {
          const branchName = `fix-${input.issue.replace(/ /g, "-")}`;
          await runCommand(`cd targetRepo && git checkout -b ${branchName}`);
          await runCommand(`cd targetRepo && git add .`);
          await runCommand(
            `cd targetRepo && git -c user.name="little-durable" -c user.email="little-durable@users.noreply.github.com" commit -m ${JSON.stringify(`Fix issue: ${input.issue}`)}`,
          );
          await runCommand(
            `cd targetRepo && ${git(`push -u origin ${branchName}`)}`,
          );
          return {
            branchName,
          };
        },
      });
    },
  });
}

const NewIssueSchema = z
  .object({
    githubUrl: z
      .string()
      .describe("Url of the github repo to clone and fix issue in"),
    issue: z.string().describe("Description of the problem in the repo to fix"),
  })
  .strict();

type WorkflowOptions = {};

if (process.env.WORK_DIR) {
  process.chdir(process.env.WORK_DIR);
}

const journalDir = process.env.JOURNAL_DIR ?? join(process.cwd(), ".journal");
await mkdir(journalDir, { recursive: true });

const runtime = new Runtime({
  journalStore: new FileJournalStore(journalDir),
});

const [githubUrl, issue] = process.argv.slice(2);
if (!githubUrl || !issue) {
  throw new Error("usage: tsx src/sample-workflow.ts <github-url> <issue>");
}

const runId = process.env.RUN_ID ?? "run-1";
const workflow = fixIssuesInRepoWorkflow({});
const existing = await runtime.getRun({ runId }).catch(() => undefined);
const events = existing
  ? runtime.resume(workflow, { runId })
  : runtime.start(workflow, {
      runId,
      input: { githubUrl, issue },
    });

for await (const event of events) {
  if (event.type === "step.started") {
    console.log(`\n[step] ${event.name}`);
  } else if (event.type === "step.completed") {
    console.log(`[done] ${event.name} (${event.durationMs}ms)`);
  } else if (event.type === "step.failed") {
    console.log(`[fail] ${event.name}: ${event.error.message}`);
  } else {
    console.log(`[${event.type}]`);
  }

  if (event.type === "runtime.suspended") {
    // Reach out to your control plane and schedule the run to resume.
    console.log("Workflow suspended", event.suspension);
  }
}
