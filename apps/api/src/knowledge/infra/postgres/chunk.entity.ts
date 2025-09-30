import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('chunks')
export class ChunkEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  documentId!: string;

  @Column({ type: 'varchar', length: 64 })
  accountId!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  // embedding_vec exists in DB via migration; intentionally not mapped to avoid TypeORM type errors.

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
