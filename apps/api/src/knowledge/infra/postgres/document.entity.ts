import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('documents')
export class DocumentEntity {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  accountId!: string;

  @Column({ type: 'varchar', length: 256 })
  filename!: string;

  @Column({ type: 'varchar', length: 128 })
  mimeType!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
