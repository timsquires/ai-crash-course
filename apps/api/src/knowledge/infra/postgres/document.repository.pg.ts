import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { DocumentEntity } from './document.entity';
import type {
  DocumentRepository,
  DocumentRecord,
} from '../../ports/document.repository';

@Injectable()
export class PgDocumentRepository implements DocumentRepository {
  constructor(
    @InjectRepository(DocumentEntity)
    private readonly repo: Repository<DocumentEntity>,
  ) {}

  async create(
    accountId: string,
    filename: string,
    mimeType: string,
  ): Promise<DocumentRecord> {
    const entity = this.repo.create({
      id: randomUUID(),
      accountId,
      filename,
      mimeType,
    });
    const saved = await this.repo.save(entity);
    return {
      id: saved.id,
      accountId: saved.accountId,
      filename: saved.filename,
      mimeType: saved.mimeType,
      createdAt: saved.createdAt,
    };
  }

  async deleteAll(accountId: string): Promise<void> {
    await this.repo.delete({ accountId });
  }
}
