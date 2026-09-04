# Learning resources are a top-level key, not nested in tech stack entries

Learning resources are one-to-one with tech stack entries, which argues for nesting them
inside each entry under `pitch`. We put them in their own top-level `learningResources`
key instead, joined by technology name, because every section in this document is already
its own top-level key rendered by its own route — nesting would make Learn the only
section that reaches into another section's data to render itself, and would put
section-sized content inside `pitch`, the summary object that also feeds every analysis
card.

## Consequences

The join is by name, so the two lists can drift. That is not left to trust: coverage is
checked deterministically at validate time, the same way `checkEdges` verifies that
dependency-graph edges reference real nodes. A gap or an orphan is a validation error.
