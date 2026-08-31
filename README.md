# little-durable tutorial

## Prereqs

- Node.js 20+
- Modal token (`MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET`)
- Anthropic API key (`ANTHROPIC_API_KEY`)
- GitHub PAT with push access (`GITHUB_TOKEN`)
- A repo you can push to (passed as an argument)

Create a PAT at [github.com/settings/tokens](https://github.com/settings/tokens). Classic: `repo` scope. Fine-grained: **Contents: Read and write** on that repo.

## Setup

```bash
npm install
cp .env.example .env
```

## Run

Pass the repo and the issue to fix:

```bash
npm run modal -- https://github.com/your-user/your-repo "There is a typo in the README"
```

```bash
npm run modal -- https://github.com/your-user/your-repo "Add a LICENSE file"
```

Same `RUN_ID` (default `run-123`) resumes; a new id starts over:

```bash
RUN_ID=run-456 npm run modal -- https://github.com/your-user/your-repo "Add a LICENSE file"
```
