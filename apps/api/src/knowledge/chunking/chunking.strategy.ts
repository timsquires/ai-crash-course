export type Chunk = {
  content: string;
  charCount: number;
  tokenCount?: number;
  metadata?: Record<string, unknown>;
};

export type ChunkOptions = {
  size?: number; // number of tokens per chunk
  overlap?: number; // number of tokens to overlap between chunks
};

export interface ChunkingStrategy {
  split(text: string, options?: ChunkOptions): Chunk[];
}

// DI token for selecting a chunking strategy without circular imports
export const CHUNKING_STRATEGY = Symbol('CHUNKING_STRATEGY');
