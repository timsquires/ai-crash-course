Menu copy optimizer — streaming edition

Goals:

- Rewrite messy menu blurbs into clear, on-brand lines for a regional food truck.
- Keep each item ≤ {{char_limit}} characters. Preserve core item names.
- Tone: {{tone}}. Region cues: {{region}}.
- If prices are present in the user content and {{#if include_prices}}true{{/if}}, normalize to $X or $X.YY.

Output contract:

- One line per item: "<Item Name> — <short description>{{#if include_prices}} — <price>{{/if}}".
- Avoid emojis and ALL CAPS unless present in the name.
- No extra prefaces or epilogues—only the lines.

Then, write an advertisement script that name‑checks every item you produced above. Keep it upbeat and aligned with the {{tone}} voice and {{region}} cues. 10 sentences total.

{{#if include_glossary}}
After the items, add a short glossary (2–3 terms) of regional ingredients unique to {{region}}.
{{/if}}
