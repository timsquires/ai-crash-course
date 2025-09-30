// Week 2 — 03: Custom Chunking by Restaurant Sections
// Purpose: Split each Lab 1 text document into sections per restaurant brand
//          (e.g., Chipotle Mexican Grill, Panera Bread, Shake Shack, Chick-fil-A, Five Guys, Firehouse Subs).
//          Each section becomes its own chunk/document, preserving source metadata.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type IndexEntry = {
  id: string;
  sourcePath: string;
  mimeType: string;
  page?: number;
};

type SectionChunk = {
  docId: string;
  sectionIndex: number;
  restaurant: string;
  aliasesMatched: string[];
  content: string;
  charCount: number;
  sourcePath: string;
  mimeType: string;
  page?: number;
};

// Canonical restaurant list used to detect section headings.
// Each item contains a display name and a set of aliases we match on their own line.
const RESTAURANTS = [
  {
    name: "Chipotle Mexican Grill",
    aliases: ["Chipotle Mexican Grill", "Chipotle"],
  },
  {
    name: "Panera Bread",
    aliases: ["Panera Bread", "Panera"],
  },
  {
    name: "Shake Shack",
    aliases: ["Shake Shack"],
  },
  {
    name: "Chick-fil-A",
    aliases: ["Chick-fil-A", "Chick Fil A", "Chickfila", "Chick fil a"],
  },
  {
    name: "Five Guys",
    aliases: ["Five Guys"],
  },
  {
    name: "Firehouse Subs",
    aliases: ["Firehouse Subs", "Firehouse"],
  },
  {
    name: "MOD Pizza",
    aliases: ["MOD Pizza", "MOD"],
  },
  {
    name: "Qdoba Mexican Eats",
    aliases: ["Qdoba Mexican Eats", "Qdoba"],
  },
  {
    name: "Jersey Mike's Subs",
    aliases: [
      "Jersey Mike's Subs",
      "Jersey Mike’s Subs",
      "Jersey Mikes Subs",
      "Jersey Mike's",
      "Jersey Mike’s",
      "Jersey Mikes",
      "Jersey Mike",
    ],
  },
  {
    name: "Noodles & Company",
    aliases: [
      "Noodles & Company",
      "Noodles and Company",
      "Noodles & Co",
      "Noodles and Co",
    ],
  },
];

/** Create a directory recursively if it does not exist. */
function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Normalize text for consistent parsing and cleaner outputs. */
function normalizeContent(input: string): string {
  const unified = input.replace(/\r\n?/g, "\n");
  const trimmedLines = unified
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n");
  const collapsed = trimmedLines.replace(/\n{3,}/g, "\n\n");
  return collapsed.trim();
}

/** Escape a string for use inside a RegExp literal. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function readIndex(indexPath: string): Promise<IndexEntry[]> {
  const buf = await fsp.readFile(indexPath, "utf8");
  const entries = JSON.parse(buf) as Array<
    IndexEntry & Record<string, unknown>
  >;
  return entries.map((e) => ({
    id: String(e.id),
    sourcePath: String(e.sourcePath),
    mimeType: String(e.mimeType),
    page: (e as any).page,
  }));
}

async function readDocText(
  baseDir: string,
  id: string,
): Promise<string | null> {
  const safeBase = id.replace(/[^a-zA-Z0-9\-_.:]/g, "_").slice(0, 200);
  const textPath = path.join(baseDir, "text", `${safeBase}.txt`);
  try {
    const txt = await fsp.readFile(textPath, "utf8");
    return txt;
  } catch {
    return null;
  }
}

/**
 * Build a RegExp that matches a heading line for any known restaurant alias.
 * We anchor to the start of the line and require the entire line to be the alias
 * (case-insensitive), so we don't accidentally match occurrences inside paragraphs.
 */
function buildSectionRegex(): RegExp {
  const escaped = RESTAURANTS.flatMap((r) => r.aliases).map((a) =>
    a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const alternation = escaped.join("|");
  // Matches heading lines like: "Chipotle Mexican Grill" at start of line
  // Use multiline and case-insensitive flags
  return new RegExp(`^(?:${alternation})\\s*$`, "gim");
}

/**
 * Locate all heading lines and slice the document into contiguous sections.
 * Each section spans from one heading line to the next (or EOF), inclusive of the heading.
 */
function splitByRestaurantSections(
  text: string,
): Array<{ heading: string; start: number; end: number; body: string }> {
  const regex = buildSectionRegex();
  const matches: Array<{ heading: string; index: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    matches.push({ heading: m[0]!, index: m.index });
  }
  if (matches.length === 0) return [];

  const sections: Array<{
    heading: string;
    start: number;
    end: number;
    body: string;
  }> = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i]!.index;
    const end = i + 1 < matches.length ? matches[i + 1]!.index : text.length;
    const heading = matches[i]!.heading.trim();
    const body = text.slice(start, end);
    sections.push({ heading, start, end, body });
  }
  return sections;
}

/** Map a matched heading string to a canonical restaurant and the alias used. */
function resolveRestaurant(
  heading: string,
): { restaurant: string; aliasesMatched: string[] } | null {
  const headingLower = heading.toLowerCase();
  for (const r of RESTAURANTS) {
    const matched = r.aliases.filter((a) => headingLower === a.toLowerCase());
    if (matched.length > 0)
      return { restaurant: r.name, aliasesMatched: matched };
  }
  return null;
}

export default async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const lab1OutDir = path.resolve(here, "output/01-document-loading");
  const indexPath = path.join(lab1OutDir, "index.json");
  const outDir = path.resolve(here, "output/03-custom-chunking");
  ensureDirSync(outDir);

  // Minimal run header. We keep logs light so outputs are easier to read.
  console.log("Week-2 / 03-custom-chunking");
  console.log("Reading index:", path.relative(process.cwd(), indexPath));

  if (!fs.existsSync(indexPath)) {
    console.error(
      "Missing Lab 1 output. Run week-2/01-document-loading first.",
    );
    return;
  }

  const entries = await readIndex(indexPath);
  if (entries.length === 0) {
    console.log("Index is empty — nothing to split.");
    return;
  }

  // Accumulator for emitted chunks and a simple count per restaurant
  const outChunks: SectionChunk[] = [];
  const perRestaurantCounts: Record<string, number> = Object.fromEntries(
    RESTAURANTS.map((r) => [r.name, 0]),
  );

  for (const e of entries) {
    // High-level flow per document:
    // 1) Load the text produced by Lab 1
    // 2) Identify restaurant headings (e.g., "Shake Shack")
    // 3) For each heading, take content up to the next heading
    // 4) Strip the heading line and emit one chunk per restaurant section
    // Skip dot/system artifacts if any made it into index.json
    if (e.id.startsWith(".")) continue;
    const raw = await readDocText(lab1OutDir, e.id);
    if (!raw) continue;
    const text = normalizeContent(raw);

    const sections = splitByRestaurantSections(text);
    if (sections.length === 0) {
      // No recognized section headings; skip quietly but not an error.
      continue;
    }

    let idx = 0;
    for (const sec of sections) {
      const resolved = resolveRestaurant(sec.heading);
      if (!resolved) continue;

      // Keep the heading: build a canonical title + body. This strengthens
      // embeddings and retrieval by anchoring the chunk with the brand name.
      const headingRe = new RegExp(
        "^\\s*" + escapeRegex(sec.heading) + "\\s*",
        "i",
      );
      const body = normalizeContent(sec.body.replace(headingRe, "").trim());
      const content = normalizeContent(`${resolved.restaurant}\n\n${body}`);
      if (!content) continue;

      // Each emitted chunk is a self-contained section for one restaurant.
      // Keeping the heading improves disambiguation and relevance scoring.
      outChunks.push({
        docId: e.id,
        sectionIndex: idx++,
        restaurant: resolved.restaurant,
        aliasesMatched: resolved.aliasesMatched,
        content,
        charCount: content.length,
        sourcePath: e.sourcePath,
        mimeType: e.mimeType,
        page: e.page,
      });
      perRestaurantCounts[resolved.restaurant] =
        (perRestaurantCounts[resolved.restaurant] || 0) + 1;
    }
  }

  const chunksPath = path.join(outDir, "custom-chunks.json");
  await fsp.writeFile(chunksPath, JSON.stringify(outChunks, null, 2), "utf8");

  const manifest = {
    lab: "03-custom-chunking",
    totals: { docsProcessed: entries.length, chunks: outChunks.length },
    restaurants: RESTAURANTS.map((r) => r.name),
    countsByRestaurant: perRestaurantCounts,
  };
  const manifestPath = path.join(outDir, "manifest.json");
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\nWrote:");
  console.log(" -", path.relative(process.cwd(), chunksPath));
  console.log(" -", path.relative(process.cwd(), manifestPath));
}
