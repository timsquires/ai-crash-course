// This could be moved to a `retrieval` directory

// Lightweight keyword pre-filter for Tomb of Annihilation.
// Use to restrict Stage-B retrieval to only relevant sections, based on user query.
// This keeps recall high while improving precision, especially with the book's deep structure.
//
// How to use:
// 1) Call preFilter(query).
// 2) If allowPrefixes is non-empty, filter your candidate sections/chunks so that their
//    `path` (joined with " > ") startsWith any of the returned prefixes.
// 3) Optionally log `reasons` for observability in dev.
//
// Example:
//   const { allowPrefixes } = preFilter(userQuery);
//   const filtered = chunks.filter(c => allowPrefixes.some(p => c.path.join(' > ').startsWith(p)));
//
// Note: Prefix strings assume your Section/Chunk metadata builds a `path` like:
//   "Ch. 1 > Locations in the City > Goldenthrone"
//   "Appendix D > Monsters and NPCs > Zorbo"
// Adjust the strings if your path naming differs.
//
// This is a POC: simple regex contains checks. Extend as needed.
//
// MIT License.

export type PreFilterResult = {
  allowPrefixes: string[]; // e.g., ["Appendix D", "Ch. 1 > Locations in the City"]
  reasons: string[]; // textual reasons for debugging/observability
};

type Rule = {
  name: string;
  pattern: RegExp;
  prefixes: string[];
};

const RULES: Rule[] = [
  {
    name: 'Handouts & Guides',
    pattern: /(handout|guide|azaka|eku)\b/i,
    prefixes: ['Appendix E', 'Ch. 1 > Finding a Guide'],
  },
  {
    name: 'Random Encounters',
    pattern: /(random encounter|encounter table)/i,
    prefixes: ['Appendix B'],
  },
  {
    name: 'Stat Blocks & Creatures',
    pattern:
      /(armor class|hit points|stat block|acrobatics|perception|initiative|\bzorbo\b|\bhadrosaurus\b|\bxandala\b|\bvolo\b)/i,
    prefixes: ['Appendix D'],
  },
  {
    name: 'Character Backgrounds',
    pattern: /\b(background|bond|ideal|flaw)s?\b/i,
    prefixes: ['Appendix A'],
  },
  {
    name: 'Discoveries, Items, Flora & Fauna',
    pattern: /(discovery|magic item|flora|fauna|plant)/i,
    prefixes: ['Appendix C'],
  },
  {
    name: 'Trickster Gods & Omu',
    pattern: /(trickster god|puzzle cube|omu gods?|forbidden city)/i,
    prefixes: ['Appendix F', 'Ch. 3'],
  },
  {
    name: 'Port Nyanzaru Locations',
    pattern: /(port nyanzaru|goldenthrone|grand souk|merchant prince)/i,
    prefixes: ['Ch. 1 > Locations in the City'],
  },
  {
    name: 'Fane of the Night Serpent',
    pattern: /fane of the night serpent/i,
    prefixes: ['Ch. 4'],
  },
  {
    name: 'Tomb of the Nine Gods (dungeon levels)',
    pattern:
      /(tomb of the nine gods|rotten halls|dungeon of deception|vault of reflection|gears of hate|cradle of death)/i,
    prefixes: ['Ch. 5'],
  },
  {
    name: 'Pronunciations',
    pattern: /\b(pronounce|pronunciation)s?\b/i,
    prefixes: ['Intro > Names & Pronunciations'],
  },
];

export function preFilter(query: string): PreFilterResult {
  const allow = new Set<string>();
  const reasons: string[] = [];

  for (const rule of RULES) {
    if (rule.pattern.test(query)) {
      rule.prefixes.forEach((p) => allow.add(p));
      reasons.push(`Matched rule "${rule.name}" with /${rule.pattern.source}/`);
    }
  }

  return {
    allowPrefixes: Array.from(allow),
    reasons,
  };
}

// Optional helper: given a chunk/section path array, check if it's allowed.
export function isPathAllowed(
  pathParts: string[],
  allowPrefixes: string[],
): boolean {
  if (!allowPrefixes.length) return true; // no filter = allow all
  const pathStr = pathParts.join(' > ');
  return allowPrefixes.some((prefix) => pathStr.startsWith(prefix));
}
