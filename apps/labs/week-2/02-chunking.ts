// Week 2 — 02: Chunking (Token‑aware sliding window)
// Purpose: Read normalized documents from Lab 1 output, split them into
//          overlapping token chunks, and write chunks + a manifest for later labs.
// No CLI args — fixed input/output locations for simplicity.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { encoding_for_model } from "@dqbd/tiktoken";

type IndexEntry = {
  id: string;
  sourcePath: string;
  mimeType: string;
  page?: number;
};

type Chunk = {
  docId: string;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  charCount: number;
  startToken: number;
  endToken: number; // exclusive
  contentHash: string;
  sourcePath: string;
  mimeType: string;
  page?: number;
  version: {
    lab: string;
    encoder: string;
    chunkTokens: number;
    overlapTokens: number;
  };
};

// Config (kept at top for easy tweaking without CLI flags)
const MODEL_FOR_TOKENIZATION = "gpt-4o-mini"; // matches cl100k_base family
const CHUNK_TOKENS = 200;
const OVERLAP_TOKENS = 25;

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function normalizeContent(input: string): string {
  const unified = input.replace(/\r\n?/g, "\n");
  const trimmedLines = unified
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n");
  const collapsed = trimmedLines.replace(/\n{3,}/g, "\n\n");
  return collapsed.trim();
}

function sha1(text: string): string {
  return crypto.createHash("sha1").update(text).digest("hex");
}

async function readIndex(indexPath: string): Promise<IndexEntry[]> {
  const buf = await fsp.readFile(indexPath, "utf8");
  const entries = JSON.parse(buf) as Array<
    IndexEntry & Record<string, unknown>
  >;
  // Keep only the fields we care about
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
  // Reconstruct the text file path from the id naming convention used in Lab 1
  // Lab 1 uses a sanitized filename of `${id}.txt` under text/
  const safeBase = id.replace(/[^a-zA-Z0-9\-_.:]/g, "_").slice(0, 200);
  const textPath = path.join(baseDir, "text", `${safeBase}.txt`);
  try {
    const txt = await fsp.readFile(textPath, "utf8");
    return txt;
  } catch {
    return null;
  }
}

export default async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const lab1OutDir = path.resolve(here, "output/01-document-loading");
  const indexPath = path.join(lab1OutDir, "index.json");
  const outDir = path.resolve(here, "output/02-chunking");
  ensureDirSync(outDir);

  console.log("Week-2 / 02-chunking");
  console.log("Reading index:", path.relative(process.cwd(), indexPath));

  if (!fs.existsSync(indexPath)) {
    console.error(
      "Missing Lab 1 output. Run week-2/01-document-loading first.",
    );
    return;
  }

  const entries = await readIndex(indexPath);
  if (entries.length === 0) {
    console.log("Index is empty — nothing to chunk.");
    return;
  }

  const enc = encoding_for_model(MODEL_FOR_TOKENIZATION as any);
  const chunksPath = path.join(outDir, "chunks.json");
  const manifestPath = path.join(outDir, "manifest.json");
  const allChunks: Chunk[] = [];

  let totalChunks = 0;
  let totalTokens = 0;
  let totalDocs = 0;
  const perDocStats: Array<{
    id: string;
    tokens: number;
    chunks: number;
    avgChunkTokens: number;
  }> = [];

  try {
    for (const e of entries) {
      // Skip dotfiles or system files if they sneak into index
      if (e.id.startsWith(".")) continue;

      const raw = await readDocText(lab1OutDir, e.id);
      if (!raw) continue;
      const text = normalizeContent(raw);
      const tokens = enc.encode(text);
      const tokenCount = tokens.length;

      const chunkTokens = Math.max(1, CHUNK_TOKENS);
      const overlapTokens = Math.min(
        Math.max(0, OVERLAP_TOKENS),
        Math.max(0, chunkTokens - 1),
      );
      const step = Math.max(1, chunkTokens - overlapTokens);

      let docChunkCount = 0;
      for (let start = 0; start < tokenCount; start += step) {
        const end = Math.min(start + chunkTokens, tokenCount);
        const slice = tokens.slice(start, end);
        const decoded = enc.decode(slice) as unknown;
        const content =
          typeof decoded === "string"
            ? decoded
            : new TextDecoder("utf-8").decode(decoded as Uint8Array);

        const outChunk: Chunk = {
          docId: e.id,
          chunkIndex: docChunkCount,
          content,
          tokenCount: slice.length,
          charCount: content.length,
          startToken: start,
          endToken: end,
          contentHash: sha1(content),
          sourcePath: e.sourcePath,
          mimeType: e.mimeType,
          page: e.page,
          version: {
            lab: "02-chunking",
            encoder: String(MODEL_FOR_TOKENIZATION),
            chunkTokens,
            overlapTokens,
          },
        };

        allChunks.push(outChunk);
        docChunkCount += 1;
      }

      totalDocs += 1;
      totalChunks += docChunkCount;
      totalTokens += tokenCount;
      perDocStats.push({
        id: e.id,
        tokens: tokenCount,
        chunks: docChunkCount,
        avgChunkTokens: docChunkCount
          ? Math.round(tokenCount / docChunkCount)
          : 0,
      });

      console.log(`- ${e.id}: tokens=${tokenCount}, chunks=${docChunkCount}`);
    }
  } finally {
    enc.free();
  }

  const avgTokensPerDoc = totalDocs ? Math.round(totalTokens / totalDocs) : 0;
  const avgTokensPerChunk = totalChunks
    ? Math.round(totalTokens / totalChunks)
    : 0;
  const manifest = {
    lab: "02-chunking",
    encoder: MODEL_FOR_TOKENIZATION,
    config: { CHUNK_TOKENS, OVERLAP_TOKENS },
    totals: {
      totalDocs,
      totalChunks,
      totalTokens,
      avgTokensPerDoc,
      avgTokensPerChunk,
    },
    perDoc: perDocStats,
  };
  await fsp.writeFile(chunksPath, JSON.stringify(allChunks, null, 2), "utf8");
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\nWrote:");
  console.log(" -", path.relative(process.cwd(), chunksPath));
  console.log(" -", path.relative(process.cwd(), manifestPath));
}
