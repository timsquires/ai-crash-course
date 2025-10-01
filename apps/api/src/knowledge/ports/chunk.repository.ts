export const CHUNK_REPOSITORY = Symbol('CHUNK_REPOSITORY');

export interface ChunkRecord {
  id: string;
  documentId: string;
  accountId: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding: number[];
  createdAt: Date;
}

export interface ChunkRepository {
  bulkCreate(chunks: Omit<ChunkRecord, 'id' | 'createdAt'>[]): Promise<void>;
  deleteAll(accountId: string): Promise<void>;
  searchTopK(
    accountId: string,
    queryEmbedding: number[],
    k: number,
  ): Promise<ChunkRecord[]>;
  searchTopKByRestaurant(
    accountId: string,
    restaurant: string,
    queryEmbedding: number[],
    k: number,
  ): Promise<ChunkRecord[]>;
}
