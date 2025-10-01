// Week 3 — 01: LangGraph Food Critic (with QA Topic Gate)
// Purpose:
// - Demonstrate a minimal LangGraph in TypeScript with:
//   - State definition via Annotation.Root
//   - Three nodes: answer (LLM), qa_validate (LLM), off_topic_reject (deterministic)
//   - START/END edges and a conditional edge to branch on QA result
// - Interactive REPL-style chat loop, maintaining full conversation history in graph state
// - Main system prompt is static and intentionally unconstrained (snarky restaurant critic)

import readline from 'node:readline';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ProviderService } from '../src/services/ProviderService.js';
import { PromptService } from '../src/services/PromptService.js';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';

// Type definitions for various nodes
type ChatRole = 'system' | 'user' | 'assistant';

type ChatTurn = {
  role: ChatRole;
  content: string;
};

type QAResult = {
  isOnTopic: boolean;
  confidence: number;
  reasons: string[];
};

// JSON Schema used for structured outputs from the QA node
const QaJsonSchema = {
  type: 'object',
  properties: {
    isOnTopic: { type: 'boolean' },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasons: { type: 'array', items: { type: 'string' } },
  },
  required: ['isOnTopic', 'confidence', 'reasons'],
  additionalProperties: false,
} as const;

type Parameters = {
  offTopicMessage?: string;
};

// End type definitions


// Defined state for node communication
const ChatState = Annotation.Root({
  // messages accumulates the full chat transcript. The reducer concatenates new
  // message arrays so nodes can return only their deltas. The default is [] so
  // the graph starts with an empty transcript unless we seed it before invoke().
  messages: Annotation<ChatTurn[]>({
    // prev is the value of the property before the update, update is the new value
    // provided by the node mutating the state
    reducer: (prev, update) => {
      const next = Array.isArray(update) ? update : [];
      return (prev ?? []).concat(next);
    },
    default: () => [],
  }),
  // assistantText holds the most recent assistant reply. Nodes that produce
  // assistant output should set this, enabling downstream nodes (like QA) to
  // evaluate the latest turn without searching the transcript.
  assistantText: Annotation<string | undefined>({
    reducer: (_prev, update) => update,
    default: () => undefined,
  }),
  // qa stores the topic validation result returned by the QA node. The reducer
  // simply overwrites the previous value since each turn should have a single
  // authoritative QA result.
  qa: Annotation<QAResult | undefined>({
    reducer: (_prev, update) => update,
    default: () => undefined,
  }),
  // parameters holds simple configuration like the off-topic message; 
  // reducers merge shallowly to allow nodes to override specific fields if needed.
  parameters: Annotation<Parameters | undefined>({
    reducer: (prev, update) => ({ ...(prev ?? {}), ...(update ?? {}) }),
    default: () => ({}),
  }),
});

// Convert our plain ChatTurn history into LangChain Message objects and, if
// provided, inject a rendered system prompt as the first system message.
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
      // assistant
      out.push(new AIMessage(m.content));
    }
  }
  if (systemOverride && !systemInjected) {
    out.unshift(new SystemMessage(systemOverride));
  }
  return out;
}

// Entry point for the lab script. The runner dynamically imports this module
// and calls the default export. This function wires up the model, prompts,
// graph topology, and an interactive console loop.
export default async function main() {
  const promptService = new PromptService();
  const model = ProviderService.buildModel('openai', {
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  });

  const parameters: Parameters = {
    offTopicMessage: 'I only dish on restaurants. Ask me about fast‑casual menus, spots, or service.',
  };

  const initialHistory: ChatTurn[] = [
    { role: 'system', content: 'Food critic session started.' },
  ];

  let state = {
    messages: initialHistory,
    parameters,
  } as typeof ChatState.State;

  // NODE: answer (LLM)
  // - Renders the main system prompt (snarky restaurant critic)
  // - Sends the entire message history plus the injected system to the model
  // - Returns only the delta: the assistant's new message and assistantText
  const answerNode = async (s: typeof ChatState.State) => {
    // Render the system prompt
    const renderedSystem = await promptService.render('food-critic-snarky');

    // Convert the history to LangChain Messages
    const msgs = toLangChainMessages(s.messages, renderedSystem);
    // Invoke the model
    const ai = await model.invoke(msgs);
    // Convert the model response to a string
    const text = typeof ai.content === 'string' ? ai.content : (Array.isArray(ai.content) ? ai.content.map((c: any) => c.text ?? '').join('\n') : String(ai.content));

    // Return the new messages and assistant text, note we are just returning the new messages and assistant text, we are not mutating the state
    return {
      messages: [{ role: 'assistant', content: text }],
      assistantText: text,
    };
  };

  // NODE: qa_validate (LLM)
  // - Renders a QA system prompt that instructs the model to output strict JSON
  // - Provides a bounded (here: full) transcript and the latest assistant reply
  // - Parses the JSON; on failure, marks off-topic to demonstrate deterministic fallback
  const qaNode = async (s: typeof ChatState.State) => {
    // Render the QA system prompt
    const qaSystem = await promptService.render('qa-restaurant-only');

    // Convert the history to a string
    const transcript = s.messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const evaluationInput = `Transcript (bounded):\n${transcript}\n\nLast assistant reply:\n${s.assistantText ?? ''}`;

    // Convert the history to LangChain Messages
    const msgs = [new SystemMessage(qaSystem), new HumanMessage(evaluationInput)];
    try {
      // Ask the model for a structured object that conforms to QaJsonSchema
      const qaModel = (model as any).withStructuredOutput(QaJsonSchema, { name: 'QaResult' });
      const parsed = (await qaModel.invoke(msgs)) as QAResult;
      return { qa: parsed };
    } catch {
      // Deterministic fallback when the model fails to produce valid structure
      return { qa: { isOnTopic: false, confidence: 0.3, reasons: ['Validator parse error'] } };
    }
  };

  // NODE: off_topic_reject (deterministic)
  // - If QA flags the reply as off-topic, replace the assistant output with a
  //   fixed, predictable message. This node does not call an LLM.
  const offTopicRejectNode = async (s: typeof ChatState.State) => {
    const text = s.parameters?.offTopicMessage || 'I only dish on restaurants. Ask me about fast‑casual menus, spots, or service.';
    return {
      assistantText: text,
      messages: [{ role: 'assistant', content: text }],
    };
  };

  // GRAPH TOPOLOGY
  // - START -> answer -> qa_validate -> (conditional) -> END | off_topic_reject -> END
  // - addNode registers node handlers
  // - addEdge wires linear flow
  // - addConditionalEdges branches based on a router function's returned label
  // - compile finalizes the graph into an executable runnable
  const graph = new StateGraph(ChatState)
    // Add nodes to the graph
    .addNode('answer', answerNode)
    .addNode('qa_validate', qaNode)
    .addNode('off_topic_reject', offTopicRejectNode)
    // Add edges to the graph
    // Always start with the START node
    .addEdge(START, 'answer')
    // After the answer node, we validate the topic
    .addEdge('answer', 'qa_validate')
    // If the topic is valid, we end the graph
    // If the topic is invalid, we go to the off_topic_reject node
    .addConditionalEdges('qa_validate', 
         // Router function to determine the next node to go to
         // if the topic is valid, we go to the end node
         // if the topic is invalid, we go to the off_topic_reject node
        (state) => (state.qa?.isOnTopic ? 'end' : 'off_topic_reject'), 
        // object to define the nodes to go to based on the labels returned by the router function
        {
            end: END,
            off_topic_reject: 'off_topic_reject',
        })
    // After an off-topic rejection, terminate the graph
    .addEdge('off_topic_reject', END)
    .compile();

    console.log('Mermaid graph:');
    console.log((await graph.getGraphAsync()).drawMermaid());

  // INTERACTIVE LOOP
  // - Accept user input, append a user message delta, and invoke the graph
  // - The Annotation reducers merge the delta into state for the next turn
  // - Print the assistant's reply and the QA result for teaching visibility
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));

  console.log('Food Critic (type "bye" to exit)');

  let current = state;
  while (true) {
    const user = (await ask('USER: ')).trim();
    if (/^(bye|exit|quit)$/i.test(user)) break;

    current = await graph.invoke({ ...current, messages: [{ role: 'user', content: user }] } );

    const lastAssistant = current.assistantText ?? current.messages.filter((m) => m.role === 'assistant').slice(-1)[0]?.content ?? '';
    console.log('ASSISTANT:', String(lastAssistant).trim());
    if (current.qa) {
      console.log('QA:', JSON.stringify(current.qa, null, 2));
    }
  }

  rl.close();
}


