import type { ReactNode } from "react";

/**
 * Minimal, dependency-free Markdown renderer covering the subset the analysis
 * prose actually uses: headings, unordered/ordered lists, blockquotes,
 * paragraphs, and inline `code`, **bold**, *italic*, and [links](url).
 *
 * It renders to React elements (never dangerouslySetInnerHTML), so untrusted
 * content cannot inject markup.
 */

let keySeed = 0;
function nextKey(prefix: string): string {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

/** Parse inline markup within a single line into React nodes. */
function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Ordered by precedence; code first so its contents are not re-parsed.
  const pattern =
    /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith("`")) {
      nodes.push(<code key={nextKey("c")}>{token.slice(1, -1)}</code>);
    } else if (token.startsWith("**")) {
      nodes.push(<strong key={nextKey("b")}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*")) {
      nodes.push(<em key={nextKey("i")}>{token.slice(1, -1)}</em>);
    } else {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch) {
        nodes.push(
          <a
            key={nextKey("a")}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer noopener"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    }
    lastIndex = pattern.lastIndex;
  }
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }
  return nodes;
}

type Block =
  | { type: "heading"; level: number; text: string }
  | { type: "ul"; items: string[] }
  | { type: "ol"; items: string[] }
  | { type: "quote"; lines: string[] }
  | { type: "p"; text: string };

function parseBlocks(md: string): Block[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === "") {
      i += 1;
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length,
        text: heading[2],
      });
      i += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quote.push(lines[i].trim().replace(/^>\s?/, ""));
        i += 1;
      }
      blocks.push({ type: "quote", lines: quote });
      continue;
    }

    // Paragraph: gather until blank line or a new block-starting line.
    const para: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (
        t === "" ||
        /^(#{1,4})\s+/.test(t) ||
        /^[-*]\s+/.test(t) ||
        /^\d+\.\s+/.test(t) ||
        /^>\s?/.test(t)
      ) {
        break;
      }
      para.push(t);
      i += 1;
    }
    blocks.push({ type: "p", text: para.join(" ") });
  }

  return blocks;
}

export function Markdown({ children }: { children: string }) {
  const blocks = parseBlocks(children);
  return (
    <div className="prose">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case "heading": {
            const Tag = (`h${Math.min(block.level + 1, 4)}` as
              | "h2"
              | "h3"
              | "h4");
            return <Tag key={idx}>{renderInline(block.text)}</Tag>;
          }
          case "ul":
            return (
              <ul key={idx}>
                {block.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol key={idx}>
                {block.items.map((it, j) => (
                  <li key={j}>{renderInline(it)}</li>
                ))}
              </ol>
            );
          case "quote":
            return (
              <blockquote key={idx}>
                {renderInline(block.lines.join(" "))}
              </blockquote>
            );
          default:
            return <p key={idx}>{renderInline(block.text)}</p>;
        }
      })}
    </div>
  );
}
