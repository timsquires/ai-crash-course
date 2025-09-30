# Tomb of Annihilation RAG Enhancements

This document summarizes the recommendations for improving the Proof of
Concept RAG system using the *Tomb of Annihilation* PDF.

------------------------------------------------------------------------

## Why Add Hierarchical Chunking & Pre-Filters?

-   The PDF has **rich structure** (Chapters, Appendices, stat blocks,
    random encounter tables, boxed text).
-   Simple sliding-window chunking loses context. Hierarchical chunking
    preserves **section → subsection → paragraph** structure.
-   Pre-filters allow us to shortcut retrieval for common query patterns
    (stat blocks, handouts, random encounters).

------------------------------------------------------------------------

## Deliverables

1.  **Parser/Normalizer**
    -   Keep existing PDF loader, add a text normalizer:
        -   Remove headers/footers.
        -   Fix hyphenation.
        -   Insert `[[PAGE:n]]` markers.
2.  **Hierarchical Section Extractor**
    -   Detect top-level: `CHAPTER \d+`, `App. A–F`.
    -   Detect mid-level subheads:
        -   "Locations in the City", "Finding a Guide".
        -   "Random Encounters" sections.
        -   Appendix anchors: Backgrounds (A), Random Encounters (B),
            Discoveries (C), Monsters & NPCs (D), Player Handouts (E),
            Trickster Gods (F).
    -   Store `sectionId`, `title`, `path`, `pageStart..pageEnd`,
        `text`.
3.  **Semantic Micro-Chunker**
    -   Split into \~300--500 token chunks (10--15% overlap).
    -   Preserve integrity of:
        -   **Stat blocks** (Armor Class, Hit Points, etc.).
        -   **Boxed read-aloud text** ("Read: ...").
        -   **Tables** (encounter tables, ruin interiors).
4.  **Embeddings**
    -   Use `text-embedding-3-small` for both **section vectors** and
        **chunk vectors**.
    -   Store vectors in the existing Postgres/Mongo setup.
5.  **Two-Stage Retrieval**
    -   **Stage A (coarse)**: Retrieve top-k section vectors.
    -   **Pre-filter**: Apply rules to limit which sections are
        searched.
    -   **Stage B (fine)**: Retrieve top-k micro-chunks only from
        filtered sections.
6.  **Prompt & Citations**
    -   Return path + page span (e.g.,
        `Ch. 1 > Locations in the City > Goldenthrone`).
    -   Log which filters were applied.

------------------------------------------------------------------------

## Suggested Pre-Filters

  -----------------------------------------------------------------------
  Query Pattern                          Restrict To
  -------------------------------------- --------------------------------
  handout, guide, Azaka, Eku             Appendix E, Ch. 1 "Finding a
                                         Guide"

  random encounter, encounter table      Appendix B (and
                                         city/wilderness/Omu subsections)

  Armor Class, Hit Points, stat block,   Appendix D: Monsters & NPCs
  creature names                         

  background, bond, ideal, flaw          Appendix A

  discovery, magic item, flora, fauna    Appendix C

  Trickster Gods, Omu gods, puzzle cubes Appendix F, Ch. 3

  Port Nyanzaru, Goldenthrone, Grand     Ch. 1 \> Locations in the City
  Souk, merchant prince                  

  Omu, Forbidden City                    Ch. 3

  Fane of the Night Serpent              Ch. 4

  Tomb of the Nine Gods, Rotten Halls,   Ch. 5
  Dungeon of Deception, Vault of         
  Reflection, Gears of Hate, Cradle of   
  Death                                  

  pronunciation                          Intro name/pronunciation list
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## Repo Integration

-   Chunking is already swappable via DI.
-   Add `hierarchicalChunker.ts` and `preFilter.ts` in
    `apps/api/src/rag/`.
-   Wire into retrieval flow: Query → Section search → Apply pre-filter
    → Chunk search.

------------------------------------------------------------------------

## Implementation Checklist

**A. Parsing & Section Tree** - \[ \] Add normalizer
(`tomb-normalize.ts`). - \[ \] Build section tree.

**B. Micro-Chunking** - \[ \] Add stat block, read-aloud, and table
detection.

**C. Embeddings** - \[ \] Generate section + chunk embeddings.

**D. Pre-filter** - \[ \] Implement `preFilter.ts` rules.

**E. Prompt & Logging** - \[ \] Show path + page numbers in citations. -
\[ \] Log filters used.

**F. Tests** - \[ \] Upload Tomb of Annihilation PDF. - \[ \] Run
queries like: - "Price of canoes in Port Nyanzaru" → Ch. 1. - "Azaka
Stormfang handout" → Appendix E. - "Zorbo stat block" → Appendix D. -
"Random encounters in Omu" → Appendix B.

------------------------------------------------------------------------

## Code Sketches

### Pre-Filter (TypeScript)

``` ts
export function preFilter(query: string) {
  const q = query.toLowerCase();
  const allow: string[] = [];
  const push = (prefix: string) => allow.push(prefix);

  if (/(handout|guide|azaka|eku)/.test(q)) { push("Appendix E"); push("Ch. 1 > Finding a Guide"); }
  if (/(random encounter|encounter table)/.test(q)) { push("Appendix B"); }
  if (/(armor class|hit points|stat block|zorbo|volo|xandala)/.test(q)) { push("Appendix D"); }
  if (/(background|bond|ideal|flaw)/.test(q)) { push("Appendix A"); }
  if (/(discovery|magic item|flora|fauna|plant)/.test(q)) { push("Appendix C"); }
  if (/(trickster god|puzzle cube|omu)/.test(q)) { push("Appendix F"); push("Ch. 3"); }
  if (/(port nyanzaru|goldenthrone|grand souk|merchant prince)/.test(q)) { push("Ch. 1 > Locations in the City"); }
  if (/forbidden city/.test(q)) { push("Ch. 3"); }
  if (/fane of the night serpent/.test(q)) { push("Ch. 4"); }
  if (/tomb of the nine gods|rotten halls|dungeon of deception|vault of reflection|gears of hate|cradle of death/.test(q)) { push("Ch. 5"); }

  return [...new Set(allow)];
}
```

### Hierarchical Chunker (Outline)

``` ts
export function extractSections(docText: string): Section[] {
  // 1. Split by [[PAGE:n]] markers.
  // 2. Detect CHAPTER / Appendix anchors.
  // 3. Detect known subheads within chapters.
  // 4. Return Section objects with path + text.
}
```

------------------------------------------------------------------------

## Do You Need a Custom Embedding Tool?

No. Stick with `text-embedding-3-small`. The improvements come from
**better chunking** and **smarter pre-filtering**, not from the
embedding model itself.

------------------------------------------------------------------------

## Timebox

These steps can be done in \~1--2 hours if focused: 1. Write
normalizer + hierarchical chunker (30--40m). 2. Add pre-filter function
(15m). 3. Wire into retrieval flow (15m). 4. Smoke test queries
(15--20m).
