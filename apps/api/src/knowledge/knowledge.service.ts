import { Inject, Injectable } from '@nestjs/common';
import { CHUNKING_STRATEGY } from './chunking/chunking.strategy';
import type { Express } from 'express';
import 'multer';
import type { ChunkingStrategy } from './chunking/chunking.strategy';
import { DocumentLoaderService } from './document-loader.service';
import { EmbeddingsService } from './embeddings.service';
import {
  DOCUMENT_REPOSITORY,
  type DocumentRepository,
} from './ports/document.repository';
import {
  CHUNK_REPOSITORY,
  type ChunkRepository,
} from './ports/chunk.repository';

@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(CHUNKING_STRATEGY) private readonly chunker: ChunkingStrategy,
    private readonly loader: DocumentLoaderService,
    private readonly embeddings: EmbeddingsService,
    @Inject(DOCUMENT_REPOSITORY) private readonly documents: DocumentRepository,
    @Inject(CHUNK_REPOSITORY) private readonly chunksRepo: ChunkRepository,
  ) {}

  async ingest(files: Express.Multer.File[], accountId: string) {
    // Parse files (pdf/docx/txt), split via injected chunker, embed, then (TODO) persist via repositories.
    // NOTE: For Mongo (non-Atlas), similarity search must be in-memory; for production use MongoDB Atlas $vectorSearch.
    const texts: string[] = [];
    for (const f of files) {
      const text = await this.loader.loadFromBuffer(f.originalname, f.buffer);
      if (text && text.trim()) texts.push(text);
    }

    const chunks = texts.flatMap((t) =>
      this.chunker.split(t, { size: 400, overlap: 60 }),
    );

    if (process.env.DEBUG_RAG) {
      console.log('[ingest] produced chunks:', chunks.length);
      // Peek at the first few paths to prove hierarchy is present
      const samplePaths = chunks
        .slice(0, 5)
        .map((c) => (c.metadata as any)?.path?.join?.(' > '))
        .filter(Boolean);
      console.log('[ingest] sample paths:', samplePaths);
    }

    const nonEmpty = chunks.filter(
      (c) => typeof c.content === 'string' && c.content.trim().length > 0,
    );
    const vectors = await this.embeddings.embedMany(
      nonEmpty.map((c) => c.content),
    );
    // Persist minimal records
    const doc = await this.documents.create(
      accountId,
      files[0]?.originalname || 'upload',
      files[0]?.mimetype || 'text/plain',
    );

    await this.chunksRepo.bulkCreate(
      nonEmpty.map((c, i) => {
        const md = c.metadata || {};
        // Merge existing counts with hierarchical metadata if present
        const metadata = {
          ...md,
          charCount: c.charCount,
          tokenCount: c.tokenCount,
          // Normalize path to an array of strings for consistency
          path: Array.isArray((md as any).path)
            ? (md as any).path
            : (md as any).path
              ? [String((md as any).path)]
              : undefined,
        };

        return {
          documentId: doc.id,
          accountId,
          content: c.content,
          metadata,
          embedding: vectors[i] || [],
        };
      }),
    );

    return {
      ok: true,
      accountId,
      files: files.map((f) => f.originalname),
      chunks: nonEmpty.length,
      embeddingModel:
        process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small',
      dimension: vectors[0]?.length || 0,
    };
  }

  async deleteAll(accountId: string) {
    await this.chunksRepo.deleteAll(accountId);
    await this.documents.deleteAll(accountId);
    return { ok: true, accountId, deleted: true };
  }
}
