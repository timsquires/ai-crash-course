import { SystemMessage, HumanMessage, AIMessageChunk } from '@langchain/core/messages';
import { ChatOpenAI } from '@langchain/openai';
import { PromptService } from '../src/services/PromptService.js';

export default async function main() {
  const apiKeyOk = !!process.env.OPENAI_API_KEY;
  if (!apiKeyOk) {
    console.error('Set OPENAI_API_KEY in apps/labs/.env');
    return;
  }

  const llm = new ChatOpenAI({ model: 'gpt-4o-mini', streaming: true });
  const promptService = new PromptService();

  const compiledSystem = await promptService.render('menu-optimizer-stream', {
    tone: 'playful',
    region: 'Southwest',
    char_limit: 70,
    include_prices: true,
    include_glossary: true,
  });

  const messyMenu = `
Big Ol' Burritoooo!!! — maybe beef?? rice/beans... $10-ish
Green Chile Queso Fries!! — LOADED!!! $7.5
Southwest Ceasar(??) wrap — romaine, cotija?, mystery sauce
Street CORN 🥳 — elote-ish, crema?, lime?? add bacon +$2
`; 

  const messages = [new SystemMessage(compiledSystem), new HumanMessage(messyMenu)];

  console.log('\nUSER (messy menu):\n');
  console.log(messyMenu);

  // Streaming demo A: raw async iterator
  console.log('\nStreaming (raw iterator) — start');
  const t0 = Date.now();
  let aggregated = '';

  // calling llm.stream() returns an async iterator
  for await (const chunk of await llm.stream(messages)) {
    // Extract the chunk's content
    const delta = String((chunk as AIMessageChunk).content ?? '');
    // Add the chunk's content to the aggregated string
    aggregated += delta;
    // Write the chunk's content to the console
    process.stdout.write(delta);
  }
  const t1 = Date.now();
  const sec = Math.max(0.001, (t1 - t0) / 1000);
  // Print the length of the aggregated string and the rate of characters per second
  console.log(`\n\n[raw] length=${aggregated.length} chars, ~${(aggregated.length / sec).toFixed(1)} chars/sec`);

  // Streaming demo B: events API
  console.log('\nStreaming (events API) — start');
  // calling llm.streamEvents() returns an async iterator that returns structured events instead of just raw chunks
  const stream = await llm.streamEvents(messages, { version: 'v1' });
  let aggregated2 = '';
  for await (const event of stream) {
    // Extract the event's content if the event is an llm stream. Other events include on_llm_start, on_llm_end, etc.
    if (event.event === 'on_llm_stream') {
      // Extract the chunk's content if the event is an llm stream.
      const delta = String((event.data?.chunk as any)?.content ?? '');
      aggregated2 += delta;
      // Write the chunk's content to the console
      process.stdout.write(delta);
    }
  }
  console.log(`\n\n[events] length=${aggregated2.length} chars`);

  // Cancellation demo
  console.log('\nCancellation demo — start');
  // Create a new abort controller to be used to cancel the stream
  const controller = new AbortController();
  const longUser = 'Write a long-form brand story about our food truck ethos and regional heritage.';
  const longMessages = [new SystemMessage(compiledSystem), new HumanMessage(longUser)];

  // Cancel the stream after 3 seconds
  setTimeout(() => controller.abort(), 3000);

  let partial = '';
  try {
    const s = await llm.stream(longMessages, { signal: controller.signal });
    for await (const c of s) {
      const delta = String((c as AIMessageChunk).content ?? '');
      partial += delta;
      process.stdout.write(delta);
    }
    
  } catch (err) {
    const name = (err as any)?.name;
    const message = String((err as any)?.message || '');
    if (name === 'AbortError' || /abort|aborted/i.test(message)) {
      console.log('\n\n[cancel] aborted (AbortError). Partial length:', partial.length);
    } else {
      console.log('\n\n[cancel] error:', err);
    }
  }
}


