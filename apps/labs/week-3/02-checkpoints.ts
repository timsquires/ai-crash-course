// Week 3 — 02: Checkpoints + Human-in-the-Loop (MemorySaver)
// Purpose:
// - Demonstrate pausing and resuming a LangGraph run using MemorySaver.
// - Collect required "details" (city, date, time, partySize). If missing, ask the user and end the turn.
// - On the next user input (same thread_id), resume and complete.
// - Include a QA gate that blocks California recommendations.

import readline from 'node:readline';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ProviderService } from '../src/services/ProviderService.js';
import { PromptService } from '../src/services/PromptService.js';
import { Annotation, StateGraph, START, END, MemorySaver } from '@langchain/langgraph';

type ChatRole = 'system' | 'user' | 'assistant';

type ChatTurn = { role: ChatRole; content: string };

type Details = { city?: string; date?: string; time?: string; partySize?: number };

type DetailsExtraction = { details: { city: string | null; date: string | null; time: string | null; partySize: number | null }; missing: string[] };

type QAResult = { allowed: boolean; reasons: string[] };

// JSON Schemas for structured outputs
const DetailsSchema = {
  type: 'object',
  properties: {
    details: {
      type: 'object',
      properties: {
        city: { type: ['string', 'null'] },
        date: { type: ['string', 'null'] },
        time: { type: ['string', 'null'] },
        partySize: { type: ['number', 'null'] },
      },
      required: ['city', 'date', 'time', 'partySize'],
      additionalProperties: false,
    },
    missing: { type: 'array', items: { type: 'string' } },
  },
  required: ['details', 'missing'],
  additionalProperties: false,
} as const;

const QaSchema = {
  type: 'object',
  properties: {
    allowed: { type: 'boolean' },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['allowed', 'reasons'],
  additionalProperties: false,
} as const;

// State definition with reducers
const ChatState = Annotation.Root({
  // Full transcript; nodes append new messages by returning a delta array
  messages: Annotation<ChatTurn[]>({
    reducer: (prev, update) => (prev ?? []).concat(Array.isArray(update) ? update : []),
    default: () => [],
  }),
  // Details collected so far; shallow-merged so partial updates accumulate
  details: Annotation<Details | undefined>({
    reducer: (prev, update) => ({ ...(prev ?? {}), ...(update ?? {}) }),
    default: () => ({}),
  }),
  // Missing detail keys; overwritten each extraction
  missing: Annotation<string[] | undefined>({
    reducer: (_prev, update) => update,
    default: () => undefined,
  }),
  // Latest assistant text for convenience
  assistantText: Annotation<string | undefined>({
    reducer: (_prev, update) => update,
    default: () => undefined,
  }),
  // QA result before recommending
  qa: Annotation<QAResult | undefined>({
    reducer: (_prev, update) => update,
    default: () => undefined,
  }),
});

function toLangChainMessages(history: ChatTurn[], systemOverride?: string): BaseMessage[] {
  const out: BaseMessage[] = [];
  let systemInjected = false;
  for (const m of history) {
    if (m.role === 'system') {
      if (systemOverride && !systemInjected) {
        out.push(new SystemMessage(systemOverride));
        systemInjected = true;
      } else {
        out.push(new SystemMessage(m.content));
      }
    } else if (m.role === 'user') {
      out.push(new HumanMessage(m.content));
    } else {
      out.push(new AIMessage(m.content));
    }
  }
  if (systemOverride && !systemInjected) out.unshift(new SystemMessage(systemOverride));
  return out;
}

export default async function main() {
  const promptService = new PromptService();
  const model = ProviderService.buildModel('openai', { model: process.env.OPENAI_MODEL || 'gpt-4o-mini' });

  // NODE: extract_details — LLM structured extraction
  const extractDetails = async (s: typeof ChatState.State) => {
    console.log('[extract_details] Starting details extraction');
    const sys = await promptService.render('03-02-details-extractor');
    const transcript = s.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const msgs = [new SystemMessage(sys), new HumanMessage(transcript)];
    try {
      const extractor = (model as any).withStructuredOutput(DetailsSchema, { name: 'DetailsExtraction' });
      const parsed = (await extractor.invoke(msgs)) as DetailsExtraction;
      const details: Details = {
        city: parsed.details.city ?? undefined,
        date: parsed.details.date ?? undefined,
        time: parsed.details.time ?? undefined,
        partySize: parsed.details.partySize ?? undefined,
      };
      console.log('[extract_details] Parsed details:', details);
      console.log('[extract_details] Missing keys:', parsed.missing);
      return { details, missing: parsed.missing };
    } catch {
      // On failure, treat everything as missing to force a clarifying question
      console.log('[extract_details] Extraction failed; marking all as missing');
      return { missing: ['city', 'date', 'time', 'partySize'] };
    }
  };

  // NODE: ask_for_details — LLM asks only for missing fields, then END (pause)
  const askForDetails = async (s: typeof ChatState.State) => {
    console.log('[ask_for_details] Missing details detected:', s.missing ?? []);
    const sys = await promptService.render('03-02-ask-for-details', { missing: s.missing ?? [] });
    // We place the instruction in a system message and add a dummy human message
    // to trigger generation; the model should output a single assistant line.
    const msgs = [new SystemMessage(sys), new HumanMessage('Please ask succinctly.')];
    const ai = await model.invoke(msgs);
    const text = String(ai.content ?? '').trim();
    console.log('[ask_for_details] Prompting user for missing details.');
    return {
      assistantText: text,
      messages: [{ role: 'assistant', content: text }],
    };
  };

  // NODE: qa_validate — LLM structured validation for California restriction
  const qaValidate = async (s: typeof ChatState.State) => {
    console.log('[qa_validate] Validating California restriction');
    const sys = await promptService.render('03-02-qa-no-california');
    const transcript = s.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const detailStr = JSON.stringify(s.details ?? {});
    const msgs = [new SystemMessage(sys), new HumanMessage(`Details: ${detailStr}\nTranscript:\n${transcript}`)];
    try {
      const validator = (model as any).withStructuredOutput(QaSchema, { name: 'QaResult' });
      const parsed = (await validator.invoke(msgs)) as QAResult;
      console.log('[qa_validate] Result:', parsed);
      return { qa: parsed };
    } catch {
      console.log('[qa_validate] Validator parse error; defaulting to blocked');
      return { qa: { allowed: false, reasons: ['Validator parse error'] } };
    }
  };

  // NODE: recommend — LLM final recommendation
  const recommend = async (s: typeof ChatState.State) => {
    console.log('[recommend] Producing final recommendation');
    const sys = await promptService.render('03-02-recommender');
    const msgs = toLangChainMessages(s.messages, sys);
    const ai = await model.invoke(msgs);
    const text = String(ai.content ?? '').trim();
    return {
      assistantText: text,
      messages: [{ role: 'assistant', content: text }],
    };
  };

  // NODE: restricted_notice — deterministic block message
  const restrictedNotice = async (_s: typeof ChatState.State) => {
    console.log('[restricted_notice] Blocking California recommendation');
    const text = 'We can’t provide recommendations in California.';
    return {
      assistantText: text,
      messages: [{ role: 'assistant', content: text }],
    };
  };

  // Router helpers
  const hasMissing = (s: typeof ChatState.State) => Array.isArray(s.missing) && s.missing.length > 0;

  // GRAPH: START → extract_details → (missing? ask_for_details : qa_validate → (allowed? recommend : restricted_notice)) → END
  const graph = new StateGraph(ChatState)
    .addNode('extract_details', extractDetails)
    .addNode('ask_for_details', askForDetails)
    .addNode('qa_validate', qaValidate)
    .addNode('recommend', recommend)
    .addNode('restricted_notice', restrictedNotice)

    .addEdge(START, 'extract_details')
    .addConditionalEdges('extract_details', (s) => (hasMissing(s) ? 'ask' : 'qa'), {
      ask: 'ask_for_details',
      qa: 'qa_validate',
    })
    .addConditionalEdges('qa_validate', (s) => (s.qa?.allowed ? 'go' : 'block'), {
      go: 'recommend',
      block: 'restricted_notice',
    })
    .addEdge('ask_for_details', END)
    .addEdge('recommend', END)
    .addEdge('restricted_notice', END)
    
    // Pass in the checkpointer to persist the state across invocations
    // MemorySaver is a simple in-memory checkpointer that persists the state across invocations
    // Other options are available like PostgresSaver, MongoSaver, RedisSaver, etc.
    .compile({ checkpointer: new MemorySaver() });

    console.log('Mermaid graph:');
    console.log((await graph.getGraphAsync()).drawMermaid());

  // Interactive driver with a stable thread id to persist checkpoints
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  console.log('Checkpoints Demo (type "bye" to exit)');
  console.log('Instructions: Ask for a fast-casual recommendation and include city, date (YYYY-MM-DD), time (HH:MM), and partySize.');
  const threadId = 'demo-thread-02'; // static for demo; could be uuid

  // Seed a system message to mark the session start
  let current: typeof ChatState.State | undefined;
  let turn = 0;

  while (true) {
    const user = (await ask('USER: ')).trim();
    if (/^(bye|exit|quit)$/i.test(user)) break;

    turn += 1;
    console.log(`\n[driver] Turn ${turn}: invoking graph`);
    // IMPORTANT: Pass in a thread_id to persist the state across invocations
    current = await graph.invoke({ messages: [{ role: 'user', content: user }] }, { configurable: { thread_id: threadId } });

    const lastAssistant = current.assistantText ?? current.messages.filter((m) => m.role === 'assistant').slice(-1)[0]?.content ?? '';
    console.log('ASSISTANT:', String(lastAssistant).trim());
    if (current.missing && current.missing.length > 0) {
      console.log('[driver] Paused: missing details →', current.missing.join(', '));
      console.log('[driver] Provide the requested info and press Enter to continue.');
    }
    if (current.details && Object.keys(current.details).length > 0) {
      console.log('[driver] Details so far:', JSON.stringify(current.details));
    }
    if (current.qa) {
      console.log('[driver] QA result:', JSON.stringify(current.qa));
    }
  }

  rl.close();
}


