# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the shared vocabulary for the analysis document, the
  engines that emit it, and the viewer that renders it.
- **`docs/adr/`**: read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a single-context repo: one glossary and one ADR directory, both at the root.

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-learning-resources-as-top-level-key.md
│   └── 0002-offline-by-construction.md
├── cli/
├── schema/
└── web/
```

If this repo ever splits into genuinely separate contexts, the layout becomes a root
`CONTEXT-MAP.md` pointing at one `CONTEXT.md` per context, with context-scoped ADRs
alongside each. Re-run `/setup-matt-pocock-skills` if that happens.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids — each entry lists them under `_Avoid_`.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0002 (offline by construction), but worth reopening because…_
