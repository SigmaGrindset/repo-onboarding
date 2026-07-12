/**
 * Shared renderer for the social preview (Open Graph / Twitter) card of an
 * analysis. Produces a 1200x630 PNG via `next/og`'s Satori engine, so the JSX
 * below is restricted to Satori's supported CSS subset: flexbox only (no grid),
 * inline styles only (no Tailwind classes), and every container with more than
 * one child must declare `display: flex`.
 *
 * The card is intentionally locked to the dark palette — a social crawler can't
 * switch themes, and dark reads as a premium developer tool in Slack/Discord.
 * Colours mirror the `[data-theme="dark"]` tokens in globals.css.
 */
import { ImageResponse } from "next/og";
import { getAnalysisCached } from "./datasource";
import { compactNumber, formatNumber, snippet } from "./format";
import { LANGUAGE_PALETTE } from "./styles";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png";
export const OG_ALT =
  "Repo Onboarding — interactive codebase onboarding, from architecture to a guided tour.";

/** Dark-theme tokens, hard-coded so the image never depends on CSS variables. */
const C = {
  bgFrom: "#0a0e16",
  bgTo: "#131b2c",
  surface: "#111725",
  border: "#232f47",
  text: "#e7edf7",
  muted: "#9aa7bd",
  faint: "#66748d",
  accent: "#7b8cff",
  accentSoft: "rgba(123, 140, 255, 0.14)",
} as const;

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div
        style={{
          width: 14,
          height: 14,
          borderRadius: 999,
          background: C.accent,
          marginRight: 12,
        }}
      />
      <div
        style={{
          fontSize: 24,
          fontWeight: 600,
          color: C.muted,
          letterSpacing: 0.4,
        }}
      >
        Repo Onboarding
      </div>
    </div>
  );
}

function Pill({ children }: { children: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "10px 20px",
        borderRadius: 999,
        background: C.accentSoft,
        border: `1px solid ${C.accent}`,
        color: C.accent,
        fontSize: 24,
        fontWeight: 600,
      }}
    >
      {children}
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: "20px 28px",
        borderRadius: 16,
        background: C.surface,
        border: `1px solid ${C.border}`,
        minWidth: 190,
      }}
    >
      <div style={{ fontSize: 46, fontWeight: 700, color: C.text }}>
        {value}
      </div>
      <div
        style={{
          fontSize: 20,
          color: C.faint,
          marginTop: 4,
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** Full-bleed language-breakdown bar that anchors the bottom edge. */
function LanguageBar({
  languages,
}: {
  languages: { language: string; percentage: number }[];
}) {
  return (
    <div style={{ display: "flex", width: "100%", height: 14 }}>
      {languages.map((l, i) => (
        <div
          key={l.language}
          style={{
            width: `${Math.max(l.percentage, 0)}%`,
            background: LANGUAGE_PALETTE[i % LANGUAGE_PALETTE.length],
          }}
        />
      ))}
    </div>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        background: `linear-gradient(135deg, ${C.bgFrom} 0%, ${C.bgTo} 100%)`,
        color: C.text,
        fontFamily: "Geist, sans-serif",
      }}
    >
      {children}
    </div>
  );
}

/**
 * Branded, data-free card. Used for the home page's social preview and as the
 * fallback when an analysis id can't be resolved (missing, revoked token, or —
 * in cloud mode — an unauthorized private id a crawler can't read).
 */
export function renderBrandOgImage(): ImageResponse {
  return new ImageResponse(
    (
      <Frame>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            justifyContent: "center",
            padding: 72,
          }}
        >
          <Wordmark />
          <div
            style={{
              fontSize: 66,
              fontWeight: 700,
              color: C.text,
              marginTop: 28,
              lineHeight: 1.05,
            }}
          >
            Understand any codebase.
          </div>
          <div
            style={{
              fontSize: 30,
              color: C.muted,
              marginTop: 20,
              maxWidth: 900,
              lineHeight: 1.4,
            }}
          >
            Architecture, a guided reading tour, dependency graph, hotspots and
            setup — generated from a single analysis.
          </div>
        </div>
        <div style={{ display: "flex", width: "100%", height: 14 }}>
          {LANGUAGE_PALETTE.map((c) => (
            <div key={c} style={{ flexGrow: 1, background: c }} />
          ))}
        </div>
      </Frame>
    ),
    { ...OG_SIZE },
  );
}

/**
 * Render the social card for analysis `id`. Falls back to a branded card when
 * the id doesn't resolve (missing, revoked token, or — in cloud mode — an
 * unauthorized private id the crawler can't read).
 */
export async function renderAnalysisOgImage(id: string): Promise<ImageResponse> {
  const analysis = await getAnalysisCached(id);
  if (!analysis) return renderBrandOgImage();

  const { metadata, pitch } = analysis;
  const { stats } = metadata;
  const languages = stats.languages.slice(0, 8);
  const headline = snippet(pitch.summary, 150);

  return new ImageResponse(
    (
      <Frame>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flexGrow: 1,
            padding: 72,
            justifyContent: "space-between",
          }}
        >
          {/* Header: wordmark + primary language */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Wordmark />
            {metadata.primaryLanguage ? (
              <Pill>{metadata.primaryLanguage}</Pill>
            ) : (
              <div style={{ display: "flex" }} />
            )}
          </div>

          {/* Repo name + pitch headline */}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 74,
                fontWeight: 700,
                color: C.text,
                lineHeight: 1.02,
              }}
            >
              {metadata.repoName}
            </div>
            <div
              style={{
                fontSize: 30,
                color: C.muted,
                marginTop: 22,
                maxWidth: 980,
                lineHeight: 1.4,
              }}
            >
              {headline}
            </div>
          </div>

          {/* Stat row */}
          <div style={{ display: "flex", alignItems: "stretch", gap: 20 }}>
            <Stat value={compactNumber(stats.totalLoc)} label="lines of code" />
            <Stat value={formatNumber(stats.totalFiles)} label="files" />
            <Stat value={String(stats.languages.length)} label="languages" />
          </div>
        </div>

        <LanguageBar languages={languages} />
      </Frame>
    ),
    { ...OG_SIZE },
  );
}
