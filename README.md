# Build a durable coding-agent workflow with Modal

This tutorial builds a coding agent in a Modal sandbox and wraps its work in `little-durable` steps. If a step in the run fails, the journal is saved so the same run continues from the failed step instead of starting over.

Steps are:

- Clone repo
- Install dependencies
- Call Claude Code to make coding agents
- Commit and push a new branch with changes
- Open a PR

## Preqreqs

You need:

- Node.js 20 or newer.
- A [Modal](https://modal.com/) account and token.
- An Anthropic API key.
- A GitHub personal access token with push access.
- A GitHub repository you can safely create a branch in and push to.

For a classic GitHub token, enable the `repo` scope. For a fine-grained token,
grant **Contents: Read and write** on the repository. You can create a token in
[GitHub settings](https://github.com/settings/tokens).

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

## Run the tutorial

Pass the repository URL and a short issue description:

```bash
npm run modal -- https://github.com/your-user/your-repo "There is a typo in the README"
```

## Resume or restart

The default run ID is `run-123`. Run the same command again with the same ID to
resume: completed steps are read from the journal and are not repeated.

Use a new ID when you want a fresh run:

```bash
RUN_ID=run-456 npm run modal -- https://github.com/your-user/your-repo "Add a LICENSE file"
```

Run IDs share the persistent `little-durable-work` Modal Volume, so choose a
unique ID for each new issue.
