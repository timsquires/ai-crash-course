import { Injectable } from '@nestjs/common';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import type { Document as LCDocument } from '@langchain/core/documents';

@Injectable()
export class DocumentLoaderService {
  private async writeTempFile(filename: string, buffer: Buffer): Promise<string> {
    const ext = path.extname(filename).toLowerCase();
    const tmpPath = path.join(os.tmpdir(), `upload-${randomUUID()}${ext}`);
    await (await import('node:fs/promises')).writeFile(tmpPath, buffer);
    return tmpPath;
  }

  async loadFromBuffer(filename: string, buffer: Buffer): Promise<string> {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf') {
      const tmpPath = await this.writeTempFile(filename, buffer);
      try {
        const loader = new PDFLoader(tmpPath, { parsedItemSeparator: '\n' } as any);
        const docs = await loader.load();
        return docs.map((d: LCDocument) => String(d.pageContent || '')).join('\n\n');
      } finally {
        await (await import('node:fs/promises')).unlink(tmpPath).catch(() => {});
      }
    }
    if (ext === '.docx') {
      const tmpPath = await this.writeTempFile(filename, buffer);
      try {
        const loader = new DocxLoader(tmpPath);
        const docs = await loader.load();
        return docs.map((d: LCDocument) => String(d.pageContent || '')).join('\n\n');
      } finally {
        await (await import('node:fs/promises')).unlink(tmpPath).catch(() => {});
      }
    }
    // default: treat as UTF-8 text
    return buffer.toString('utf8');
  }
}


