# Week 2 – RAG Uploads, Chunking, and Retrieval

## How document upload works (test page → API)

1. Open `apps/chat-widget/public/test.html`.
   - Enter API URL, choose an agent (e.g., `fast-casual-rag`), set options.
   - Toggle “RAG enabled (thread parameter)” to create RAG threads.
2. Upload documents
   - Use the “Upload Documents” section to select files (pdf/docx/txt) and click Upload.
   - The page sends `POST /documents/upload?accountId=...` (multipart) to the API.
3. API ingestion pipeline
   - `KnowledgeController` → `KnowledgeService.ingest`.
   - `DocumentLoaderService` parses files to text.
   - `ChunkingStrategy` splits text into chunks (default: `SlidingWindowChunker`, token‑aware).
   - `EmbeddingsService` creates embeddings.
   - Chunks + embeddings are persisted (Postgres with pgvector or Mongo arrays) via repositories.
4. Delete all documents
   - “Delete All Documents” calls `DELETE /documents?accountId=...` to purge docs/chunks.

## How the chunking strategy is selected

- The splitter is behind a DI token: `CHUNKING_STRATEGY`.
- In `KnowledgeModule` it is bound as `{ provide: CHUNKING_STRATEGY, useClass: SlidingWindowChunker }`.
- `KnowledgeService` depends only on the interface and calls `this.chunker.split(text)`.
- To swap strategies, provide a different class for the token (or make it configurable by env).

---

## Task 1: Replace sliding window with a restaurant section chunker

Goal: Improve RAG by chunking per restaurant section (like `apps/labs/week-2/03-custom-chunking.ts`).

What to build

- Create a new class (e.g., `RestaurantSectionChunker`) implementing `ChunkingStrategy` in `apps/api/src/knowledge/chunking/`.
- Split content by restaurant headings; each section becomes one chunk.
- Include the restaurant name in `Chunk.metadata` (e.g., `{ restaurant: 'Chipotle Mexican Grill' }`).
- Return `Chunk[]` where each `Chunk` has:
  - `content`: canonical heading + section body
  - `charCount`, optional `tokenCount`
  - `metadata.restaurant`: canonical restaurant name

Where to wire it

- In `KnowledgeModule`, change the provider:
  ```ts
  { provide: CHUNKING_STRATEGY, useClass: RestaurantSectionChunker }
  ```
- `KnowledgeService.ingest` will automatically use the new strategy; your `metadata.restaurant` will be stored with each chunk.

Hints

- Reuse the approach from `apps/labs/week-2/03-custom-chunking.ts` (aliases + heading regex).
- Keep headings in chunk content to strengthen embeddings.
- Validate by uploading a sample set and inspecting `chunks.metadata`.

Acceptance criteria

- Upload yields chunks with `metadata.restaurant` for recognized headings.
- Postgres/Mongo rows show restaurant metadata.
- RAG answers become more brand‑specific.

---

## Task 2: Pre‑filter chunks by restaurant before top‑k

Goal: If the user clearly mentions a restaurant, search only those chunks before top‑k similarity.

What to change

- In `threads.service.ts` (RAG branch), detect a restaurant from `dto.message`.
- If detected:
  - Query the repository using a pre‑filtered set where `metadata.restaurant = <name>` before top‑k.
  - Else, fall back to global top‑k.

Repository changes (either approach)

- Postgres: add a WHERE on metadata JSONB and use pgvector ordering
  ```sql
  SELECT ...
  FROM chunks
  WHERE "accountId" = $1
    AND metadata->>'restaurant' = $2
  ORDER BY embedding_vec <#> $3
  LIMIT $4
  ```
  Implement as `searchTopKByRestaurant(accountId, restaurant, queryEmbedding, k)`.
- Mongo: query filter `{ accountId, 'metadata.restaurant': restaurant }` then in‑memory cosine on the reduced set.

Detection strategy

- Start simple: case‑insensitive substring match against a canonical alias list.
- Better improvement: use an llm call to detect the restaurant last discussed mapping it to a known restaurant name.

Acceptance criteria

- When the user mentions “Chipotle” (or alias), retrieval is restricted to `metadata.restaurant = 'Chipotle Mexican Grill'` before top‑k.
- When no restaurant is detected, global top‑k behaves as before.
- RAG answers remain grounded and concise.

---

## Optional extras

- Add an env toggle to switch between `RestaurantSectionChunker` and `SlidingWindowChunker`.
- Include `docId/page` in logged context blocks for easier tracing.
- Add a small unit test for the section splitter and restaurant detector.

---

## Task 3: Query Rewriting (LLM‑assisted)

Goal: Improve retrieval by rewriting the user’s query using conversation history, producing a richer, context‑aware search query.

What to build

- Add a small “query rewriting” step before embedding in the RAG branch of `threads.service.ts`:
  1. Gather the recent message history (last N turns + the latest user query).
  2. Call the LLM with a compact prompt that asks it to return a single, expanded search query string (no analysis prose).
  3. Use the rewritten query for embedding and retrieval instead of the raw user query.
- Keep the LLM call ephemeral (not persisted); if rewriting fails or returns empty, fall back to the original user query.

Where to put prompt

- Create `apps/api/prompts/query-rewrite.md` with brief instructions, e.g.:

  ```
  You rewrite user search queries.
  Given the conversation history and the latest user question, output ONE improved query string that captures entities, brands, and context.
  Do not add quotes or extra commentary. Output only the query text.

  ### History (most recent last)
  {{{history}}}

  ### Latest question
  {{{question}}}
  ```

- Load it via `PromptService.render('query-rewrite', { history, question })`.

Implementation notes

- Limit history to a few recent turns to keep latency low.
- Ensure you embed the rewritten text, not the prompt.
- Log the rewritten query (for dev visibility) but don’t persist it.

Acceptance criteria

- When a query is vague (e.g., “compare value”), the rewritten query adds entities/brands from history.
- Retrieval uses the rewritten query for embedding, leading to more relevant chunks.
- If rewriting fails, system falls back gracefully to the original query.
