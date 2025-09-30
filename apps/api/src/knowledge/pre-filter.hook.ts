// apps/api/src/knowledge/pre-filter.hook.ts
// Adapter utility to apply the keyword pre-filter to a list of items that carry `metadata.path`.
// Use this right before your fine (chunk-level) retrieval step, or right after coarse section recall.
//
// Items must have: { metadata?: { path?: string[] } } at minimum.
// Returns the filtered array + a debug summary for logging.
//
// Example usage in knowledge.service.ts:
//   import { filterByPreFilter } from './pre-filter.hook';
//   const { items: filtered, debug } = filterByPreFilter(userQuery, candidates);
//   if (process.env.DEBUG_RAG) console.log('[preFilter hook]', debug);
//
import { preFilter } from './pre-filter.util';

type ItemLike = { metadata?: Record<string, unknown> };

function getPath(item: ItemLike): string[] {
  const p = item?.metadata && (item.metadata as any).path;
  return Array.isArray(p) ? p : [];
}

export function filterByPreFilter<T extends ItemLike>(query: string, items: T[]) {
  const { allowPrefixes, reasons } = preFilter(query);
  if (!allowPrefixes.length) {
    return {
      items,
      debug: { allowPrefixes, reasons, kept: items.length, total: items.length },
    };
  }

  const kept = items.filter(i => {
    const path = getPath(i).join(' > ');
    return allowPrefixes.some(prefix => path.startsWith(prefix));
  });

  const debug = {
    allowPrefixes,
    reasons,
    kept: kept.length,
    dropped: items.length - kept.length,
    total: items.length,
    sampleKept: kept.slice(0, 5).map(i => getPath(i).join(' > ')),
  };

  if (process.env.DEBUG_RAG) {
    // eslint-disable-next-line no-console
    console.log('[preFilter hook]', debug);
  }

  return { items: kept, debug };
}
