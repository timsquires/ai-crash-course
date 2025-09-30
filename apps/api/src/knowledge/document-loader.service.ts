import { Injectable } from '@nestjs/common';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { DocxLoader } from '@langchain/community/document_loaders/fs/docx';
import type { Document as LCDocument } from '@langchain/core/documents';

// NEW: normalization utilities
import { normalizePages, normalizeText, type PageLike } from './tomb-normalize';
import { extractPdfSections } from './pdf-heading-extractor';

@Injectable()
export class DocumentLoaderService {
  private async writeTempFile(
    filename: string,
    buffer: Buffer,
  ): Promise<string> {
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
        // Keep LangChain’s PDFLoader, but normalize per page for [[PAGE:n]] + cleanup
        const loader = new PDFLoader(tmpPath, {
          parsedItemSeparator: '\n',
        } as any);
        const docs = await loader.load(); // LCDocument[] (one per page, typically)

        // Map to PageLike[]
        const pages: PageLike[] = docs.map((d: LCDocument, i: number) => ({
          pageNumber:
            (d.metadata as any)?.loc?.pageNumber ??
            (d.metadata as any)?.page ??
            i + 1,
          text: String(d.pageContent || ''),
        }));

        const normalized = normalizePages(pages, {
          log: !!process.env.DEBUG_RAG,
        });

        // Supplement: extract structured sections using pdfjs-dist
        try {
          const sections = await extractPdfSections(tmpPath);
          if (process.env.DEBUG_RAG) {
            console.log(
              '[DocumentLoader] PDF extracted sections:',
              sections.map((s) => ({
                path: s.path,
                pageStart: s.pageStart,
                pageEnd: s.pageEnd,
                textLen: s.text.length,
              })),
            );
          }
        } catch (err) {
          if (process.env.DEBUG_RAG) {
            console.warn(
              '[DocumentLoader] PDF section extraction failed:',
              err,
            );
          }
        }

        if (process.env.DEBUG_RAG) {
          console.log(
            '[DocumentLoader] PDF normalized length:',
            normalized.text.length,
          );
        }
        return normalized.text;
      } finally {
        await (await import('node:fs/promises'))
          .unlink(tmpPath)
          .catch(() => {});
      }
    }

    if (ext === '.docx') {
      const tmpPath = await this.writeTempFile(filename, buffer);
      try {
        const loader = new DocxLoader(tmpPath);
        const docs = await loader.load();
        const raw = docs
          .map((d: LCDocument) => String(d.pageContent || ''))
          .join('\n\n');
        const clean = normalizeText(raw, { log: !!process.env.DEBUG_RAG });
        if (process.env.DEBUG_RAG) {
          console.log('[DocumentLoader] DOCX normalized length:', clean.length);
        }
        return clean;
      } finally {
        await (await import('node:fs/promises'))
          .unlink(tmpPath)
          .catch(() => {});
      }
    }

    // default: treat as UTF-8 text
    const raw = buffer.toString('utf8');
    const clean = normalizeText(raw, { log: !!process.env.DEBUG_RAG });
    if (process.env.DEBUG_RAG) {
      console.log('[DocumentLoader] TEXT normalized length:', clean.length);
    }
    return clean;
  }

  async loadStructuredFromBuffer(
    filename: string,
    buffer: Buffer,
  ): Promise<{
    text: string;
    sections?: Array<{
      path: string[];
      pageStart: number;
      pageEnd: number;
      text: string;
    }>;
  }> {
    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf') {
      const tmpPath = await this.writeTempFile(filename, buffer);
      try {
        const loader = new PDFLoader(tmpPath, {
          parsedItemSeparator: '\n',
        } as any);
        const docs = await loader.load();
        const pages: PageLike[] = docs.map((d: LCDocument, i: number) => ({
          pageNumber:
            (d.metadata as any)?.loc?.pageNumber ??
            (d.metadata as any)?.page ??
            i + 1,
          text: String(d.pageContent || ''),
        }));
        const normalized = normalizePages(pages, {
          log: !!process.env.DEBUG_RAG,
        });
        let sections = undefined;
        try {
          sections = await extractPdfSections(tmpPath);
          if (process.env.DEBUG_RAG) {
            console.log(
              '[DocumentLoader] PDF extracted sections:',
              sections.map((s) => ({
                path: s.path,
                pageStart: s.pageStart,
                pageEnd: s.pageEnd,
                textLen: s.text.length,
              })),
            );
          }
        } catch (err) {
          if (process.env.DEBUG_RAG) {
            console.warn(
              '[DocumentLoader] PDF section extraction failed:',
              err,
            );
          }
        }
        if (process.env.DEBUG_RAG) {
          console.log(
            '[DocumentLoader] PDF normalized length:',
            normalized.text.length,
          );
        }
        return { text: normalized.text, sections };
      } finally {
        await (await import('node:fs/promises'))
          .unlink(tmpPath)
          .catch(() => {});
      }
    }
    // fallback for other types
    const text = await this.loadFromBuffer(filename, buffer);
    return { text };
  }
}
