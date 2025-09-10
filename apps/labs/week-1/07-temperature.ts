// 07-temperature
// Goal: Demonstrate the impact of sampling temperature while holding other knobs constant.
// This runs multiple trials at low vs high temperature using the same messages,
// then prints and contrasts the outputs.

type Role = 'system' | 'user' | 'assistant';
type Msg = { role: Role; content: string };

function createBaseMessages(): Msg[] {
  // Keep consistent persona and a prompt that invites variation
  const system: Msg = {
    role: 'system',
    content:
      'You are a contrarian but concise food critic. Keep replies to exactly 2 sentences. Name one specific menu item and include one playful jab.',
  };
  const user: Msg = {
    role: 'user',
    content:
      'Give a contrarian take on the best fast-casual chain. Name a specific menu item and include one playful jab.',
  };
  return [system, user];
}

export default async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Set OPENAI_API_KEY in apps/labs/.env');
    return;
  }

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });

  // Note gpt-5 has it's own internal router that sets a number of these knobs on it's own so we
  // have to use a different model for this lab
  const model = 'gpt-4o-mini';

  // Fixed knobs (hold constant across trials to isolate temperature)
  const FIXED = {
    top_p: 1,   // Consider the full distribution of tokens so only temperature matters
    presence_penalty: 0,
    frequency_penalty: 0,
  } as const;

  // Trial settings
  const lowTemperature = 0.2;
  const highTemperature = 1.0;
  const trialsPerSetting = 3;
  const lowTempSeed = 7; // Optional: seed for increased reproducibility at low temp

  console.log(`Model: ${model}`);
  console.log('Comparing outputs at two temperatures with identical prompts.');
  console.log('Low temperature encourages determinism; high temperature encourages diversity.');

  async function runTrials(temperature: number, trials: number, opts?: { seed?: number }) {
    const outputs: Array<{ text: string; usage: any }> = [];
    for (let i = 0; i < trials; i++) {
      const messages = createBaseMessages();
      const res = await client.chat.completions.create({
        model,
        messages,
        temperature,
        top_p: FIXED.top_p,
        presence_penalty: FIXED.presence_penalty,
        frequency_penalty: FIXED.frequency_penalty,
        seed: opts?.seed,
      } as any);
      const text = res.choices[0]?.message?.content?.trim() ?? '';
      outputs.push({ text, usage: (res as any).usage || {} });
    }
    return outputs;
  }

  console.log(`\n=== Low temperature (${lowTemperature}) — ${trialsPerSetting} trials ===`);
  const low = await runTrials(lowTemperature, trialsPerSetting, { seed: lowTempSeed });
  low.forEach((o, idx) => {
    console.log(`\n[Low t] Trial ${idx + 1}`);
    console.log(o.text);
  });

  console.log(`\n=== High temperature (${highTemperature}) — ${trialsPerSetting} trials ===`);
  const high = await runTrials(highTemperature, trialsPerSetting);
  high.forEach((o, idx) => {
    console.log(`\n[High t] Trial ${idx + 1}`);
    console.log(o.text);
  });

  // Brief teaching summary
  console.log('\nSummary: Low temperature should yield more similar phrasing; high temperature should show more variety.');
}


