// Week 2 — 04: Embedding (custom chunks only)
// Purpose:
// - Load the restaurant-section chunks produced by Lab 3 (custom chunking)
// - Create vector embeddings for each chunk using OpenAI’s embedding model
// - Save a simple JSON output that can be loaded into memory for retrieval later
//
// Why this lab?
// - Embeddings turn text into vectors so we can measure semantic similarity.
// - We keep the output as plain JSON to make the process transparent and easy to inspect.
// - In the retrieval lab, we’ll load this JSON, embed a query, compute cosine similarity,
//   sort, and select the top‑k chunks — no external vector DB required for small datasets.

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { OpenAIEmbeddings } from "@langchain/openai";

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

// The embedded record pairs each vector with its original content and selected metadata.
type Embedded = {
  embedding: number[];
  content: string;
  metadata: {
    docId: string;
    sectionIndex: number;
    restaurant: string;
    sourcePath: string;
    mimeType: string;
    page?: number;
    charCount: number;
  };
};

function ensureDirSync(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function loadCustomChunks(p: string): Promise<SectionChunk[]> {
  // Read Lab 3’s custom chunks as our embedding inputs.
  const buf = await fsp.readFile(p, "utf8");
  const arr = JSON.parse(buf) as SectionChunk[];
  return arr.filter(
    (c) => c && typeof c.content === "string" && c.content.trim().length > 0,
  );
}

export default async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const inputPath = path.resolve(
    here,
    "output/03-custom-chunking/custom-chunks.json",
  );
  const outDir = path.resolve(here, "output/04-embedding");
  ensureDirSync(outDir);

  console.log("Week-2 / 04-embedding");
  console.log("Reading:", path.relative(process.cwd(), inputPath));

  if (!fs.existsSync(inputPath)) {
    console.error("Missing Lab 3 output. Run week-2/03-custom-chunking first.");
    return;
  }

  const chunks = await loadCustomChunks(inputPath);
  if (chunks.length === 0) {
    console.log("No chunks to embed.");
    return;
  }

  // Choose an embedding model.
  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const embedder = new OpenAIEmbeddings({ model });

  const t0 = Date.now();
  // Use embedDocuments to batch requests efficiently.
  const texts = chunks.map((c) => c.content);
  const vectors = await embedder.embedDocuments(texts);
  const elapsedMs = Date.now() - t0;

  // Assemble the output by pairing each vector with its chunk + metadata.
  const out: Embedded[] = vectors.map((v, i) => ({
    embedding: v,
    content: chunks[i]!.content,
    metadata: {
      docId: chunks[i]!.docId,
      sectionIndex: chunks[i]!.sectionIndex,
      restaurant: chunks[i]!.restaurant,
      sourcePath: chunks[i]!.sourcePath,
      mimeType: chunks[i]!.mimeType,
      page: chunks[i]!.page,
      charCount: chunks[i]!.charCount,
    },
  }));

  const embeddingsPath = path.join(outDir, "embeddings.json");
  const manifestPath = path.join(outDir, "manifest.json");

  // Plain JSON keeps it simple to read and load for the next lab.
  await fsp.writeFile(embeddingsPath, JSON.stringify(out, null, 2), "utf8");

  const dimension = out.length > 0 ? out[0]!.embedding.length : 0;
  const manifest = {
    model,
    total: out.length,
    dimension,
    elapsedMs,
    notes:
      "Use this file for in-memory retrieval: load vectors, embed query, compute cosine similarity, take top-k.",
  };
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  console.log("\nWrote:");
  console.log(" -", path.relative(process.cwd(), embeddingsPath));
  console.log(" -", path.relative(process.cwd(), manifestPath));
}
