# repo-onboarding

Turn any codebase into an interactive onboarding site — **your own AI coding
agent does the deep reading, the hosted viewer renders it.**

There is no server-side generation and nothing to pay for. You run a coding agent
you already have (Claude Code, Cursor, Codex, …) against your repo; it produces a
single validated `analysis.json`; you publish that to the hosted viewer at
**https://repo-onboarding-tau.vercel.app**. This CLI is the glue: it computes the
hard facts, hands your agent a precise protocol, validates the result, and
uploads it.

## Quickstart

```bash
# 1. In your repo, prepare the analysis workspace.
npx repo-onboarding init

#    This writes .repo-onboarding/ with:
#      prepass.json   deterministic facts (files, LOC, languages, git churn)
#      PROMPT.md      the analysis protocol for your agent
#      schema.json    the analysis.json schema to target

# 2. Tell your AI coding agent:
#      "Follow .repo-onboarding/PROMPT.md to produce analysis.json."
#    It reads the code and writes analysis.json at the repo root.

# 3. Validate what it produced (schema + dependency-graph edge integrity).
npx repo-onboarding validate analysis.json

# 4. Publish it to the hosted viewer.
npx repo-onboarding upload analysis.json
```

## Commands

| Command | What it does |
| --- | --- |
| `repo-onboarding init [path]` | Prepare a repo for analysis (default path: `.`). Writes `.repo-onboarding/`. Also the default when run with no command. |
| `repo-onboarding prepass <path> [--out <file>] [--commits <n>] [--pretty]` | Run only the deterministic facts pre-pass and print JSON. |
| `repo-onboarding validate <file> [--json]` | Validate an `analysis.json` against the schema and edge integrity. `--json` prints `{ valid, issues }`. |
| `repo-onboarding upload <file> [--api <base>] [--token <token>]` | Validate locally, then publish to the hosted viewer. |
| `repo-onboarding --help` / `--version` | Usage / version. |

## Uploading: token setup

Uploads are authenticated with a personal token:

1. Sign in at **https://repo-onboarding-tau.vercel.app/account** and create a token
   (it looks like `roa_` followed by 40 hex characters).
2. Provide it to the CLI in either way:

   ```bash
   # environment variable (recommended)
   export REPO_ONBOARDING_TOKEN=roa_...        # bash / zsh
   $env:REPO_ONBOARDING_TOKEN="roa_..."        # PowerShell

   # or per-invocation
   npx repo-onboarding upload analysis.json --token roa_...
   ```

`upload` always validates the document locally first and refuses to send an
invalid one. Point at a different backend with `--api <base>` if you self-host.

## What `init` writes

Everything lands in `.repo-onboarding/` inside your repo — treat it as local
scratch and add `.repo-onboarding/` to your `.gitignore`. The pre-pass is
zero-dependency and never modifies your repo; it only reads.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success / document valid |
| `1` | Document invalid, or an upload was rejected / failed |
| `2` | Usage, IO, or configuration error (bad path, missing/invalid token, unreadable file) |

## Requirements

- Node.js ≥ 20
- `git` on your PATH (optional — without it, churn/hotspot data is simply omitted)

## License

MIT
