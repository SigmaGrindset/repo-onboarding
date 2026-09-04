#!/usr/bin/env node
/**
 * Repo Onboarding — deterministic pre-pass.
 *
 * Computes hard, verifiable facts about a repository so the /onboard skill can
 * ground its narrative in real numbers instead of guesses. This is the single
 * biggest quality lever in the pipeline: the model MUST copy the stats/churn
 * numbers from here verbatim rather than inventing them.
 *
 * Zero npm dependencies — node: builtins only — so it runs inside any freshly
 * cloned repo with no install step.
 *
 * Usage:
 *   node prepass.mjs <repo-path> [--out <file>] [--commits <n>] [--pretty]
 *
 * Output: a single JSON object (to stdout, or to --out <file>).
 *
 * Exit codes:
 *   0  success (JSON emitted)
 *   2  usage / fatal IO error
 */

import { readdirSync, lstatSync, statSync, openSync, readSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, relative, sep, basename, extname } from "node:path";
import { execFileSync } from "node:child_process";
import process from "node:process";

const PREPASS_VERSION = "0.1.0";

// ---------------------------------------------------------------------------
// Configuration / knobs
// ---------------------------------------------------------------------------

const DEFAULT_COMMIT_WINDOW = 500; // git log -n
const MAX_FILE_BYTES_FOR_LOC = 2 * 1024 * 1024; // 2 MB: count file, skip LOC
const MAX_ENTRIES_PER_DIR = 200; // collapse dirs wider than this
const MAX_TREE_NODES = 5000; // global cap so JSON stays reasonable
const MAX_DEPTH = 16;
const BINARY_SNIFF_BYTES = 8000;
const TOP_CHURN = 25;

// Directories that never carry onboarding signal. Always ignored regardless of
// .gitignore. Matched by exact directory name at any level.
const DEFAULT_IGNORE_DIRS = new Set([
  ".git", ".hg", ".svn", "node_modules", "bower_components", "vendor",
  "dist", "build", "out", ".next", ".nuxt", ".svelte-kit", ".turbo",
  "target", "bin", "obj", ".gradle", ".idea", ".vscode", ".vs",
  "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache", ".tox",
  ".venv", "venv", "env", ".env.d", "site-packages", ".eggs",
  "coverage", ".coverage", ".nyc_output", "htmlcov",
  ".cache", ".parcel-cache", ".pnp", ".yarn", ".pnpm-store",
  ".terraform", ".serverless", "Pods", "DerivedData", ".dart_tool",
  "elm-stuff", "_build", "deps", ".stack-work", ".cargo",
]);

// File names/extensions we treat as noise for LOC but still count as files.
const IGNORE_FILE_BASENAMES = new Set([
  ".DS_Store", "Thumbs.db", "npm-debug.log", "yarn-error.log",
]);

// ---------------------------------------------------------------------------
// Extension -> language map. Covers mainstream ecosystems. Extensions are
// lowercase, with the leading dot. Some special-cased by basename below.
// ---------------------------------------------------------------------------

const EXT_LANGUAGE = {
  // web / js ecosystem
  ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript", ".jsx": "JavaScript",
  ".ts": "TypeScript", ".mts": "TypeScript", ".cts": "TypeScript", ".tsx": "TypeScript",
  ".vue": "Vue", ".svelte": "Svelte", ".astro": "Astro",
  ".html": "HTML", ".htm": "HTML", ".ejs": "HTML", ".hbs": "Handlebars", ".pug": "Pug",
  ".css": "CSS", ".scss": "SCSS", ".sass": "Sass", ".less": "Less", ".styl": "Stylus",
  // backend / systems
  ".py": "Python", ".pyi": "Python", ".pyx": "Cython",
  ".rb": "Ruby", ".erb": "ERB", ".rake": "Ruby",
  ".go": "Go",
  ".rs": "Rust",
  ".java": "Java", ".kt": "Kotlin", ".kts": "Kotlin", ".scala": "Scala", ".groovy": "Groovy",
  ".c": "C", ".h": "C", ".hpp": "C++", ".hh": "C++", ".hxx": "C++",
  ".cc": "C++", ".cpp": "C++", ".cxx": "C++", ".c++": "C++",
  ".cs": "C#", ".fs": "F#", ".fsx": "F#", ".vb": "Visual Basic",
  ".swift": "Swift", ".m": "Objective-C", ".mm": "Objective-C++",
  ".php": "PHP", ".phtml": "PHP",
  ".pl": "Perl", ".pm": "Perl",
  ".lua": "Lua",
  ".r": "R", ".jl": "Julia",
  ".dart": "Dart",
  ".ex": "Elixir", ".exs": "Elixir", ".erl": "Erlang", ".hrl": "Erlang",
  ".clj": "Clojure", ".cljs": "ClojureScript", ".cljc": "Clojure",
  ".hs": "Haskell", ".elm": "Elm", ".ml": "OCaml", ".mli": "OCaml",
  ".nim": "Nim", ".zig": "Zig", ".v": "V", ".cr": "Crystal",
  ".sol": "Solidity",
  // shell / infra / config
  ".sh": "Shell", ".bash": "Shell", ".zsh": "Shell", ".fish": "Shell",
  ".ps1": "PowerShell", ".psm1": "PowerShell", ".bat": "Batch", ".cmd": "Batch",
  ".sql": "SQL", ".graphql": "GraphQL", ".gql": "GraphQL", ".proto": "Protobuf",
  ".tf": "Terraform", ".tfvars": "Terraform", ".hcl": "HCL",
  ".dockerfile": "Dockerfile",
  ".yml": "YAML", ".yaml": "YAML", ".toml": "TOML", ".ini": "INI", ".cfg": "INI",
  ".json": "JSON", ".jsonc": "JSON", ".json5": "JSON", ".xml": "XML",
  ".md": "Markdown", ".mdx": "MDX", ".rst": "reStructuredText", ".txt": "Text",
  ".tex": "TeX", ".adoc": "AsciiDoc",
  ".ipynb": "Jupyter Notebook",
  ".make": "Makefile", ".mk": "Makefile",
  ".gradle": "Gradle", ".cmake": "CMake",
};

// basename (lowercased) -> language, for extensionless / special files.
const BASENAME_LANGUAGE = {
  "dockerfile": "Dockerfile",
  "makefile": "Makefile",
  "gnumakefile": "Makefile",
  "cmakelists.txt": "CMake",
  "rakefile": "Ruby",
  "gemfile": "Ruby",
  "vagrantfile": "Ruby",
  "brewfile": "Ruby",
  "procfile": "Text",
  ".gitignore": "Config",
  ".gitattributes": "Config",
  ".editorconfig": "Config",
  ".npmrc": "Config",
  ".nvmrc": "Config",
  ".env": "Config",
};

// Extensions we recognize as binary/asset — counted as files, never as code LOC.
const ASSET_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".ico", ".svg", ".tiff",
  ".pdf", ".psd", ".ai", ".eps",
  ".mp3", ".wav", ".flac", ".ogg", ".mp4", ".mov", ".avi", ".mkv", ".webm",
  ".woff", ".woff2", ".ttf", ".otf", ".eot",
  ".zip", ".gz", ".tar", ".tgz", ".bz2", ".xz", ".7z", ".rar",
  ".jar", ".war", ".class", ".dll", ".so", ".dylib", ".exe", ".o", ".a",
  ".wasm", ".bin", ".dat", ".db", ".sqlite", ".sqlite3",
  ".lock", ".map", ".min.js", ".min.css",
]);

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function toPosix(p) {
  return p.split(sep).join("/");
}

function isBinaryFile(fullPath) {
  // Sniff the first chunk for a NUL byte — cheap, reliable enough.
  let fd;
  try {
    fd = openSync(fullPath, "r");
    const buf = Buffer.alloc(BINARY_SNIFF_BYTES);
    const bytes = readSync(fd, buf, 0, BINARY_SNIFF_BYTES, 0);
    for (let i = 0; i < bytes; i++) {
      if (buf[i] === 0) return true;
    }
    return false;
  } catch {
    return true; // unreadable => treat as binary/skip
  } finally {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
  }
}

function countNonEmptyLines(fullPath, bytes) {
  // Stream-friendly: for files under the cap we read once and count. Non-empty
  // = has at least one non-whitespace char. Robust to \n and \r\n.
  let content;
  try {
    content = readFileSync(fullPath, "utf8");
  } catch {
    return 0;
  }
  let loc = 0;
  let lineHasContent = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === "\n") {
      if (lineHasContent) loc++;
      lineHasContent = false;
    } else if (ch !== "\r" && ch !== " " && ch !== "\t" && ch !== "\f" && ch !== "\v") {
      lineHasContent = true;
    }
  }
  if (lineHasContent) loc++; // last line without trailing newline
  return loc;
}

function classifyLanguage(name) {
  const lower = name.toLowerCase();
  if (BASENAME_LANGUAGE[lower]) return BASENAME_LANGUAGE[lower];
  // Compound extension checks first (e.g. .min.js already in ASSET_EXTS)
  const ext = extname(lower);
  if (!ext) {
    // extensionless & unknown
    return null;
  }
  if (ASSET_EXTS.has(ext)) return { asset: true };
  if (EXT_LANGUAGE[ext]) return EXT_LANGUAGE[ext];
  return null;
}

// ---------------------------------------------------------------------------
// .gitignore (cheap, top-level, non-glob patterns only)
// ---------------------------------------------------------------------------

function parseGitignore(repoPath) {
  const names = new Set();
  try {
    const raw = readFileSync(join(repoPath, ".gitignore"), "utf8");
    for (let line of raw.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith("#") || line.startsWith("!")) continue;
      // Skip anything with glob metacharacters — keep this cheap and safe.
      if (/[*?\[\]]/.test(line)) continue;
      // Normalize: drop leading and trailing slashes, take last path segment.
      line = line.replace(/^\/+/, "").replace(/\/+$/, "");
      if (!line || line.includes("/")) {
        // nested path pattern: store the whole relative form too
        if (line) names.add(line);
        continue;
      }
      names.add(line);
    }
  } catch {
    /* no .gitignore — fine */
  }
  return names;
}

// ---------------------------------------------------------------------------
// File tree walk + LOC/language aggregation
// ---------------------------------------------------------------------------

function buildWalk(repoPath, extraIgnoreNames) {
  const langAgg = new Map(); // language -> { files, loc }
  let totalFiles = 0;
  let totalLoc = 0;
  let assetFiles = 0;
  let unknownFiles = 0;
  let skippedLargeFiles = 0;
  let nodeBudget = MAX_TREE_NODES;
  const largestFiles = []; // {path, loc}

  function ignored(name, isDir) {
    if (isDir && DEFAULT_IGNORE_DIRS.has(name)) return true;
    if (!isDir && IGNORE_FILE_BASENAMES.has(name)) return true;
    if (extraIgnoreNames.has(name)) return true;
    return false;
  }

  function walk(absDir, depth) {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return null; // permission error etc.
    }
    // Deterministic order: dirs & files sorted by name.
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

    const children = [];
    let omitted = 0;
    let emitted = 0;

    for (const ent of entries) {
      const name = ent.name;
      let isDir = ent.isDirectory();
      let isSymlink = ent.isSymbolicLink();

      // Resolve symlinks with lstat/stat but never follow directory symlinks
      // (avoids cycles). Symlinked files are counted but not descended.
      if (isSymlink) {
        // record but do not follow
        children.push({ name, path: toPosix(relative(repoPath, join(absDir, name))), type: "symlink" });
        continue;
      }

      if (ignored(name, isDir)) continue;

      const abs = join(absDir, name);
      const relPath = toPosix(relative(repoPath, abs));

      if (isDir) {
        if (depth >= MAX_DEPTH) {
          children.push({ name, path: relPath, type: "dir", truncated: "max-depth" });
          continue;
        }
        if (nodeBudget <= 0) { omitted++; continue; }
        if (emitted >= MAX_ENTRIES_PER_DIR) { omitted++; continue; }
        const sub = walk(abs, depth + 1);
        if (sub) {
          children.push({ name, path: relPath, type: "dir", children: sub.children, ...(sub.truncated ? { truncated: sub.truncated } : {}) });
          nodeBudget--;
          emitted++;
        }
      } else {
        // regular file (or unknown) — count it
        let size = 0;
        try { size = statSync(abs).size; } catch { /* ignore */ }

        totalFiles++;

        const cls = classifyLanguage(name);
        let language = null;
        let loc = 0;

        if (cls && cls.asset) {
          assetFiles++;
        } else if (typeof cls === "string") {
          language = cls;
          if (size > MAX_FILE_BYTES_FOR_LOC) {
            skippedLargeFiles++;
          } else if (isBinaryFile(abs)) {
            // extension said code but content is binary -> treat as asset
            assetFiles++;
            language = null;
          } else {
            loc = countNonEmptyLines(abs, size);
          }
        } else {
          unknownFiles++;
        }

        if (language) {
          const agg = langAgg.get(language) || { files: 0, loc: 0 };
          agg.files++;
          agg.loc += loc;
          langAgg.set(language, agg);
          totalLoc += loc;
          if (loc > 0) {
            largestFiles.push({ path: relPath, loc, language });
          }
        }

        if (nodeBudget > 0 && emitted < MAX_ENTRIES_PER_DIR) {
          const node = { name, path: relPath, type: "file" };
          if (language) node.language = language;
          if (loc) node.loc = loc;
          children.push(node);
          nodeBudget--;
          emitted++;
        } else {
          omitted++;
        }
      }
    }

    return { children, truncated: omitted > 0 ? `omitted ${omitted} entries` : null };
  }

  const root = walk(repoPath, 0) || { children: [] };

  // Languages array, sorted by loc desc then files desc.
  const languages = [...langAgg.entries()]
    .map(([language, v]) => ({ language, files: v.files, loc: v.loc }))
    .sort((a, b) => b.loc - a.loc || b.files - a.files);

  const withPct = languages.map((l) => ({
    language: l.language,
    files: l.files,
    loc: l.loc,
    percentage: totalLoc > 0 ? Math.round((l.loc / totalLoc) * 1000) / 10 : 0,
  }));

  largestFiles.sort((a, b) => b.loc - a.loc);

  return {
    tree: { name: basename(repoPath) || ".", path: ".", type: "dir", children: root.children, ...(root.truncated ? { truncated: root.truncated } : {}) },
    stats: {
      totalFiles,
      totalLoc,
      languages: withPct,
      assetFiles,
      unknownFiles,
      skippedLargeFiles,
    },
    primaryLanguage: withPct.length ? withPct[0].language : null,
    largestFiles: largestFiles.slice(0, 20),
  };
}

// ---------------------------------------------------------------------------
// Dependency manifests
// ---------------------------------------------------------------------------

function safeRead(p) {
  try { return readFileSync(p, "utf8"); } catch { return null; }
}

function parseManifests(repoPath, tree) {
  const manifests = [];

  // Collect candidate manifest paths anywhere reasonably shallow in the tree.
  const candidates = [];
  (function collect(node, depth) {
    if (!node.children) return;
    for (const c of node.children) {
      if (c.type === "file") candidates.push(c.path);
      else if (c.type === "dir" && depth < 3) collect(c, depth + 1);
    }
  })(tree, 0);

  const has = (name) => candidates.filter((p) => basename(p).toLowerCase() === name);

  // package.json (npm/yarn/pnpm)
  for (const p of has("package.json")) {
    const raw = safeRead(join(repoPath, p));
    if (!raw) continue;
    try {
      const pkg = JSON.parse(raw);
      const deps = [];
      for (const [name, version] of Object.entries(pkg.dependencies || {})) deps.push({ name, version: String(version) });
      for (const [name, version] of Object.entries(pkg.devDependencies || {})) deps.push({ name, version: String(version), dev: true });
      for (const [name, version] of Object.entries(pkg.peerDependencies || {})) deps.push({ name, version: String(version), peer: true });
      manifests.push({ path: p, ecosystem: "npm", packageName: pkg.name || null, dependencies: deps, scripts: pkg.scripts ? Object.keys(pkg.scripts) : [] });
    } catch { /* malformed */ }
  }

  // requirements.txt (pip)
  for (const p of has("requirements.txt")) {
    const raw = safeRead(join(repoPath, p));
    if (!raw) continue;
    const deps = [];
    for (let line of raw.split(/\r?\n/)) {
      line = line.trim();
      if (!line || line.startsWith("#") || line.startsWith("-")) continue;
      const m = line.match(/^([A-Za-z0-9_.\-]+)\s*([<>=!~]=?.*)?$/);
      if (m) deps.push({ name: m[1], version: m[2] ? m[2].trim() : undefined });
    }
    if (deps.length) manifests.push({ path: p, ecosystem: "pip", dependencies: deps });
  }

  // pyproject.toml (poetry/pep621) — best-effort, no TOML parser.
  for (const p of has("pyproject.toml")) {
    const raw = safeRead(join(repoPath, p));
    if (!raw) continue;
    const deps = [];
    // PEP 621 dependencies = [ "foo>=1", ... ]
    const pep621 = raw.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (pep621) {
      for (const m of pep621[1].matchAll(/["']([^"']+)["']/g)) {
        const spec = m[1].trim();
        const nm = spec.match(/^([A-Za-z0-9_.\-]+)/);
        if (nm) deps.push({ name: nm[1], version: spec.slice(nm[1].length).trim() || undefined });
      }
    }
    // [tool.poetry.dependencies] name = "^x"
    const poetry = raw.match(/\[tool\.poetry\.dependencies\]([\s\S]*?)(\n\[|$)/);
    if (poetry) {
      for (const line of poetry[1].split(/\r?\n/)) {
        const m = line.match(/^([A-Za-z0-9_.\-]+)\s*=\s*["']?([^"'\n]+)?/);
        if (m && m[1].toLowerCase() !== "python") deps.push({ name: m[1], version: m[2] ? m[2].trim() : undefined });
      }
    }
    if (deps.length) manifests.push({ path: p, ecosystem: "python", dependencies: dedupeDeps(deps) });
  }

  // go.mod
  for (const p of has("go.mod")) {
    const raw = safeRead(join(repoPath, p));
    if (!raw) continue;
    const deps = [];
    let inBlock = false;
    for (let line of raw.split(/\r?\n/)) {
      line = line.trim();
      if (line.startsWith("require (")) { inBlock = true; continue; }
      if (inBlock && line === ")") { inBlock = false; continue; }
      let req = null;
      if (inBlock) req = line;
      else if (line.startsWith("require ")) req = line.slice(8).trim();
      if (req) {
        const m = req.match(/^([^\s]+)\s+([^\s]+)/);
        if (m) deps.push({ name: m[1], version: m[2] });
      }
    }
    manifests.push({ path: p, ecosystem: "go", dependencies: deps });
  }

  // Cargo.toml
  for (const p of has("cargo.toml")) {
    const raw = safeRead(join(repoPath, p));
    if (!raw) continue;
    const deps = [];
    for (const section of ["dependencies", "dev-dependencies", "build-dependencies"]) {
      const re = new RegExp(`\\[${section}\\]([\\s\\S]*?)(\\n\\[|$)`);
      const m = raw.match(re);
      if (!m) continue;
      for (const line of m[1].split(/\r?\n/)) {
        const dm = line.match(/^([A-Za-z0-9_.\-]+)\s*=\s*(.+)$/);
        if (dm) {
          let ver = dm[2].trim();
          const vm = ver.match(/version\s*=\s*["']([^"']+)["']/);
          ver = vm ? vm[1] : ver.replace(/["']/g, "").replace(/\{.*\}/, "").trim();
          deps.push({ name: dm[1], version: ver || undefined, dev: section !== "dependencies" });
        }
      }
    }
    manifests.push({ path: p, ecosystem: "cargo", dependencies: deps });
  }

  // Gemfile
  for (const p of has("gemfile")) {
    const raw = safeRead(join(repoPath, p));
    if (!raw) continue;
    const deps = [];
    for (const m of raw.matchAll(/^\s*gem\s+["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?/gm)) {
      deps.push({ name: m[1], version: m[2] || undefined });
    }
    if (deps.length) manifests.push({ path: p, ecosystem: "rubygems", dependencies: deps });
  }

  // composer.json
  for (const p of has("composer.json")) {
    const raw = safeRead(join(repoPath, p));
    if (!raw) continue;
    try {
      const c = JSON.parse(raw);
      const deps = [];
      for (const [name, version] of Object.entries(c.require || {})) deps.push({ name, version: String(version) });
      for (const [name, version] of Object.entries(c["require-dev"] || {})) deps.push({ name, version: String(version), dev: true });
      manifests.push({ path: p, ecosystem: "composer", packageName: c.name || null, dependencies: deps });
    } catch { /* ignore */ }
  }

  // pom.xml (Maven) — best-effort artifactId extraction
  for (const p of has("pom.xml")) {
    const raw = safeRead(join(repoPath, p));
    if (!raw) continue;
    const deps = [];
    for (const m of raw.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
      const g = m[1].match(/<groupId>([^<]+)<\/groupId>/);
      const a = m[1].match(/<artifactId>([^<]+)<\/artifactId>/);
      const v = m[1].match(/<version>([^<]+)<\/version>/);
      if (a) deps.push({ name: (g ? g[1].trim() + ":" : "") + a[1].trim(), version: v ? v[1].trim() : undefined });
    }
    manifests.push({ path: p, ecosystem: "maven", dependencies: deps });
  }

  // build.gradle / build.gradle.kts — best-effort
  for (const name of ["build.gradle", "build.gradle.kts"]) {
    for (const p of has(name)) {
      const raw = safeRead(join(repoPath, p));
      if (!raw) continue;
      const deps = [];
      for (const m of raw.matchAll(/(?:implementation|api|compile|testImplementation|runtimeOnly)\s*\(?\s*["']([^"']+)["']/g)) {
        deps.push({ name: m[1] });
      }
      if (deps.length) manifests.push({ path: p, ecosystem: "gradle", dependencies: deps });
    }
  }

  return manifests;
}

function dedupeDeps(deps) {
  const seen = new Map();
  for (const d of deps) if (!seen.has(d.name)) seen.set(d.name, d);
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Git churn
// ---------------------------------------------------------------------------

function git(repoPath, args) {
  return execFileSync("git", ["-C", repoPath, ...args], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function collectGit(repoPath, commitWindow, existingPaths) {
  const result = {
    isRepo: false,
    headSha: null,
    branch: null,
    remoteUrl: null,
    commitWindow,
    commitsAnalyzed: 0,
    topChurn: [],
    firstCommitDate: null,
    lastCommitDate: null,
  };

  try {
    const inside = git(repoPath, ["rev-parse", "--is-inside-work-tree"]).trim();
    if (inside !== "true") return result;
  } catch {
    return result; // git missing or not a repo
  }
  result.isRepo = true;

  try { result.headSha = git(repoPath, ["rev-parse", "HEAD"]).trim() || null; } catch { /* ignore */ }
  try { result.branch = git(repoPath, ["rev-parse", "--abbrev-ref", "HEAD"]).trim() || null; } catch { /* ignore */ }
  try { result.remoteUrl = normalizeRemote(git(repoPath, ["config", "--get", "remote.origin.url"]).trim()); } catch { /* ignore */ }

  // One pass over the log window with per-commit file lists.
  // NUL record marker keeps parsing unambiguous.
  let log;
  try {
    log = git(repoPath, [
      "log", `-n`, String(commitWindow), "--no-merges",
      "--name-only", "--pretty=format:%x00%H%x09%aI",
    ]);
  } catch {
    return result;
  }

  const counts = new Map(); // path -> { commits, lastDate }
  let commits = 0;
  let currentDate = null;
  const lines = log.split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith("\x00")) {
      commits++;
      const parts = line.slice(1).split("\t");
      currentDate = parts[1] || null;
      if (currentDate) {
        if (!result.lastCommitDate) result.lastCommitDate = currentDate;
        result.firstCommitDate = currentDate;
      }
      continue;
    }
    const path = line.trim();
    if (!path) continue;
    const rec = counts.get(path) || { commits: 0, lastDate: null };
    rec.commits++;
    if (currentDate && !rec.lastDate) rec.lastDate = currentDate; // log is newest-first
    counts.set(path, rec);
  }
  result.commitsAnalyzed = commits;

  const now = Date.now();
  const scored = [...counts.entries()]
    .filter(([p]) => !existingPaths || existingPaths.has(toPosix(p))) // prefer files that still exist
    .map(([path, rec]) => {
      const lastMs = rec.lastDate ? Date.parse(rec.lastDate) : NaN;
      const daysAgo = Number.isNaN(lastMs) ? null : Math.floor((now - lastMs) / 86400000);
      let activity = "dormant";
      if (daysAgo !== null) {
        if (daysAgo <= 45) activity = "active";
        else if (daysAgo <= 180) activity = "moderate";
      }
      return { path: toPosix(path), commits: rec.commits, lastCommitDate: rec.lastDate, lastCommitDaysAgo: daysAgo, recentActivity: activity };
    })
    .sort((a, b) => b.commits - a.commits || (a.lastCommitDaysAgo ?? 1e9) - (b.lastCommitDaysAgo ?? 1e9));

  result.topChurn = scored.slice(0, TOP_CHURN);
  return result;
}

function normalizeRemote(url) {
  if (!url) return null;
  // git@github.com:owner/repo.git -> https://github.com/owner/repo
  let m = url.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (m) return `https://${m[1]}/${m[2]}`;
  m = url.match(/^(https?:\/\/.+?)(?:\.git)?$/);
  if (m) return m[1];
  m = url.match(/^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/);
  if (m) return `https://${m[1]}/${m[2]}`;
  return url;
}

// Flatten tree file paths into a Set for churn existence filtering.
function collectPaths(tree) {
  const set = new Set();
  (function rec(node) {
    if (node.type === "file") set.add(node.path);
    if (node.children) for (const c of node.children) rec(c);
  })(tree);
  return set;
}

// ---------------------------------------------------------------------------
// Notable / entry-point hints (best-effort, non-authoritative)
// ---------------------------------------------------------------------------

function findNotable(repoPath, tree) {
  const notable = { readme: null, license: null, entryHints: [], ciConfigs: [], containerFiles: [] };
  const topFiles = (tree.children || []).filter((c) => c.type === "file").map((c) => c.path);
  for (const p of topFiles) {
    const b = basename(p).toLowerCase();
    if (!notable.readme && /^readme(\.|$)/.test(b)) notable.readme = p;
    if (!notable.license && /^(license|licence|copying)(\.|$)/.test(b)) notable.license = p;
    if (b === "dockerfile" || b === "docker-compose.yml" || b === "docker-compose.yaml" || b === "compose.yaml" || b === "compose.yml") notable.containerFiles.push(p);
  }
  // common entrypoint names anywhere shallow
  const entryNames = new Set(["main.ts", "main.js", "main.py", "main.go", "main.rs", "index.ts", "index.js", "app.ts", "app.js", "app.py", "server.ts", "server.js", "cli.ts", "cli.js", "__main__.py", "mod.rs", "lib.rs"]);
  (function rec(node, depth) {
    if (!node.children || depth > 3) return;
    for (const c of node.children) {
      if (c.type === "file" && entryNames.has(basename(c.path).toLowerCase())) notable.entryHints.push(c.path);
      else if (c.type === "dir") rec(c, depth + 1);
    }
  })(tree, 0);
  // CI configs
  const ghDir = (tree.children || []).find((c) => c.name === ".github");
  if (ghDir) {
    (function rec(node) {
      if (!node.children) return;
      for (const c of node.children) {
        if (c.type === "file" && /\.(ya?ml)$/.test(c.name)) notable.ciConfigs.push(c.path);
        else if (c.type === "dir") rec(c);
      }
    })(ghDir);
  }
  notable.entryHints = notable.entryHints.slice(0, 15);
  notable.ciConfigs = notable.ciConfigs.slice(0, 15);
  return notable;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { repoPath: null, out: null, commits: DEFAULT_COMMIT_WINDOW, pretty: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out") args.out = argv[++i];
    else if (a === "--commits") args.commits = parseInt(argv[++i], 10) || DEFAULT_COMMIT_WINDOW;
    else if (a === "--pretty") args.pretty = true;
    else if (!a.startsWith("--") && args.repoPath === null) args.repoPath = a;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.repoPath) {
    console.error("Usage: node prepass.mjs <repo-path> [--out <file>] [--commits <n>] [--pretty]");
    process.exit(2);
  }
  const repoPath = resolve(process.cwd(), args.repoPath);
  let st;
  try {
    st = statSync(repoPath);
  } catch (e) {
    console.error(`Cannot access repo path ${repoPath}: ${e.message}`);
    process.exit(2);
  }
  if (!st.isDirectory()) {
    console.error(`Repo path is not a directory: ${repoPath}`);
    process.exit(2);
  }

  const started = Date.now();
  const extraIgnore = parseGitignore(repoPath);
  const walk = buildWalk(repoPath, extraIgnore);
  const paths = collectPaths(walk.tree);
  const manifests = parseManifests(repoPath, walk.tree);
  const git = collectGit(repoPath, args.commits, paths);
  const notable = findNotable(repoPath, walk.tree);

  const output = {
    prepassVersion: PREPASS_VERSION,
    generatedAt: new Date().toISOString(),
    repoPath: toPosix(repoPath),
    repoName: basename(repoPath),
    durationMs: Date.now() - started,
    primaryLanguage: walk.primaryLanguage,
    stats: walk.stats,
    git,
    manifests,
    notable,
    largestFiles: walk.largestFiles,
    fileTree: walk.tree,
  };

  const json = args.pretty ? JSON.stringify(output, null, 2) : JSON.stringify(output);
  if (args.out) {
    const outPath = resolve(process.cwd(), args.out);
    writeFileSync(outPath, json, "utf8");
    console.error(`prepass: wrote ${json.length} bytes to ${outPath}`);
    console.error(`prepass: ${walk.stats.totalFiles} files, ${walk.stats.totalLoc} LOC, ${walk.stats.languages.length} languages, git=${git.isRepo}, ${git.commitsAnalyzed} commits`);
  } else {
    process.stdout.write(json);
  }
  process.exit(0);
}

main();
