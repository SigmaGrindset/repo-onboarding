# Repository working agreement

## Local handoff is required

- After every implementation task in `web/`, launch this repository locally and leave the server running for the user.
- Use a dedicated free port; never assume an existing port or server belongs to this repository. In particular, port `3100` belongs to a different project and must not be used or restarted.
- Before handing off, request the changed page and confirm it returns successfully with the new UI or behavior present.
- End the final response with the exact clickable local URL. A code-only handoff without a working local URL is incomplete.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its name, recorded as a `Status:` line in the issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
