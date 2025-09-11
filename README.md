## AI Crash Course Labs

This monorepo contains a hands-on set of small scripts for training a development team to build with LLMs. The primary focus for now is the Labs app under `apps/labs`. It includes progressively more advanced exercises demonstrating message construction, token usage, context management, summarization, and tool/function calling with OpenAI models.


### Prerequisites

- Node.js >= 18
- An OpenAI API key

### Quick start

1) Install dependencies (from repo root):

```sh
npm install
```

2) Create an env file for Labs:

```sh
cp apps/labs/.env.example apps/labs/.env # if present; otherwise create manually
```

Add your credentials to `apps/labs/.env`:

```ini
OPENAI_API_KEY=sk-your-key
# Optional: override the default
OPENAI_MODEL=gpt-5-mini
```

3) Run a lab script from the repo root. The runner defaults to `week-1/` when a bare name is provided.

```sh
# General form
npm run lab 01-message-basics

# Explicit path
npm run lab week-1/04-rolling-summaries
```

You can also run from within the Labs workspace:

```sh
cd apps/labs
npm run lab week-1/05-tool-calls
```

### VS Code debugging

Launch configurations are provided in `.vscode/launch.json` for all Week 1 labs:

- Labs: Run script (prompt)
- Labs: Run 01-message-basics
- Labs: Run 02-tokens
- Labs: Run 03-last-k-messages
- Labs: Run 04-rolling-summaries
- Labs: Run 05-tool-calls
- Labs: Run 06-tool-calls-expanded
- Labs: Run 07-temperature
- Labs: Run 08-abstraction (provider prompt/openai/claude/gemini/grok)
- Labs: Run 09-prompt-management
- Labs: Run 10-prompt-management-protected
- Labs: Run 11-structured-output
 - Labs: Run 12-streaming

These use `npm --workspace=@repo/labs run lab` and load environment variables from `apps/labs/.env`.

### What’s in Week 1

- 01-message-basics: Build a conversation with a system persona and multiple turns; summarize at the end.
- 02-tokens: Show API-reported token usage per turn.
- 03-last-k-messages: Keep only the last K messages plus the system prompt when prompting the model.
- 04-rolling-summaries: Use running summaries to compress long threads. Token counts use `@dqbd/tiktoken`.
- 05-tool-calls: Demonstrate a basic tool/function call round-trip (assistant requests tool → local function runs → tool result → assistant answer).
- 06-tool-calls-expanded: Show missing-parameter clarification before tool use; then execute tool and produce a grounded answer.
- 07-temperature: Compare low vs high temperature outputs (same prompt, multiple trials).
- 08-abstraction: Re-implements tool calling using LangChain with swappable providers (OpenAI, Claude, Gemini, Grok).
- 09-prompt-management: Loads system prompts from .md files, compiles with Handlebars parameters and conditionals, and uses LangChain for the run.
- 10-prompt-management-protected: Similar to lab 09 but with prompt injection protection.
- 11-structured-output: Runs a COA mapping prompt and parses structured JSON output via LangChain.
 - 12-streaming: Streams output two ways (raw iterator and events), plus cancellation, using a menu copy optimizer prompt.

### Labs runner

The Labs runner (`apps/labs/src/runner.ts`) loads `apps/labs/.env`, resolves the script based on the argument you pass, and dynamically imports the corresponding `week-x/<name>.ts` file. Each script exports a default async function and logs its own teaching output.

### Notes

- These examples make real API calls. Costs may be incurred. Prefer small, affordable models (default is `gpt-5-mini`).
- Some labs log full message chains and token usage for teaching clarity.
- If a lab references tools, make sure your environment allows outgoing requests and your API key is valid.