import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { ChunkEntity } from './chunk.entity';
import type {
  ChunkRepository,
  ChunkRecord,
} from '../../ports/chunk.repository';

@Injectable()
export class PgChunkRepository implements ChunkRepository {
  constructor(
    @InjectRepository(ChunkEntity)
    private readonly repo: Repository<ChunkEntity>,
  ) {}

  async bulkCreate(
    chunks: Omit<ChunkRecord, 'id' | 'createdAt'>[],
  ): Promise<void> {
    // Preferred two-step: save base columns via ORM, then UPDATE vector per row
    if (chunks.length === 0) return;
    const baseRows: DeepPartial<ChunkEntity>[] = chunks.map((c) => ({
      id: randomUUID(),
      documentId: c.documentId,
      accountId: c.accountId,
      content: c.content,
      metadata: c.metadata ?? {},
    }));
    await this.repo.save(baseRows);
    for (let i = 0; i < baseRows.length; i++) {
      const id = baseRows[i]!.id as string;
      const vec = `[${(chunks[i]!.embedding || []).join(',')}]`;
      await this.repo.query(
        'UPDATE chunks SET embedding_vec = $1::vector WHERE id = $2',
        [vec, id],
      );
    }
  }

  async deleteAll(accountId: string): Promise<void> {
    await this.repo.delete({ accountId });
  }

  async searchTopK(
    accountId: string,
    queryEmbedding: number[],
    k: number,
  ): Promise<ChunkRecord[]> {
    // pgvector cosine distance operator <#>
    const queryVec = `[${(queryEmbedding || []).join(',')}]`;
    const rows: any[] = await this.repo.query(
      'SELECT id, "documentId", "accountId", content, metadata, embedding_vec, "createdAt" FROM chunks WHERE "accountId" = $1 AND embedding_vec IS NOT NULL ORDER BY embedding_vec <#> $2::vector LIMIT $3',
      [accountId, queryVec, k],
    );
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      accountId: row.accountId,
      content: row.content,
      metadata: row.metadata,
      embedding: row.embedding_vec,
      createdAt: row.createdAt,
    }));
  }

  async searchTopKByRestaurant(
    accountId: string,
    restaurant: string,
    queryEmbedding: number[],
    k: number,
  ): Promise<ChunkRecord[]> {
    // pgvector cosine distance with metadata filter
    const queryVec = `[${(queryEmbedding || []).join(',')}]`;
    const rows: any[] = await this.repo.query(
      'SELECT id, "documentId", "accountId", content, metadata, embedding_vec, "createdAt" FROM chunks WHERE "accountId" = $1 AND metadata->>\'restaurant\' = $2 AND embedding_vec IS NOT NULL ORDER BY embedding_vec <#> $3::vector LIMIT $4',
      [accountId, restaurant, queryVec, k],
    );
    return rows.map((row) => ({
      id: row.id,
      documentId: row.documentId,
      accountId: row.accountId,
      content: row.content,
      metadata: row.metadata,
      embedding: row.embedding_vec,
      createdAt: row.createdAt,
    }));
  }
}
