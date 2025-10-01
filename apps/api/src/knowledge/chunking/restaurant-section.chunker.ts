import { Injectable } from '@nestjs/common';
import { Chunk, ChunkOptions, ChunkingStrategy } from './chunking.strategy';

/**
 * RestaurantSectionChunker
 * Splits content by restaurant section headings (like Chipotle, Panera, etc.)
 * Each section becomes one chunk with restaurant metadata.
 */
@Injectable()
export class RestaurantSectionChunker implements ChunkingStrategy {
  // Canonical restaurant list with aliases for detection
  private readonly RESTAURANTS = [
    {
      name: 'Chipotle Mexican Grill',
      aliases: ['Chipotle Mexican Grill', 'Chipotle'],
    },
    {
      name: 'Panera Bread',
      aliases: ['Panera Bread', 'Panera'],
    },
    {
      name: 'Shake Shack',
      aliases: ['Shake Shack'],
    },
    {
      name: 'Chick-fil-A',
      aliases: ['Chick-fil-A', 'Chick Fil A', 'Chickfila', 'Chick fil a'],
    },
    {
      name: 'Five Guys',
      aliases: ['Five Guys'],
    },
    {
      name: 'Firehouse Subs',
      aliases: ['Firehouse Subs', 'Firehouse'],
    },
    {
      name: 'MOD Pizza',
      aliases: ['MOD Pizza', 'MOD'],
    },
    {
      name: 'Qdoba Mexican Eats',
      aliases: ['Qdoba Mexican Eats', 'Qdoba'],
    },
    {
      name: "Jersey Mike's Subs",
      aliases: [
        "Jersey Mike's Subs",
        "Jersey Mike's Subs",
        'Jersey Mikes Subs',
        "Jersey Mike's",
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

  split(text: string, options?: ChunkOptions): Chunk[] {
    // Normalize text
    const normalized = this.normalizeContent(text);

    // Split by restaurant sections
    const sections = this.splitByRestaurantSections(normalized);

    if (sections.length === 0) {
      // No recognized headings, return empty array or a single chunk without metadata
      return [];
    }

    const chunks: Chunk[] = [];

    for (const section of sections) {
      const resolved = this.resolveRestaurant(section.heading);
      if (!resolved) continue;

      // Build content with canonical heading + body
      const headingRe = new RegExp(
        '^\\s*' + this.escapeRegex(section.heading) + '\\s*',
        'i',
      );
      const body = this.normalizeContent(
        section.body.replace(headingRe, '').trim(),
      );
      const content = this.normalizeContent(
        `${resolved.restaurant}\n\n${body}`,
      );

      if (!content) continue;

      // Create chunk with restaurant metadata
      chunks.push({
        content,
        charCount: content.length,
        metadata: {
          restaurant: resolved.restaurant,
        },
      });
    }

    return chunks;
  }

  /** Normalize text for consistent parsing */
  private normalizeContent(input: string): string {
    const unified = input.replace(/\r\n?/g, '\n');
    const trimmedLines = unified
      .split('\n')
      .map((line) => line.replace(/[\t ]+$/g, ''))
      .join('\n');
    const collapsed = trimmedLines.replace(/\n{3,}/g, '\n\n');
    return collapsed.trim();
  }

  /** Escape a string for use inside a RegExp */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Build a RegExp that matches a heading line for any known restaurant alias */
  private buildSectionRegex(): RegExp {
    const escaped = this.RESTAURANTS.flatMap((r) => r.aliases).map((a) =>
      a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    const alternation = escaped.join('|');
    // Matches heading lines at start of line (case-insensitive, multiline)
    return new RegExp(`^(?:${alternation})\\s*$`, 'gim');
  }

  /** Locate all heading lines and slice the document into contiguous sections */
  private splitByRestaurantSections(
    text: string,
  ): Array<{ heading: string; start: number; end: number; body: string }> {
    const regex = this.buildSectionRegex();
    const matches: Array<{ heading: string; index: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      matches.push({ heading: m[0]!, index: m.index });
    }
    if (matches.length === 0) return [];

    const sections: Array<{
      heading: string;
      start: number;
      end: number;
      body: string;
    }> = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i]!.index;
      const end = i + 1 < matches.length ? matches[i + 1]!.index : text.length;
      const heading = matches[i]!.heading.trim();
      const body = text.slice(start, end);
      sections.push({ heading, start, end, body });
    }
    return sections;
  }

  /** Map a matched heading string to a canonical restaurant */
  private resolveRestaurant(
    heading: string,
  ): { restaurant: string; aliasesMatched: string[] } | null {
    const headingLower = heading.toLowerCase();
    for (const r of this.RESTAURANTS) {
      const matched = r.aliases.filter((a) => headingLower === a.toLowerCase());
      if (matched.length > 0)
        return { restaurant: r.name, aliasesMatched: matched };
    }
    return null;
  }

  /** Get list of canonical restaurant names for detection/filtering */
  getRestaurantNames(): string[] {
    return this.RESTAURANTS.map((r) => r.name);
  }

  /** Get restaurant name from alias (case-insensitive) */
  getRestaurantFromAlias(alias: string): string | null {
    const aliasLower = alias.toLowerCase();
    for (const r of this.RESTAURANTS) {
      if (
        r.aliases.some(
          (a) =>
            a.toLowerCase() === aliasLower ||
            aliasLower.includes(a.toLowerCase()),
        )
      ) {
        return r.name;
      }
    }
    return null;
  }
}

