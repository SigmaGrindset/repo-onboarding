# Delivery stops at what is committed, and the schema is what stops it

The Delivery section answers what happens to a change when it merges. The other half of
that question — where the dashboards are, how to read the logs, how to roll back, who is
on call — is the half a newcomer asks about most and the half that is not in the
repository. An analysis engine asked how code gets shipped drifts toward it, and what it
produces there is invention that somebody follows against a live system.

We enforce the boundary in **both** the schema and the generator prompt, and the two are
not redundant: they stop different failures. The schema makes the operational half
**unrepresentable** — there is no field to put it in, every row is anchored to a committed
file or directory, and `additionalProperties: false` means an engine cannot add one. The
prompt makes it **unwritten** in the prose fields that remain, because `pipeline` is a
paragraph and no schema can tell whether a paragraph mentions Grafana.

The load-bearing part is the shape, not the instruction. An engine that wants to say
something about on-call has nowhere to say it, and having nowhere is a stronger guarantee
than being told not to.

## Considered options

**A keyword filter in the schema — reject prose matching `rollback`, `on-call`,
`dashboard`, `PagerDuty`.** Rejected, and it is the tempting one because it looks like
enforcement. It forbids true sentences: "a failed gate blocks the merge, so there is
nothing to roll back" is exactly the kind of thing the section should be able to say, and
a filter cannot tell it from an invented runbook. A blacklist is also a race nobody wins —
every hosting product ships a new proper noun — and a rule that fires on a correct
document teaches its author to work around the validator rather than to write better prose.

**The prompt alone.** Rejected: a prompt is advice, and this is the section where the
consequence of ignoring the advice is somebody restarting the wrong thing. It also gives
up the part that is free — a schema with no operational field costs nothing to enforce and
cannot be forgotten between model versions. Prompt-only enforcement was how we would have
had to do it if the content model were free-form prose, which is a reason to keep the
content model structured.

**An explicit `operations` key holding "not derivable from this repository".** Rejected
twice over. A field that asks an engine to state an absence is a field an engine fills, and
what it fills it with is a plausible-sounding operational summary — the exact failure the
key was added to prevent. It also re-runs the null-versus-absent argument already settled
in ADR 0004: absence is the document's way of saying nothing is here.

**Cover the operational half, sourced from the repository's own docs.** Rejected: a
runbook in a README is prose someone wrote once against infrastructure that has since
changed, and reprinting it inside an onboarding document launders it into something that
looks freshly verified. The repository can be wrong about production; the analysis document
must not be confidently wrong about it on the repository's behalf.

**Let the document state its own boundary, in a field.** Rejected for the same reason as
`operations`: an engine asked to write the disclaimer writes a variation of it, and a
disclaimer that varies is one a reader has to read. The boundary is stated once, in fixed
text the viewer renders, and the document never carries it.

## Consequences

**Every entry in the section names the committed thing it was read from.** A gate names
its file, the build names the file that defines producing the artefact, an environment
names the file that maps a branch to it, a deploy variable names the file that declares it,
and migrations name the directory they live in. This is the
boundary in its operative form: a claim with no committed file behind it has no row to sit
in. It is why a repository whose branch-to-environment mapping exists only in a hosting
dashboard emits no `environments` — including this one, whose production deploy is a
Vercel project connection and not a file.

**The section will look incomplete to an operator, and complete to the reader it is for.**
Someone who runs the system will notice there is nothing here about the thing they do all
day. That is the design: this is what a newcomer needs before their first pull request,
not a runbook, and the two are different documents with different review requirements.

**Deploy variables carry names and never values, and the reason is disclosure rather than
staleness.** ADR 0005 kept values out of design tokens because a swatch is still a swatch
when it is the wrong blue. The rule here looks the same and is not: an analysis document
is shared, exported to markdown and handed to a chat model, and a value beside
`DATABASE_URL` is a leak rather than a stale fact. Same shape, sharper reason, and no
exception for a placeholder that "looks fake".

**The floor is carried by prose minimums rather than by a count, which is a departure from
the two sections before it.** The API surface and the design system each have an inventory
whose length is the evidence, so their floors are counts — three routes, four primitives.
Delivery's subject is the pipeline, not a list, so a count measures the wrong thing: two
gates was the first answer, and it turned away a repository with one test job, a committed
deploy workflow and real migrations, which is neither rare nor thin. The bar is a pipeline
paragraph, a build that names what a deploy runs, and one gate — with the substance carried
by the character minimums on the three fields an engine cannot fill from a file alone. The
cost is the other direction and is accepted: a repository with a single lint job, nothing
built and nothing deployed can clear this, and only the required `build` and the prose
minimums keep that section honest.

**A repository whose delivery lives entirely in a hosting dashboard still gets almost
nothing, and that is the boundary rather than the floor.** It has no committed file to cite,
so it has no environments, frequently no gates, and a pipeline paragraph with little in it —
the section thins itself out without a rule having to turn it away.

**Deploy variables are exhaustive where design tokens are sampled, and the inconsistency is
deliberate.** A missing token name costs a reader nothing: the file is named, and they were
browsing. A missing required variable costs them a deploy that will not boot, after they
believed they had set everything the document asked for. The promise differs because the
consequence of an incomplete list differs, and anything rendering the two sections must not
flatten them into one convention.
