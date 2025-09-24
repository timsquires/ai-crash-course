export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

export interface DocumentRecord {
  id: string;
  accountId: string;
  filename: string;
  mimeType: string;
  createdAt: Date;
}

export interface DocumentRepository {
  create(accountId: string, filename: string, mimeType: string): Promise<DocumentRecord>;
  deleteAll(accountId: string): Promise<void>;
}


