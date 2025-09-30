// apps/api/src/knowledge/tomb-normalize.ts
// Text normalizer for Tomb of Annihilation PDFs.
//
// Adds:
// - Header/footer stripping
// - Hyphenation fix (foo-\nbar -> foobar)
// - Whitespace normalization
// - Safer mid‑word split repair (e.g., "wo lf spide rs" -> "wolf spiders") using a stoplist
// - Optional [[PAGE:n]] handling if the caller provides per-page text
//
// Enable DEBUG_RAG=1 for console logging.

export type PageLike = { pageNumber: number; text: string };

export type NormalizedDoc = {
  text: string; // normalized text with [[PAGE:n]] markers
  pages: { n: number; start: number; end: number }[]; // byte offsets per page
};

const HEADER_FOOTER_HINTS = [
  /TOMB OF ANNIHILATION/gi,
  /Wizards of the Coast/gi,
  /Dungeons? & Dragons?/gi,
];

const COMMON_WORDS = new Set([
  // articles, prepositions, conjunctions
  'a',
  'an',
  'and',
  'the',
  'in',
  'on',
  'at',
  'of',
  'to',
  'for',
  'by',
  'with',
  'from',
  'as',
  'or',
  'but',
  // setting-specific tokens we don't want joined
  'omu',
  'port',
  'nyanzaru',
  'omu’s',
  'chult',
  'chultan',
]);

function stripHeadersFooters(s: string): string {
  let out = s;
  for (const rx of HEADER_FOOTER_HINTS) out = out.replace(rx, '');
  // remove page numbers alone on a line
  out = out.replace(/^\s*\d+\s*$/gm, '');
  return out;
}

function fixHyphenation(s: string): string {
  // Join hyphenated line breaks
  return s.replace(/([A-Za-z])-\s*\n\s*([A-Za-z])/g, '$1$2');
}

function collapseWhitespace(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/\u00AD/g, '') // soft hyphen
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n');
}

/**
 * Safer repair for mid‑word splits caused by PDF extraction.
 * Heuristics:
 *  - Do NOT join if either side is a common short word (articles, preps, etc.).
 *  - Prefer joining when one side is <=4 chars (typical broken fragment).
 *  - Avoid over-joining long-long pairs.
 *  - Apply multiple passes to catch sequences: "spide rs" then "wo lf".
 */
function fixBrokenWords(s: string): string {
  const pass = (text: string) =>
    text.replace(/\b([A-Za-z]{2,})\s+([a-z]{2,})\b/g, (m, a, b) => {
      const al = a.toLowerCase();
      const bl = b.toLowerCase();

      // Guard: don't join common words
      if (COMMON_WORDS.has(al) || COMMON_WORDS.has(bl)) return m;

      // Typical broken fragments are short; join when one side is short
      if (a.length <= 4 || b.length <= 4) return a + b;

      // Otherwise leave as-is
      return m;
    });

  // Run two passes to catch chained splits
  const once = pass(s);
  const twice = pass(once);
  return twice;
}

export function normalizePages(
  pages: PageLike[],
  opts?: { log?: boolean },
): NormalizedDoc {
  let cursor = 0;
  const ranges: { n: number; start: number; end: number }[] = [];
  const parts: string[] = [];

  for (const p of pages) {
    const before = `[[PAGE:${p.pageNumber}]]\n`;
    let t = p.text || '';
    t = stripHeadersFooters(t);
    t = fixHyphenation(t);
    t = collapseWhitespace(t);
    t = fixBrokenWords(t);
    parts.push(before + t.trim() + '\n\n');

    const start = cursor;
    cursor += (before + t.trim() + '\n\n').length;
    const end = cursor;
    ranges.push({ n: p.pageNumber, start, end });
  }

  const text = parts.join('');
  if (opts?.log || process.env.DEBUG_RAG) {
    console.log(`[normalizePages] pages=${pages.length} length=${text.length}`);
  }
  return { text, pages: ranges };
}

/**
 * Convenience: normalize a single block of text (when per-page text is unavailable).
 * (No [[PAGE:n]] markers are added in this mode.)
 */
export function normalizeText(raw: string, opts?: { log?: boolean }): string {
  let t = raw || '';
  t = stripHeadersFooters(t);
  t = fixHyphenation(t);
  t = collapseWhitespace(t);
  t = fixBrokenWords(t);
  if (opts?.log || process.env.DEBUG_RAG) {
    console.log(`[normalizeText] length=${t.length}`);
  }
  return t;
}
