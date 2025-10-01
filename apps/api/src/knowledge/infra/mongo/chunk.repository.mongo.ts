import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type {
  ChunkRepository,
  ChunkRecord,
} from '../../ports/chunk.repository';
import { ChunkModel } from './chunk.schema';

@Injectable()
export class MongoChunkRepository implements ChunkRepository {
  constructor(
    @InjectModel(ChunkModel.name) private readonly model: Model<ChunkModel>,
  ) {}

  async bulkCreate(
    chunks: Omit<ChunkRecord, 'id' | 'createdAt'>[],
  ): Promise<void> {
    const now = new Date();
    const docs = chunks.map((c) => ({
      ...c,
      id: randomUUID(),
      createdAt: now,
    }));
    await this.model.insertMany(docs);
  }

  async deleteAll(accountId: string): Promise<void> {
    await this.model.deleteMany({ accountId }).exec();
  }

  async searchTopK(
    accountId: string,
    queryEmbedding: number[],
    k: number,
  ): Promise<ChunkRecord[]> {
    // In-memory cosine for demo. For production, use MongoDB Atlas $vectorSearch
    const candidates = await this.model
      .find({ accountId })
      .limit(Math.max(100, k * 20))
      .lean()
      .exec();
    const scored = candidates.map((c: any) => ({
      c,
      score: cosine(queryEmbedding, c.embedding as number[]),
    }));
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ c }) => ({
        id: c.id,
        documentId: c.documentId,
        accountId: c.accountId,
        content: c.content,
        metadata: c.metadata,
        embedding: c.embedding,
        createdAt: c.createdAt,
      }));
  }

  async searchTopKByRestaurant(
    accountId: string,
    restaurant: string,
    queryEmbedding: number[],
    k: number,
  ): Promise<ChunkRecord[]> {
    // Pre-filter by restaurant, then in-memory cosine for demo. For production, use MongoDB Atlas $vectorSearch
    const candidates = await this.model
      .find({ accountId, 'metadata.restaurant': restaurant })
      .limit(Math.max(100, k * 20))
      .lean()
      .exec();
    const scored = candidates.map((c: any) => ({
      c,
      score: cosine(queryEmbedding, c.embedding as number[]),
    }));
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(({ c }) => ({
        id: c.id,
        documentId: c.documentId,
        accountId: c.accountId,
        content: c.content,
        metadata: c.metadata,
        embedding: c.embedding,
        createdAt: c.createdAt,
      }));
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!,
      y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}
