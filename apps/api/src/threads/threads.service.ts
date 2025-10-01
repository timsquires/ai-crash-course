import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  THREAD_REPOSITORY,
  type ThreadRepository,
} from './ports/thread.repository';
import { ThreadAggregate, ThreadMessage } from './domain/thread.domain';
import { CreateThreadDto } from './dto/create-thread.dto';
import { ChatDto } from './dto/chat.dto';
import { PromptService } from '../services/prompt.service';
import {
  HumanMessage,
  SystemMessage,
  ToolMessage,
  AIMessage,
} from '@langchain/core/messages';
import {
  toLangChainMessages,
  makeToolResultMessage,
  makeAssistantToolCallMessage,
  makeAssistantMessage,
} from './util/message-mapper';
import { AgentToolsService } from '../services/agent-tools.service';
import { ProviderService } from '../services/provider.service';
import type { Provider } from '../services/provider.service';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { tool } from '@langchain/core/tools';
import type { Runnable } from '@langchain/core/runnables';
import { EmbeddingsService } from '../knowledge/embeddings.service';
import {
  CHUNK_REPOSITORY,
  type ChunkRepository,
} from '../knowledge/ports/chunk.repository';

type BoundTool = ReturnType<typeof tool>;
type ToolCapable = BaseChatModel & {
  bindTools: (tools: BoundTool[], kwargs?: unknown) => BaseChatModel;
};
type ChatRunnable = Runnable<
  (SystemMessage | HumanMessage | AIMessage | ToolMessage)[],
  AIMessage
>;

@Injectable()
export class ThreadsService {
  // Restaurant aliases for detection
  private readonly RESTAURANTS = [
    {
      name: 'Chipotle Mexican Grill',
      aliases: ['Chipotle Mexican Grill', 'Chipotle'],
    },
    { name: 'Panera Bread', aliases: ['Panera Bread', 'Panera'] },
    { name: 'Shake Shack', aliases: ['Shake Shack'] },
    {
      name: 'Chick-fil-A',
      aliases: ['Chick-fil-A', 'Chick Fil A', 'Chickfila', 'Chick fil a'],
    },
    { name: 'Five Guys', aliases: ['Five Guys'] },
    { name: 'Firehouse Subs', aliases: ['Firehouse Subs', 'Firehouse'] },
    { name: 'MOD Pizza', aliases: ['MOD Pizza', 'MOD'] },
    { name: 'Qdoba Mexican Eats', aliases: ['Qdoba Mexican Eats', 'Qdoba'] },
    {
      name: "Jersey Mike's Subs",
      aliases: [
        "Jersey Mike's Subs",
        'Jersey Mikes Subs',
        "Jersey Mike's",
        'Jersey Mikes',
        'Jersey Mike',
      ],
    },
    {
      name: 'Noodles & Company',
      aliases: [
        'Noodles & Company',
        'Noodles and Company',
        'Noodles & Co',
        'Noodles and Co',
      ],
    },
  ];

  constructor(
    @Inject(THREAD_REPOSITORY) private readonly repo: ThreadRepository,
    private readonly prompts: PromptService,
    private readonly providers: ProviderService,
    private readonly agentTools: AgentToolsService,
    private readonly embeddings: EmbeddingsService,
    @Inject(CHUNK_REPOSITORY) private readonly chunksRepo: ChunkRepository,
  ) {}

  // Type guard method to check if the message has tool calls
  private hasToolCalls(
    msg: AIMessage,
  ): msg is AIMessage & {
    tool_calls: { id?: string; name?: string; args?: unknown }[];
  } {
    return Array.isArray((msg as any).tool_calls);
  }

  /** Detect restaurant from user message using simple substring matching */
  private detectRestaurant(message: string): string | null {
    const messageLower = message.toLowerCase();
    for (const r of this.RESTAURANTS) {
      for (const alias of r.aliases) {
        if (messageLower.includes(alias.toLowerCase())) {
          return r.name;
        }
      }
    }
    return null;
  }

  /**
   * Rewrite user query using conversation history for better retrieval.
   * Returns the rewritten query or falls back to original on error.
   */
  private async rewriteQuery(
    messages: ThreadMessage[],
    userQuery: string,
  ): Promise<string> {
    try {
      // Get last N messages for context (excluding system messages)
      const recentMessages = messages
        .filter((m) => m.role !== 'system')
        .slice(-6); // Last 3 turns (user + assistant)

      // Build history string
      const history = recentMessages
        .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

      // Call LLM to rewrite query
      const { rendered } = await this.prompts.render('query-rewrite', {
        history: history || '(no prior context)',
        question: userQuery,
      });

      const provider = (process.env.LLM_PROVIDER || 'openai') as Provider;
      const model = this.providers.buildModel(provider);
      const response = await model.invoke([new HumanMessage(rendered)]);
      const rewritten = String(response.content || '').trim();

      // Validate we got something useful back
      if (rewritten && rewritten.length > 0 && rewritten.length < 500) {
        console.log(`[RAG] Query rewritten: "${userQuery}" -> "${rewritten}"`);
        return rewritten;
      }

      // Fall back to original if rewriting produced nothing useful
      console.log(
        '[RAG] Query rewriting failed or empty, using original query',
      );
      return userQuery;
    } catch (error) {
      console.error('[RAG] Query rewriting error:', error);
      return userQuery; // Fall back to original query on error
    }
  }

  async create(dto: CreateThreadDto): Promise<ThreadAggregate> {
    const parameters = dto.parameters ?? {};
    const { template: systemPromptTemplate, rendered: systemPrompt } =
      await this.prompts.render(dto.agent, parameters);
    const threadId = randomUUID();
    const now = new Date();
    const seedMessages: ThreadMessage[] = [
      {
        id: randomUUID(),
        role: 'system',
        content: systemPrompt,
        createdAt: now,
      },
    ];
    return this.repo.createThread({
      threadId,
      agent: dto.agent,
      model: dto.model ?? process.env.DEFAULT_MODEL ?? 'gpt-4o-mini',
      accountId: '1',
      userId: randomUUID(),
      systemPromptTemplate,
      systemPrompt,
      parameters,
      ragEnabled: dto.ragEnabled ?? false,
      seedMessages,
    });
  }

  async get(threadId: string): Promise<ThreadAggregate | null> {
    return this.repo.getById(threadId);
  }

  async list(accountId: string): Promise<ThreadAggregate[]> {
    return this.repo.listByAccount(accountId);
  }

  async chat(threadId: string, dto: ChatDto): Promise<ThreadMessage> {
    // High-level flow of a chat turn:
    // 1) Load the persisted thread (single source of truth) and guard if not found.
    // 2) Persist the user's message to the thread. We always write first so every turn is captured.
    // 3) Convert the full thread (system + messages) into LangChain messages.
    // 4) Resolve the agent's tools and bind them to the model for this turn.
    // 5) Invoke the model once. If the assistant returns tool_calls, execute them locally.
    // 6) Append tool results as ToolMessages, then invoke the model again to get a final, user-visible answer.
    // 7) Append the assistant's final answer to the thread and return the updated thread aggregate.

    const thread = await this.repo.getById(threadId);
    if (!thread) throw new Error('Thread not found');

    // Persist the user's input on the thread before calling the model.
    const userMsg: ThreadMessage = {
      id: randomUUID(),
      role: 'user',
      content: dto.message,
      metadata: dto.metadata,
      createdAt: new Date(),
    };

    // Add the user message to the thread
    const afterUser = await this.repo.appendMessage(threadId, userMsg);

    // Convert the entire conversation to LangChain message objects.
    // We include the system prompt first, then all prior messages (now including the new user message).
    let lcMessages = toLangChainMessages(afterUser.messages);

    // If RAG is enabled, retrieve top-k chunks and prepend a retrieval system prompt.
    if (thread.ragEnabled) {
      // Step 1: Query rewriting using conversation history
      const rewrittenQuery = await this.rewriteQuery(
        afterUser.messages,
        dto.message,
      );

      // Step 2: Embed the rewritten query
      const [q] = await this.embeddings.embedMany([rewrittenQuery]);

      // Step 3: Detect if user mentioned a specific restaurant (use original message for detection)
      const detectedRestaurant = this.detectRestaurant(dto.message);

      // Step 4: Use pre-filtered search if restaurant detected, otherwise global search
      const top = detectedRestaurant
        ? await this.chunksRepo.searchTopKByRestaurant(
            thread.accountId,
            detectedRestaurant,
            q,
            5,
          )
        : await this.chunksRepo.searchTopK(thread.accountId, q, 5);

      const contextBlocks = top
        .map((e, idx) => `[#${idx + 1}] ${e.content}`)
        .join('\n\n');
      const retrievalPrompt = await this.prompts.render('retrieval-chat', {
        contextBlocks,
      });

      // Log retrieved chunks for observability
      try {
        if (detectedRestaurant) {
          console.log(
            `\n[RAG] Detected restaurant: ${detectedRestaurant} - Pre-filtered search`,
          );
        }
        console.log('\n[RAG] Retrieved chunks (top-5):');
        top.forEach((e, i) => {
          const preview = (e.content || '').replace(/\s+/g, ' ').slice(0, 200);
          console.log(
            `  #${i + 1} len=${(e.content || '').length} doc=${e.documentId} meta=${JSON.stringify(e.metadata || {})}`,
          );
          console.log(`    "${preview}${e.content.length > 200 ? '…' : ''}"`);
        });
      } catch {}

      // Prepend a transient retrieval SystemMessage; preserve the full prior chain
      lcMessages = [new SystemMessage(retrievalPrompt.rendered), ...lcMessages];
    }

    // Resolve the agent's tool set, then build a provider-specific model
    // and bind tools (if any). bindTools returns a Runnable that we can invoke.
    const boundTools = await this.agentTools.load(thread.agent);
    const provider = (process.env.LLM_PROVIDER || 'openai') as Provider;
    const base = this.providers.buildModel(provider);
    const model = (
      boundTools.length > 0 ? (base as ToolCapable).bindTools(boundTools) : base
    ) as ChatRunnable;

    // First model call: the assistant can either respond directly or request tool_calls.
    const resp: AIMessage = await model.invoke(lcMessages);

    // If tool_calls are present, persist the assistant tool-calls message, execute tools, then ask the model again.
    const toolCalls = this.hasToolCalls(resp) ? resp.tool_calls : [];
    if (toolCalls.length > 0) {
      // Persist the assistant tool_calls message immediately so ordering is correct: user -> assistant(tool_calls) -> tool results
      const assistantToolCallMsg = makeAssistantToolCallMessage(
        toolCalls,
        String(resp.content ?? ''),
      );
      await this.repo.appendMessage(threadId, assistantToolCallMsg);

      for (const tc of toolCalls) {
        // Locate the matching tool by name and execute with the provided args.
        const entry = boundTools.find((t) => t.name === tc.name);
        if (!entry) continue;
        const toolResult = await entry.invoke(tc.args);
        await this.repo.appendMessage(
          threadId,
          makeToolResultMessage(tc.name, tc.id, JSON.stringify(toolResult)),
        );
      }

      // Rebuild from persisted state to ensure the second invoke includes assistant(tool_calls) and tool results
      const updatedAfterTools = await this.repo.getById(threadId);
      const followUp: AIMessage = await model.invoke(
        toLangChainMessages(updatedAfterTools!.messages),
      );

      // Persist the assistant's final response for this turn.
      const assistantMsg = makeAssistantMessage(String(followUp.content ?? ''));
      await this.repo.appendMessage(threadId, assistantMsg);
      return assistantMsg;
    }

    // No tools requested: persist the assistant's direct response and return.
    const assistantMsg = makeAssistantMessage(String(resp.content ?? ''));
    await this.repo.appendMessage(threadId, assistantMsg);
    return assistantMsg;
  }

  async delete(threadId: string): Promise<void> {
    return this.repo.delete(threadId);
  }
}
