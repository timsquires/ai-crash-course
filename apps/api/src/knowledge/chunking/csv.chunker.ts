import { Chunk, ChunkOptions, ChunkingStrategy } from './chunking.strategy';
import { Injectable } from '@nestjs/common';

@Injectable()
export class CsvChunker implements ChunkingStrategy {
  /**
   * CSV-aware chunker that preserves row integrity and maintains structural context.
   * - Never splits rows across chunks
   * - Includes headers with each chunk for context
   * - Groups related rows together
   * - Adds metadata about the data type and structure
   */
  split(text: string, options?: ChunkOptions): Chunk[] {
    const lines = text.split('\n').filter((line) => line.trim() !== '');

    if (lines.length === 0) {
      return [
        {
          content: text,
          charCount: text.length,
          metadata: { type: 'csv', rows: 0 },
        },
      ];
    }

    // First line is typically the header
    const header = lines[0];
    const dataRows = lines.slice(1);

    if (dataRows.length === 0) {
      // Only header, no data
      return [
        {
          content: header,
          charCount: header.length,
          metadata: {
            type: 'csv',
            rows: 0,
            hasHeader: true,
            columns: this.parseColumns(header),
          },
        },
      ];
    }

    // Parse CSV columns from header
    const columns = this.parseColumns(header);

    // Determine chunk size based on options or default
    const maxRowsPerChunk = options?.size
      ? Math.max(1, Math.floor(options.size / 10))
      : 5; // Default 5 rows per chunk

    const chunks: Chunk[] = [];

    // Process data rows in groups
    for (let i = 0; i < dataRows.length; i += maxRowsPerChunk) {
      const chunkRows = dataRows.slice(i, i + maxRowsPerChunk);
      const chunkContent = [header, ...chunkRows].join('\n');

      // Analyze the chunk to add meaningful metadata
      const metadata = this.analyzeChunk(chunkRows, columns);

      chunks.push({
        content: chunkContent,
        charCount: chunkContent.length,
        metadata: {
          type: 'csv',
          hasHeader: true,
          columns,
          rows: chunkRows.length,
          rowStart: i + 1, // 1-indexed
          rowEnd: i + chunkRows.length,
          ...metadata,
        },
      });
    }

    return chunks;
  }

  /**
   * Parse CSV columns from header row
   */
  private parseColumns(header: string): string[] {
    // Simple CSV parsing - handles quoted fields
    const columns: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < header.length; i++) {
      const char = header[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        columns.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add the last column
    if (current.trim()) {
      columns.push(current.trim());
    }

    return columns;
  }

  /**
   * Analyze chunk content to extract meaningful metadata
   */
  private analyzeChunk(
    rows: string[],
    columns: string[],
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    if (rows.length === 0) return metadata;

    // Try to identify common patterns in the data
    const firstRow = this.parseRow(rows[0]);

    // Look for common column patterns
    if (
      columns.some(
        (col) =>
          col.toLowerCase().includes('student') ||
          col.toLowerCase().includes('name'),
      )
    ) {
      metadata.hasStudentData = true;
      const studentCol = columns.find(
        (col) =>
          col.toLowerCase().includes('student') ||
          col.toLowerCase().includes('name'),
      );
      if (studentCol && firstRow[columns.indexOf(studentCol)]) {
        metadata.sampleStudent = firstRow[columns.indexOf(studentCol)];
      }
    }

    if (columns.some((col) => col.toLowerCase().includes('course'))) {
      metadata.hasCourseData = true;
      const courseCol = columns.find((col) =>
        col.toLowerCase().includes('course'),
      );
      if (courseCol && firstRow[columns.indexOf(courseCol)]) {
        metadata.sampleCourse = firstRow[columns.indexOf(courseCol)];
      }
    }

    if (columns.some((col) => col.toLowerCase().includes('date'))) {
      metadata.hasDateData = true;
    }

    if (
      columns.some(
        (col) =>
          col.toLowerCase().includes('result') ||
          col.toLowerCase().includes('grade'),
      )
    ) {
      metadata.hasResultData = true;
      const resultCol = columns.find(
        (col) =>
          col.toLowerCase().includes('result') ||
          col.toLowerCase().includes('grade'),
      );
      if (resultCol && firstRow[columns.indexOf(resultCol)]) {
        metadata.sampleResult = firstRow[columns.indexOf(resultCol)];
      }
    }

    // Count unique values in key columns
    const uniqueStudents = new Set();
    const uniqueCourses = new Set();

    rows.forEach((row) => {
      const parsedRow = this.parseRow(row);
      const studentCol = columns.find(
        (col) =>
          col.toLowerCase().includes('student') ||
          col.toLowerCase().includes('name'),
      );
      const courseCol = columns.find((col) =>
        col.toLowerCase().includes('course'),
      );

      if (studentCol && parsedRow[columns.indexOf(studentCol)]) {
        uniqueStudents.add(parsedRow[columns.indexOf(studentCol)]);
      }
      if (courseCol && parsedRow[columns.indexOf(courseCol)]) {
        uniqueCourses.add(parsedRow[columns.indexOf(courseCol)]);
      }
    });

    if (uniqueStudents.size > 0) {
      metadata.uniqueStudents = uniqueStudents.size;
    }
    if (uniqueCourses.size > 0) {
      metadata.uniqueCourses = uniqueCourses.size;
    }

    return metadata;
  }

  /**
   * Parse a single CSV row into an array of values
   */
  private parseRow(row: string): string[] {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < row.length; i++) {
      const char = row[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    // Add the last value
    if (current.trim()) {
      values.push(current.trim());
    }

    return values;
  }
}
