## AI Crash Course API (Nest.js)

This service stores and serves chat threads. Each thread is a single aggregate that contains:
- thread metadata (agent, model, user/account ids)
- system prompt template and rendered system prompt
- parameters used to render the prompt
- token counters (input/output)
- messages array including system, user, assistant, and tool messages

It supports pluggable persistence:
- Postgres: threads stored in a table with JSONB columns
- MongoDB: threads stored as documents with embedded messages

### Prerequisites
- Node.js >= 18
- Docker (for local Postgres/Mongo)

### Environment
Copy `.env.example` to `.env` and set values:

```ini
# Choose data store
# PERSISTENCE=postgres
# POSTGRES_URL=postgres://postgres:postgres@localhost:5432/ai_crash_course
# or
# PERSISTENCE=mongo
# MONGO_URL=mongodb://localhost:27017/ai_crash_course

# LLM provider and model
LLM_PROVIDER=openai   # one of: openai | claude | gemini | grok
LLM_MODEL=gpt-5-mini

# Provider API keys (blank allowed)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
XAI_API_KEY=
```

### Local databases with Docker

Start Postgres and Mongo (and run Postgres migration):
```sh
npm run db:up
```
Stop containers:
```sh
npm run db:down
```

### Run the API
```sh
npm run start:dev
```
Swagger is served at `/api`.

### Endpoints
- `POST /threads` → create a new thread
  - Body: `{ agent: string, parameters?: object, model?: string, userMessage?: string }`
- `GET /threads/:id` → get the full thread
- `GET /threads?accountId=1` → list threads
- `DELETE /threads/:id` → delete thread
- `POST /threads/:id/chat` → append a user message, run tools/LLM, return last assistant message
  - Body: `{ message: string, metadata?: object }`

#### Knowledge endpoints (RAG ingestion)
- `POST /documents/upload` → multipart upload of one or more files (PDF/DOCX/TXT)
  - Query: `accountId` is required
  - Behavior: parses documents, chunks content (default: token-aware sliding window), generates embeddings, and persists documents and chunks
- `DELETE /documents` → delete all documents and chunks for an account
  - Query: `accountId` is required

Notes:
- MongoDB implementation performs in-memory cosine similarity for retrieval in this repo. For production, use MongoDB Atlas with a `$vectorSearch` index.
- Postgres uses `pgvector` for the `embedding_vec` column and similarity search with the `<#>` operator and an IVFFLAT index.

### Adding an agent

Agents live under `apps/api/agents/<agent-name>` and contain:
- `prompt.md` — system prompt (Handlebars helpers available: `eq`, `ne`, `json`)
- `tools.ts` — exports an array of LangChain tools created via `tool(handler, { name, description, schema })`

Steps:
1) Create a folder and prompt:
```text
apps/api/agents/your-agent/
  prompt.md
  tools.ts
```
2) Implement tools (example):
```ts
import { tool } from '@langchain/core/tools';

const exampleTool = tool(async (input: any) => ({ ok: true, input }), {
  name: 'example_tool',
  description: 'Describe what this tool does',
  schema: {
    type: 'object',
    properties: { foo: { type: 'string' } },
    required: ['foo'],
    additionalProperties: false,
  },
});

export default [exampleTool];
```

3) Create a thread with your agent:
```sh
curl -X POST http://localhost:3000/threads \
  -H 'Content-Type: application/json' \
  -d '{ "agent": "your-agent", "parameters": { "tone": "friendly" } }'
```

4) Chat on the thread:
```sh
curl -X POST http://localhost:3000/threads/<threadId>/chat \
  -H 'Content-Type: application/json' \
  -d '{ "message": "Hello there" }'
```

What happens during chat:
- User message is persisted
- Assistant may return `tool_calls`; the API persists that assistant message
- Each tool is executed and a corresponding tool result message is persisted
- The model is invoked again with the tool results, producing the final assistant message (returned by the API)

### RAG (Retrieval Augmented Generation)

Enabling RAG on a thread:
- `ragEnabled` is a first-class boolean on the `Thread` entity and DTO.
- Create a thread with RAG enabled by passing `ragEnabled: true` in the top-level body (alongside `agent`, `model`, etc.).

How it works at runtime:
- If `ragEnabled` is true, the service embeds the user query, retrieves top‑k relevant chunks for the same `accountId`, renders the system prompt from `apps/api/prompts/retrieval-chat.md` with those context blocks, and prepends that as an ephemeral system message to the existing message chain for that turn.
- Retrieved chunks and the final system prompt are logged to the console for transparency.
- The conversation history is preserved; the retrieval system message is not persisted.

Chunking strategy:
- The default chunker is a token-aware Sliding Window implemented with `@dqbd/tiktoken`.
- The chunker is injectable and swappable via the `CHUNKING_STRATEGY` token in `KnowledgeModule`. You can replace it with a custom implementation (e.g., a restaurant‑section chunker) without changing call sites.

Embeddings:
- Uses OpenAI embeddings (`text-embedding-3-small` by default) via `EmbeddingsService`.
- Postgres writes `embedding_vec` using a two-step flow: save the base row via ORM, then `UPDATE` with a pgvector literal like `[0.1,0.2,...]::vector`.
- Retrieval queries cast parameters to `::vector` and filter out null vectors.

Agent for RAG:
- `fast-casual-rag` provides a minimal prompt instructing the assistant to answer strictly from retrieved content.

### Notes
- For Postgres, schema is created by `apps/api/scripts/migrate.ts` when you run `npm run db:up`.
- For Mongo, no migration is needed.
- The service uses LangChain; tools are bound per agent via the tools array you export.

### Migrations (Postgres)

Run the migration script manually if needed:
```sh
npm run migrate
```

The migration is idempotent and ensures:
- `threads` has a `ragEnabled` column (default false)
- `documents` and `chunks` tables exist
- `CREATE EXTENSION IF NOT EXISTS vector` is applied
- `embedding_vec` is created as `VECTOR(1536)` and is nullable to support the two-step insert
- An IVFFLAT index is created on `embedding_vec` using cosine ops


