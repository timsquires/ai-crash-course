import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomUUID } from 'node:crypto';
import type { DocumentRepository, DocumentRecord } from '../../ports/document.repository';
import { DocumentModel } from './document.schema';

@Injectable()
export class MongoDocumentRepository implements DocumentRepository {
  constructor(@InjectModel(DocumentModel.name) private readonly model: Model<DocumentModel>) {}

  async create(accountId: string, filename: string, mimeType: string): Promise<DocumentRecord> {
    const now = new Date();
    const rec: DocumentRecord = { id: randomUUID(), accountId, filename, mimeType, createdAt: now };
    await this.model.create(rec);
    return rec;
  }

  async deleteAll(accountId: string): Promise<void> {
    await this.model.deleteMany({ accountId }).exec();
  }
}


