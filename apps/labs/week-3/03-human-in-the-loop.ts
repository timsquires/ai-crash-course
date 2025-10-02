// Week 3 — 03: Human-in-the-Loop (mid-graph resume)
// Purpose:
// - Demonstrate pausing a graph at a human approval checkpoint and resuming from that exact point
// - Uses MemorySaver to checkpoint state and execution position keyed by thread_id
// - Verbose comments explain state, nodes, edges, and pause/resume behavior

import readline from 'node:readline';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ProviderService } from '../src/services/ProviderService.js';
import { PromptService } from '../src/services/PromptService.js';
import { Annotation, StateGraph, START, END, MemorySaver } from '@langchain/langgraph';

type ChatRole = 'system' | 'user' | 'assistant';
type ChatTurn = { role: ChatRole; content: string };

type Approval = { status: 'pending' | 'approved' | 'rejected'; comment?: string };

// State definition: transcript + a draft + approval record + latest assistant text
const ReviewState = Annotation.Root({
  messages: Annotation<ChatTurn[]>({
    reducer: (prev, update) => (prev ?? []).concat(Array.isArray(update) ? update : []),
    default: () => [],
  }),
  draft: Annotation<string | undefined>({
    reducer: (_prev, update) => update,
    default: () => undefined,
  }),
  approval: Annotation<Approval | undefined>({
    reducer: (_prev, update) => update,
    default: () => ({ status: 'pending' }),
  }),
  assistantText: Annotation<string | undefined>({
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

  // NODE: draft — produce a short draft recommendation
  const draftNode = async (s: typeof ReviewState.State) => {
    console.log('[generate_draft] Generating a draft recommendation');
    const sys = await promptService.render('draft');
    const msgs = toLangChainMessages(s.messages, sys);
    const ai = await model.invoke(msgs);
    const text = String(ai.content ?? '').trim();
    return {
      draft: text,
      assistantText: text,
      messages: [{ role: 'assistant', content: text }],
      approval: { status: 'pending' },
    };
  };

  // NODE: human_approval — ask user to approve/reject; 
  const humanApproval = async (s: typeof ReviewState.State) => {
    console.log('[human_approval] Requesting human review');
    const prompt = 'Approve this draft? Reply yes to approve, or no: <reason> to request changes.';
    const display = `${prompt}\n---\n${s.draft ?? ''}`;
    return {
      assistantText: display,
      messages: [{ role: 'assistant', content: display }],
    };
  };

  // NODE: revise — incorporate reviewer comment and produce a new draft
  const revise = async (s: typeof ReviewState.State) => {
    console.log('[revise] Revising draft based on reviewer feedback');
    const sys = await promptService.render('revise', { draft: s.draft ?? '', comment: s.approval?.comment ?? '' });
    const msgs = [new SystemMessage(sys), new HumanMessage('Revise the draft accordingly.')];
    const ai = await model.invoke(msgs);
    const text = String(ai.content ?? '').trim();
    return { draft: text, assistantText: text, messages: [{ role: 'assistant', content: text }], approval: { status: 'pending' } };
  };

  // NODE: finalize — publish the draft as final
  const finalize = async (s: typeof ReviewState.State) => {
    console.log('[finalize] Finalizing approved draft');
    const text = s.draft ?? 'No draft available.';
    return { assistantText: text, messages: [{ role: 'assistant', content: text }] };
  };


  // ENTRY ROUTER: decide where to start based on existing state
  // - If no draft yet → generate_draft
  // - If approval is approved → finalize
  // - If approval is rejected → revise
  // - Otherwise (pending + have draft) → human_approval
  const entryRouter = (s: typeof ReviewState.State) => {
    // if we don't have a draft, we need to generate one
    if (!s.draft) return 'generate';
    // if the approval is approved, we need to finalize
    if (s.approval?.status === 'approved') return 'finalize';
    // if the approval is rejected, we need to revise
    if (s.approval?.status === 'rejected') return 'revise';
    // if the approval is pending, we need to ask the user for approval
    return 'approve';
  };

  // No-op node used only to attach the entry conditional routing
  const routeEntry = async (_s: typeof ReviewState.State) => ({}) as Partial<typeof ReviewState.State>;

  // Build graph
  const graph = new StateGraph(ReviewState)
    .addNode('route_entry', routeEntry)
    .addNode('generate_draft', draftNode)
    .addNode('human_approval', humanApproval)
    .addNode('revise', revise)
    .addNode('finalize', finalize)
    // Start at a router that will determine where to start based on existing state
    .addEdge(START, 'route_entry')
    .addConditionalEdges('route_entry', entryRouter, {
      generate: 'generate_draft',
      approve: 'human_approval',
      finalize: 'finalize',
      revise: 'revise',
    })
    .addEdge('generate_draft', 'human_approval')
    // We keep human_approval simple: it always ends the turn so the driver can
    // collect approval input. On the next invoke, entryRouter will route based on
    // the updated approval status to either finalize or revise.
    .addEdge('human_approval', END)
    // After revision, we ask for approval again
    .addEdge('revise', 'human_approval')
    .addEdge('finalize', END)
    .compile({ checkpointer: new MemorySaver() }); 

    console.log('Mermaid graph:');
    console.log((await graph.getGraphAsync()).drawMermaid());

  // Interactive driver
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) => new Promise<string>((resolve) => rl.question(q, resolve));
  console.log('Human-in-the-Loop Demo (type "bye" to exit)');
  console.log('Flow: model drafts → asks for approval → you say "yes" or "no: reason" → either finalizes or revises and asks again.');
  const threadId = 'demo-thread-03';

  // Kickoff
  let current = await graph.invoke({ messages: [{ role: 'user', content: 'Please draft a quick recommendation.' }] }, { configurable: { thread_id: threadId } });
  console.log('ASSISTANT:', current.assistantText ?? '');

  while (true) {
    
    const user = (await ask('USER: ')).trim();
    if (/^(bye|exit|quit)$/i.test(user)) break;

    // Interpret approval inputs: yes → approved; no: reason → rejected with comment; otherwise pass as general message
    let delta: Partial<typeof ReviewState.State> = {} as any;
    const yes = /^(yes|approve|approved)$/i.test(user);
    const no = /^(no|reject|rejected)(:|\s|$)/i.test(user);
    if (yes) {
      delta = { approval: { status: 'approved' } } as any;
      console.log('[driver] Marking approval: approved');
    } else if (no) {
      const comment = user.replace(/^(no|reject|rejected)\s*:?/i, '').trim();
      delta = { approval: { status: 'rejected', comment } } as any;
      console.log('[driver] Marking approval: rejected with comment:', comment);
    } else {
      delta = { messages: [{ role: 'user', content: user }] } as any;
      console.log('[driver] General user input added to transcript');
    }

    current = await graph.invoke(delta as any, { configurable: { thread_id: threadId } });
    console.log('ASSISTANT:', current.assistantText ?? '');
  }

  rl.close();
}


