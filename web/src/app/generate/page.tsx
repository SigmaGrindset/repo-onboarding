import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { CommandBlock } from "@/components/CommandBlock";

const title = "Generate your analysis";
const description =
  "Your AI coding agent reads the code with full agentic depth; the hosted viewer renders the onboarding. Bring your own model, publish a validated analysis.json, pay nothing.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
};

export default function GeneratePage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-16">
      {/* Hero */}
      <header className="mb-12">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
          Bring your own model · $0
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-text sm:text-4xl">
          Your agent reads the code. We render the onboarding.
        </h1>
        <p className="mt-4 max-w-2xl text-[1.02rem] leading-relaxed text-muted">
          An analysis is produced by <strong className="text-text">your own AI
          coding agent</strong> running a frontier model against your actual
          repository — real files, real line numbers, real churn data, read with
          full agentic depth. It targets a strict schema, gets validated until
          it&apos;s clean, and only then is published here as an interactive
          onboarding site. The reading is done by the best model you have access
          to; the viewer just renders the result.
        </p>
      </header>

      {/* Steps */}
      <section className="mb-14">
        <h2 className="mb-6 text-xs font-semibold uppercase tracking-wider text-accent">
          The flow
        </h2>
        <ol className="space-y-6">
          <Step
            n={1}
            title="Prepare your repo"
            body={
              <>
                Run this at the root of the repository you want to onboard. It
                writes{" "}
                <Code>.repo-onboarding/</Code> with the deterministic facts
                (file tree, LOC, languages, git churn), the agent protocol{" "}
                <Code>PROMPT.md</Code>, and the target <Code>schema.json</Code>.
                Nothing in your repo is modified — the pre-pass only reads.
              </>
            }
            command="npx repo-onboarding init"
          />

          <Step
            n={2}
            title="Point your agent at the protocol"
            body={
              <>
                Hand this instruction to your AI coding agent. It reads the code
                and writes <Code>analysis.json</Code> at the repo root. Works
                with Claude Code, Cursor, Codex — any agent that can read files
                and follow a prompt.
              </>
            }
            command="Follow .repo-onboarding/PROMPT.md to produce analysis.json."
          />

          <Step
            n={3}
            title="Validate until it's green"
            body={
              <>
                Checks the document against the schema and verifies
                dependency-graph edge integrity. The errors are field-level and
                designed to be pasted straight back to your agent — repeat the
                validate/fix loop until it passes. This is the quality floor:
                nothing malformed gets published.
              </>
            }
            command="npx repo-onboarding validate analysis.json"
          />

          <Step
            n={4}
            title="Publish it"
            body={
              <>
                Create a personal token at{" "}
                <Link href="/account" className="text-accent hover:underline">
                  /account
                </Link>{" "}
                and set it as <Code>REPO_ONBOARDING_TOKEN</Code> (or pass{" "}
                <Code>--token</Code>). <Code>upload</Code> re-validates locally,
                then publishes and prints your live analysis URL.
              </>
            }
            command={"export REPO_ONBOARDING_TOKEN=roa_…\nnpx repo-onboarding upload analysis.json"}
          />
        </ol>

        {/* Browser alternative */}
        <Card className="mt-8 p-5">
          <p className="text-sm font-semibold text-text">Prefer the browser?</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Validate locally with step 3, then drag the file onto{" "}
            <Link href="/upload" className="text-accent hover:underline">
              /upload
            </Link>{" "}
            to publish without the CLI. Same validation, same result.
          </p>
        </Card>
      </section>

      {/* FAQ strip */}
      <section>
        <h2 className="mb-6 text-xs font-semibold uppercase tracking-wider text-accent">
          Straight answers
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Faq q="Why no hosted generation?">
            Because the reading is the whole game. A frontier model with agentic
            access to your code beats any free model we could afford to host, and
            your source never has to leave your machine — you send us only the{" "}
            <Code>analysis.json</Code> you choose to publish.
          </Faq>
          <Faq q="What gets uploaded?">
            Only <Code>analysis.json</Code> — the structured onboarding document.
            Never your source code. You can read exactly what it contains before
            you run <Code>upload</Code>.
          </Faq>
          <Faq q="What does it cost?">
            Nothing here. You bring your own model, so generation runs on tooling
            you already pay for (or a free tier), and the hosted viewer is free.
          </Faq>
        </div>
      </section>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  command,
}: {
  n: number;
  title: string;
  body: ReactNode;
  command: string;
}) {
  return (
    <li className="flex gap-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/25 bg-accent-soft text-sm font-semibold text-accent">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[0.98rem] font-semibold text-text">{title}</h3>
        <p className="mt-1 mb-3 text-sm leading-relaxed text-muted">{body}</p>
        <CommandBlock command={command} />
      </div>
    </li>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold text-text">{q}</p>
      <p className="mt-1.5 text-[0.83rem] leading-relaxed text-muted">
        {children}
      </p>
    </Card>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  );
}
