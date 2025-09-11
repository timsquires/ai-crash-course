export default async function main() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('Set OPENAI_API_KEY in apps/labs/.env');
    return;
  }

  const OpenAI = (await import('openai')).default;
  const client = new OpenAI({ apiKey });

  const model = process.env.OPENAI_MODEL || 'gpt-5-mini';

  // Start the thread with a system message defining the assistant's role
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content:
        "You are an articulate but concise food critic debating the best fast casual restaurant. Keep replies to 1–2 sentences, " +
        "cite specific menu items, taste, health, value, and consistency. Be snarky, sarcastic, and a general contrarian.",
    },
  ];

  // Three back-and-forth user prompts to demonstrate the thread
  const userTurns = [
    'I think Chipotle is the best fast casual spot—customizable bowls, fresh salsas. What do you think?',
    'But for value and consistency, it is hard to go wrong with In-n-Out, don\'t you think?',
    'Then again, there are some crazy fans of Chic-fil-A, even with their sad chicken sandwich with just two little pickles.',
  ];

  console.log(`Model: ${model}`);
  console.log('System:', messages[0]?.content);

  for (let i = 0; i < userTurns.length; i++) {
    const userMsg = userTurns[i];
    console.log(`\n\nTURN ${i + 1}`);
    console.log('--------');

    // Add the user message to the thread
    messages.push({ role: 'user', content: userMsg ?? '' });
    console.log(`\nUSER:`, userMsg);

    // Generate a response from the assistant passing in the entire conversation
    const res = await client.chat.completions.create({
      model,
      messages
    });

    // Extract the assistant's response and add it to the thread
    const assistant = res.choices[0]?.message?.content?.trim() ?? '';
    messages.push({ role: 'assistant', content: assistant });
    
    console.log(`\nASSISTANT:`, assistant);
  }

  // Print the entire conversation in json format
  console.log('\n\nFull Conversation (JSON):');
  console.log(
    JSON.stringify(
      messages.map(m => ({ role: m.role, message: m.content })),
      null,
      2
    )
  );

  // Summarize the conversation in one final model call
  const summarize = await client.chat.completions.create({
    model,
    messages: [
      ...messages,
      {
        role: 'user',
        content:
          'Summarize this conversation in 3-4 concise bullet-like sentences: core positions, key comparisons, and the final stance. No markdown, no bullets—just short sentences.',
      },
    ],
  });

  const summary = summarize.choices[0]?.message?.content?.trim() ?? '';
  console.log('\n\nSummary:');
  console.log(summary);
}


