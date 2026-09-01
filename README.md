# Build a durable coding-agent workflow with Modal

This tutorial runs a coding agent inside a Modal sandbox and wraps its work in
durable `little-durable` steps. If a run fails, the journal is saved so the same
run can continue from the failed step instead of starting over.

## What you will learn

- Run a multi-step TypeScript workflow in an isolated Modal sandbox.
- Persist the workflow journal on a Modal Volume.
- Resume a failed run without repeating completed steps.
- Keep workflow code separate from tutorial-only CLI presentation.

The pieces fit together like this:

```text
your terminal
└── src/modal.ts                 creates and cleans up the Modal sandbox
    └── src/sample-workflow.ts   defines the durable workflow steps
        └── /work/journal        persists run history on a Modal Volume
```

## Before you begin

You need:

- Node.js 20 or newer.
- A [Modal](https://modal.com/) account and token.
- An Anthropic API key.
- A GitHub personal access token with push access.
- A GitHub repository you can safely create a branch in and push to.

For a classic GitHub token, enable the `repo` scope. For a fine-grained token,
grant **Contents: Read and write** on the repository. You can create a token in
[GitHub settings](https://github.com/settings/tokens).

> This workflow asks Claude Code to modify the target repository, then creates
> and pushes a branch. Use a test repository while learning.

## Set up the project

Install the dependencies and create your local environment file:

```bash
npm install
cp .env.example .env
```

Open `.env` and replace each placeholder:

```dotenv
MODAL_TOKEN_ID=...
MODAL_TOKEN_SECRET=...
ANTHROPIC_API_KEY=...
GITHUB_TOKEN=...
```

The `.env` file is ignored by Git. Do not commit your credentials.

## Run the tutorial

Pass the repository URL and a short issue description:

```bash
npm run modal -- https://github.com/your-user/your-repo "There is a typo in the README"
```

The launcher creates a sandbox, installs the project, runs four durable steps,
saves the journal, and stops the sandbox. A successful run pushes a new branch
whose name starts with `fix-`.

### Read the output

Color makes the phases easier to scan, while the labels keep the output clear
in terminals where color is unavailable:

| Label | Meaning |
| --- | --- |
| `[sandbox]` | Modal is preparing or cleaning up infrastructure. |
| `[run]` | A durable run started or resumed. |
| `[step]` | A workflow step is now running. |
| `[command]` | The shell command run by that step. |
| `[done]` | A task or the full workflow completed. |
| `[waiting]` | The workflow is safely paused and can resume. |
| `[failed]` | Something stopped; the following text explains how to recover. |

Indented lines belong to the labeled item above them. See
[`sample-runs/sample-run.txt`](sample-runs/sample-run.txt) for a representative
failure-and-resume transcript.

## Resume or restart

The default run ID is `run-123`. Run the same command again with the same ID to
resume: completed steps are read from the journal and are not repeated.

Use a new ID when you want a fresh run:

```bash
RUN_ID=run-456 npm run modal -- https://github.com/your-user/your-repo "Add a LICENSE file"
```

Run IDs share the persistent `little-durable-work` Modal Volume, so choose a
unique ID for each new issue.

## Where to look next

- [`src/sample-workflow.ts`](src/sample-workflow.ts) contains only the workflow
  definition and runtime wiring.
- [`src/modal.ts`](src/modal.ts) owns the Modal sandbox lifecycle.
- [`src/tutorial-output.ts`](src/tutorial-output.ts) owns Chalk colors, labels,
  durations, errors, and recovery guidance.
- [`src/lib.ts`](src/lib.ts) contains reusable command and sandbox helpers.
