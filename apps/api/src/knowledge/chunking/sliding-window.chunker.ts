import { Chunk, ChunkOptions, ChunkingStrategy } from './chunking.strategy';
import { encoding_for_model } from '@dqbd/tiktoken';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SlidingWindowChunker implements ChunkingStrategy {
  /**
   * Token‑aware sliding window splitter.
   * - Encodes the full text with tiktoken (model taken from OPENAI_MODEL or default)
   * - Emits overlapping slices of tokens
   * - Decodes each slice back to a string for downstream embedding/storage
   *
   * size: number of tokens per chunk (default 300)
   * overlap: number of tokens overlapped between consecutive chunks (default 50)
   */
  split(text: string, options?: ChunkOptions): Chunk[] {
    // Pick an encoder compatible with your embedding/chat model
    const model = (process.env.OPENAI_MODEL as any) || 'gpt-4o-mini';
    const enc = encoding_for_model(model);
    try {
      // Convert the string into token ids
      const tokens = enc.encode(text);
      // Configure the window and the stride between successive chunks
      const size = Math.max(50, options?.size ?? 300);
      const overlap = Math.max(0, Math.min(options?.overlap ?? 50, size - 1));
      const step = Math.max(1, size - overlap);

      const result: Chunk[] = [];
      for (let start = 0; start < tokens.length; start += step) {
        const end = Math.min(start + size, tokens.length);
        const slice = tokens.slice(start, end);
        // Decode back to text. Some builds return Uint8Array; normalize to string.
        const decoded = enc.decode(slice as any) as unknown;
        const content = typeof decoded === 'string'
          ? decoded
          : new TextDecoder('utf-8').decode(decoded as Uint8Array);
        result.push({ content, charCount: content.length, tokenCount: slice.length });
        if (end >= tokens.length) break;
      }
      return result;
    } finally {
      // Always free the encoder to avoid leaks
      enc.free();
    }
  }
}


