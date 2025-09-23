// Week 2 — 05: Retrieval Chat (RAG over embeddings)
// Purpose:
// - Load embeddings from Lab 4 (week-2/output/04-embedding/embeddings.json)
// - On each user question: embed the query, retrieve top‑k chunks by cosine similarity,
//   and pass them to the LLM in a system prompt to ground the answer
// - Console chatbot UX similar to week-1/13-contact-chatbot.ts

import readline from 'node:readline';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ProviderService } from '../src/services/ProviderService.js';
import { PromptService } from '../src/services/PromptService.js';
import { OpenAIEmbeddings } from '@langchain/openai';

type Embedded = {
  embedding: number[];
  content: string;
  metadata: {
    docId: string;
    sectionIndex?: number;
    restaurant?: string;
    sourcePath: string;
    mimeType: string;
    page?: number;
    charCount: number;
  };
};

function ensureFileExists(p: string): boolean {
  return fs.existsSync(p);
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function buildSystemPrompt(contextBlocks: string): Promise<string> {
  // Load markdown prompt from apps/labs/prompts/retrieval-chat.md and inject blocks
  const promptService = new PromptService();
  return await promptService.render('retrieval-chat', { contextBlocks });
}

function formatContextBlock(idx: number, e: Embedded): string {
  const title = e.metadata.restaurant ? `${e.metadata.restaurant}` : `${e.metadata.docId}`;
  const location = [e.metadata.docId, e.metadata.page ? `page ${e.metadata.page}` : '', e.metadata.sourcePath]
    .filter(Boolean)
    .join(' • ');
  const maxChars = 1200; // cap any single block
  const body = e.content.length > maxChars ? e.content.slice(0, maxChars) + '…' : e.content;
  return `[#${idx + 1}] ${title}\n${location}\n---\n${body}`;
}

async function loadEmbeddings(baseDir: string): Promise<{ vectors: Embedded[]; model: string; dimension: number } | null> {
  const embeddingsPath = path.join(baseDir, 'output/04-embedding/embeddings.json');
  const manifestPath = path.join(baseDir, 'output/04-embedding/manifest.json');
  if (!ensureFileExists(embeddingsPath) || !ensureFileExists(manifestPath)) return null;
  const [vecBuf, manBuf] = await Promise.all([fsp.readFile(embeddingsPath, 'utf8'), fsp.readFile(manifestPath, 'utf8')]);
  const vectors = JSON.parse(vecBuf) as Embedded[];
  const manifest = JSON.parse(manBuf) as { model: string; dimension: number };
  return { vectors, model: manifest.model, dimension: manifest.dimension };
}

export default async function main() {
  // Validate provider API key presence
  const apiKeyOk = !!(
    process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY || process.env.XAI_API_KEY
  );
  if (!apiKeyOk) {
    console.error('Set provider API keys in apps/labs/.env');
    return;
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const baseDir = here; // week-2 folder

  // 1) Load embeddings built in Lab 4
  const loaded = await loadEmbeddings(baseDir);
  if (!loaded || loaded.vectors.length === 0) {
    console.error('Missing or empty embeddings. Run week-2/04-embedding first.');
    return;
  }
  const { vectors, model: embeddingModel } = loaded;

  // 2) Build the LLM and the embedder used for queries
  const llm = ProviderService.buildModel('openai') as BaseChatModel;
  const embedder = new OpenAIEmbeddings({ model: embeddingModel });

  // 3) Simple chat loop
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  console.log('Retrieval Chat (type "bye" to exit)');

  // Keep a brief transcript for UX; retrieval is done per-turn so we do not need to resend all history
  const transcript: Array<SystemMessage | HumanMessage | AIMessage> = [];

  while (true) {
    const user = await ask('USER: ');
    if (/^(bye|exit|quit)$/i.test(user.trim())) break;

    // 3a) Embed the query and score all vectors via cosine similarity
    const qArr = await embedder.embedDocuments([user]);
    const q = (qArr && qArr[0]) ? qArr[0] : [] as number[];
    const scored = vectors
      .map((v, i) => ({ i, score: cosineSimilarity(q as number[], v.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // 3b) Build context from top‑k
    const context = scored.map(({ i }, idx) => formatContextBlock(idx, vectors[i]!)).join('\n\n');
    const compiled = await buildSystemPrompt(context);
    const system = new SystemMessage(compiled);

    // For teaching/inspection: show exactly what we send to the LLM
    console.log('\n--- LLM INPUT: SYSTEM PROMPT ---');
    console.log(compiled);
    console.log('\n--- LLM INPUT: USER ---');
    console.log(user);

    // 3c) Ask the model, grounded by the retrieved context
    const messages = [system, new HumanMessage(user)];
    const ans = (await llm.invoke(messages)) as AIMessage;

    // 3d) Print answer
    console.log('ASSISTANT:', String(ans.content ?? '').trim());

    // Store last turn (optional, for future extensions)
    transcript.push(system, new HumanMessage(user), ans);
  }

  rl.close();
}


