// apps/api/src/knowledge/chunking/hierarchical.chunker.ts
// Hierarchical chunker implementing the project's ChunkingStrategy interface.
// - Understands CHAPTER/Appendix headings and common mid-level subheads
// - Emits ~size-token chunks (default 400) with overlap (default 60)
// - Preserves atomic blocks (stat blocks, tables, boxed read-aloud)
// - Emits rich metadata: path, contentType, pageStart/pageEnd, order
// - Reads [[PAGE:n]] markers if present
//
// Enable verbose logs with DEBUG_RAG=1.
//
// Note: This file only depends on the local ChunkingStrategy types to avoid DI cycles.

import { Chunk, ChunkingStrategy, ChunkOptions } from './chunking.strategy';

type ContentType =
  | 'location'
  | 'guide'
  | 'statBlock'
  | 'table'
  | 'readAloud'
  | 'item'
  | 'background'
  | 'handout'
  | 'generic';

type SectionNode = {
  title: string;
  path: string[];
  pageStart?: number;
  pageEnd?: number;
  text: string;
  children: SectionNode[];
};

// Match "CHAPTER 1", "Chapter 1:", "chapter one", "CHAPTER IV", even if not at start-of-line
const RX_CHAPTER_ANYWHERE =
  /\bchapter\s+(?<num>\d+|[ivxlcdm]+|one|two|three|four|five|six|seven|eight|nine|ten)\b/i;

// Match "Appendix A", "APPENDIX D:", "App. F", even if not at start-of-line
const RX_APPENDIX_ANYWHERE = /\b(appendix|app\.)\s+(?<letter>[A-F])\b/i;

// Keep the mid-level subheads list (exact string equals after trimming)
const COMMON_SUBHEADS = [
  'Locations in the City',
  'Finding a Guide',
  'Random Encounters',
  'City Denizens',
  'Things to Do',
  'The Forbidden City',
  'Fane of the Night Serpent',
  'Tomb of the Nine Gods',
];

// Helpers to normalize chapter numbers
const WORD_TO_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
function romanToInt(s: string): number {
  const map: Record<string, number> = {
    i: 1,
    v: 5,
    x: 10,
    l: 50,
    c: 100,
    d: 500,
    m: 1000,
  };
  let total = 0,
    prev = 0;
  for (const ch of s.toLowerCase()) {
    const val = map[ch] || 0;
    total += val <= prev ? val : val - 2 * prev;
    prev = val;
  }
  return total || NaN;
}
function parseChapterNum(raw: string): number | null {
  const token = raw.toLowerCase();
  if (/^\d+$/.test(token)) return Number(token);
  if (WORD_TO_NUM[token] != null) return WORD_TO_NUM[token];
  const roman = romanToInt(token);
  return Number.isNaN(roman) ? null : roman;
}

const RX_STATBLOCK_KEYS =
  /\b(Armor Class|Hit Points|Speed|STR|DEX|CON|INT|WIS|CHA|Actions?|Traits?)\b/i;
const RX_READ_ALOUD = /^(read|boxed text)[:-]/i;
const RX_TABLE = /(d\d+\s*table|random encounters?|roll\s*d\d+)/i;

// crude token estimate (~4 chars per token)
const estTokens = (s: string) => Math.ceil(s.length / 4);

function log(...args: any[]) {
  if (process.env.DEBUG_RAG) {
    console.log('[hierarchical.chunker]', ...args);
  }
}

function splitParas(s: string): string[] {
  return s
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function classifyPara(p: string): ContentType {
  if (RX_STATBLOCK_KEYS.test(p)) return 'statBlock';
  if (RX_READ_ALOUD.test(p)) return 'readAloud';
  if (RX_TABLE.test(p)) return 'table';
  return 'generic';
}

export class HierarchicalChunker implements ChunkingStrategy {
  /**
   * NOTE: For PDFs, use splitSections() with structured section input.
   * This method is only recommended for plain text or non-PDF formats.
   */
  split(text: string, options?: ChunkOptions): Chunk[] {
    const size = options?.size ?? 400;
    const overlap = options?.overlap ?? 60;

    const lines = (text ?? '').split(/\n/);
    const sections: SectionNode[] = [];
    let currentTop: SectionNode | null = null;
    let currentMid: SectionNode | null = null;
    let buffer: string[] = [];

    const flushBufferTo = (node: SectionNode | null) => {
      if (!node) return;
      const t = buffer.join('\n').trim();
      if (t) node.text += (node.text ? '\n\n' : '') + t;
      buffer = [];
    };

    // Track page numbers from [[PAGE:n]] markers
    let currentPage = 1;
    function onLine(line: string) {
      const mPage = line.match(/^\[\[PAGE:(\d+)\]\]$/);
      if (mPage) {
        currentPage = parseInt(mPage[1], 10);
        if (currentMid && currentMid.pageStart === undefined)
          currentMid.pageStart = currentPage;
        else if (currentTop && currentTop.pageStart === undefined)
          currentTop.pageStart = currentPage;
        return true;
      }
      return false;
    }

    for (const raw of lines) {
      if (onLine(raw)) continue;
      const line = raw.trim();
      if (!line) {
        buffer.push('');
        continue;
      }

      // Top-level: CHAPTER / APPENDIX (match anywhere in the line)
      const chap = line.match(RX_CHAPTER_ANYWHERE);
      if (chap?.groups?.num) {
        flushBufferTo(currentMid);
        flushBufferTo(currentTop);
        if (currentMid) {
          currentMid.pageEnd = currentPage;
          currentMid = null;
        }
        if (currentTop) {
          currentTop.pageEnd = currentPage;
        }

        const n = parseChapterNum(chap.groups.num);
        const title = n ? `Ch. ${n}` : `Chapter ${chap.groups.num}`;
        currentTop = {
          title,
          path: [title],
          pageStart: currentPage,
          text: '',
          children: [],
        };
        sections.push(currentTop);
        log('Top:', title, 'page', currentPage, 'from line:', line);
        continue;
      }

      const app = line.match(RX_APPENDIX_ANYWHERE);
      if (app?.groups?.letter) {
        flushBufferTo(currentMid);
        flushBufferTo(currentTop);
        if (currentMid) {
          currentMid.pageEnd = currentPage;
          currentMid = null;
        }
        if (currentTop) {
          currentTop.pageEnd = currentPage;
        }

        const letter = app.groups.letter.toUpperCase();
        const title = `Appendix ${letter}`;
        currentTop = {
          title,
          path: [title],
          pageStart: currentPage,
          text: '',
          children: [],
        };
        sections.push(currentTop);
        log('Top:', title, 'page', currentPage, 'from line:', line);
        continue;
      }

      // Mid-level
      if (COMMON_SUBHEADS.some((h) => line.toLowerCase() === h.toLowerCase())) {
        flushBufferTo(currentMid);
        if (currentMid) currentMid.pageEnd = currentPage;
        const title = line;
        currentMid = {
          title,
          path: [...(currentTop?.path ?? []), title],
          pageStart: currentPage,
          text: '',
          children: [],
        };
        if (currentTop) currentTop.children.push(currentMid);
        else sections.push(currentMid);
        log('Mid:', currentMid.path.join(' > '), 'page', currentPage);
        continue;
      }

      buffer.push(line);
    }
    // final flush
    flushBufferTo(currentMid);
    flushBufferTo(currentTop);

    // Leaf sections to chunk
    const leafs: SectionNode[] = [];
    for (const s of sections) {
      if (s.children.length) leafs.push(...s.children);
      else leafs.push(s);
    }
    if (!leafs.length && (text ?? '').trim()) {
      leafs.push({ title: 'Document', path: ['Document'], text, children: [] });
    }

    // Emit micro-chunks
    let order = 0;
    const out: Chunk[] = [];

    const pushChunk = (payload: {
      content: string;
      path: string[];
      contentType: ContentType;
      pageStart?: number;
      pageEnd?: number;
    }) => {
      const tokenCount = estTokens(payload.content);
      out.push({
        content: payload.content,
        charCount: payload.content.length,
        tokenCount,
        metadata: {
          path: payload.path,
          contentType: payload.contentType,
          pageStart: payload.pageStart,
          pageEnd: payload.pageEnd,
          order: order++,
        },
      });
    };

    for (const sec of leafs) {
      const paras = splitParas(sec.text);
      let buf: string[] = [];
      let bufTokens = 0;

      const flush = (force = false) => {
        if (!buf.length) return;
        if (!force && bufTokens < size * 0.65) return; // avoid tiny shards
        const content = buf.join('\n\n').trim();
        if (!content) {
          buf = [];
          bufTokens = 0;
          return;
        }
        const ct = classifyPara(content);
        pushChunk({
          content,
          path: sec.path,
          contentType: ct,
          pageStart: sec.pageStart,
          pageEnd: sec.pageEnd,
        });

        // apply overlap as tail-carry (approximate by chars)
        if (overlap > 0 && content.length > overlap * 4) {
          const tail = content.slice(-(overlap * 4));
          buf = [tail];
          bufTokens = estTokens(tail);
        } else {
          buf = [];
          bufTokens = 0;
        }
      };

      for (const p of paras) {
        const t = estTokens(p);
        const atomic = classifyPara(p) !== 'generic';
        if (atomic) {
          // flush the working buffer
          flush(true);
          pushChunk({
            content: p,
            path: sec.path,
            contentType: classifyPara(p),
            pageStart: sec.pageStart,
            pageEnd: sec.pageEnd,
          });
          continue;
        }

        buf.push(p);
        bufTokens += t;
        if (bufTokens >= size) flush();
      }
      flush(true);
    }

    log(
      'Emitted chunks:',
      out.length,
      'from sections:',
      leafs.length,
      'size=',
      size,
      'overlap=',
      overlap,
    );
    if (!leafs.length) {
      log(
        'No sections detected; printing first 20 non-empty lines to inspect headings:',
      );
      (text || '')
        .split(/\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 20)
        .forEach((l) => log(' >', l));
    }
    if (!out.length) {
      log('WARNING: no chunks emitted; check input text for headers/markers.');
    }

    return out;
  }

  static splitSections(
    sections: Array<{
      path: string[];
      pageStart: number;
      pageEnd: number;
      text: string;
    }>,
    options?: ChunkOptions,
  ): Chunk[] {
    const size = options?.size ?? 400;
    const overlap = options?.overlap ?? 60;
    let order = 0;
    const out: Chunk[] = [];
    for (const sec of sections) {
      const paras = splitParas(sec.text);
      let buf: string[] = [];
      let bufTokens = 0;
      const flush = (force = false) => {
        if (!buf.length) return;
        if (!force && bufTokens < size * 0.65) return;
        const content = buf.join('\n\n').trim();
        if (!content) {
          buf = [];
          bufTokens = 0;
          return;
        }
        const ct = classifyPara(content);
        out.push({
          content,
          charCount: content.length,
          tokenCount: estTokens(content),
          metadata: {
            path: sec.path,
            contentType: ct,
            pageStart: sec.pageStart,
            pageEnd: sec.pageEnd,
            order: order++,
          },
        });
        // apply overlap as tail-carry (approximate by chars)
        if (overlap > 0 && content.length > overlap * 4) {
          const tail = content.slice(-(overlap * 4));
          buf = [tail];
          bufTokens = estTokens(tail);
        } else {
          buf = [];
          bufTokens = 0;
        }
      };
      for (const p of paras) {
        const t = estTokens(p);
        const atomic = classifyPara(p) !== 'generic';
        if (atomic) {
          flush(true);
          out.push({
            content: p,
            charCount: p.length,
            tokenCount: estTokens(p),
            metadata: {
              path: sec.path,
              contentType: classifyPara(p),
              pageStart: sec.pageStart,
              pageEnd: sec.pageEnd,
              order: order++,
            },
          });
          continue;
        }
        buf.push(p);
        bufTokens += t;
        if (bufTokens >= size) flush();
      }
      flush(true);
    }
    log(
      '[splitSections] Emitted chunks:',
      out.length,
      'from sections:',
      sections.length,
      'size=',
      size,
      'overlap=',
      overlap,
    );
    if (!out.length) {
      log('[splitSections] WARNING: no chunks emitted; check input sections.');
    }
    return out;
  }
}

export default HierarchicalChunker;
