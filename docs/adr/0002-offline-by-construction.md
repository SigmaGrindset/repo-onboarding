# The analysis pipeline is offline by construction

Learning resources are URLs produced by a model, so hallucinated links are the obvious
risk, and the obvious defenses — resolving real URLs from package registries during the
pre-pass, and checking every link is alive during validation — both require network
access. We rejected both and kept every step of the pipeline offline and deterministic.

## Considered options

**Registry seeding during the pre-pass.** Rejected: the pre-pass is a pure offline script
that runs on other people's machines, and the model already receives the parsed manifests,
so seeding would mostly resolve URLs for well-known technologies the model already knows.
Learning resources cover only tech stack entries — the curated shortlist — so the obscure
long tail where seeding would pay off is already out of scope.

**Liveness-checking URLs during validation.** Rejected: it trades a deterministic offline
validator for a flaky network one. Validation is binary — there is no warning severity —
so a bot-blocked HEAD request against a perfectly good documentation host would become a
hard upload failure. Adding it later requires introducing severity into the issue
contract first, which is its own decision.

## Consequences

The only defense against a wrong URL is structural: resources must sit on the same
documentation domain as the technology's official entry point, compared as strings at
validate time. Domain rather than exact host, because documentation legitimately lives on
a subdomain — `docs.python.org` under `python.org`. That
catches invented pages beneath a real documentation site — the common case — but not a
wrong official entry point itself. We accept that: an incorrect documentation home for a
well-known technology is rare, immediately visible to a reader, and unlike a wrong
line-of-code count, obviously wrong rather than quietly wrong.
