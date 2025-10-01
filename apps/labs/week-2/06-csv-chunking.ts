// Week 2 — 06: CSV Chunking with Checkride Data
// Purpose: Demonstrate the CSV chunker with the checkride tracking report
// Shows how CSV data is chunked while preserving row integrity and adding metadata

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type CsvChunk = {
  chunkIndex: number;
  content: string;
  charCount: number;
  metadata: Record<string, unknown>;
};

// Import the CSV chunker (we'll simulate it since we can't import from the API directly)
class CsvChunker {
  /**
   * CSV-aware chunker that preserves row integrity and maintains structural context.
   */
  split(text: string, options?: { size?: number }): CsvChunk[] {
    const lines = text.split('\n').filter((line) => line.trim() !== '');

    if (lines.length === 0) {
      return [
        {
          chunkIndex: 0,
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
          chunkIndex: 0,
          content: header || '',
          charCount: (header || '').length,
          metadata: {
            type: 'csv',
            rows: 0,
            hasHeader: true,
            columns: this.parseColumns(header || ''),
          },
        },
      ];
    }

    // Parse CSV columns from header
    const columns = this.parseColumns(header || '');

    // Determine chunk size based on options or default
    const maxRowsPerChunk = options?.size
      ? Math.max(1, Math.floor(options.size / 10))
      : 5; // Default 5 rows per chunk

    const chunks: CsvChunk[] = [];

    // Process data rows in groups
    for (let i = 0; i < dataRows.length; i += maxRowsPerChunk) {
      const chunkRows = dataRows.slice(i, i + maxRowsPerChunk);
      const chunkContent = [header, ...chunkRows].join('\n');

      // Analyze the chunk to add meaningful metadata
      const metadata = this.analyzeChunk(chunkRows, columns);

      chunks.push({
        chunkIndex: Math.floor(i / maxRowsPerChunk),
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
    const firstRow = this.parseRow(rows[0] || '');

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

export default async function main() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const csvPath = path.resolve(here, 'documents/CheckrideTracking_Report (2).csv');
  const outDir = path.resolve(here, 'output/06-csv-chunking');

  // Create output directory
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  console.log('Week-2 / 06-csv-chunking');
  console.log('Reading CSV file:', path.relative(process.cwd(), csvPath));

  if (!fs.existsSync(csvPath)) {
    console.error('CSV file not found:', csvPath);
    return;
  }

  // Read the CSV file
  const csvContent = await fsp.readFile(csvPath, 'utf8');
  console.log(`Loaded CSV with ${csvContent.split('\n').length - 1} data rows`);

  // Initialize the CSV chunker
  const chunker = new CsvChunker();

  // Test different chunk sizes
  const chunkSizes = [3, 5, 10];
  const allResults: Record<string, CsvChunk[]> = {};

  for (const chunkSize of chunkSizes) {
    console.log(`\n=== Testing with ${chunkSize} rows per chunk ===`);
    
    const chunks = chunker.split(csvContent, { size: chunkSize });
    allResults[`chunkSize_${chunkSize}`] = chunks;

    console.log(`Generated ${chunks.length} chunks:`);
    
    chunks.forEach((chunk, index) => {
      console.log(`\n--- Chunk ${index + 1} ---`);
      console.log(`Rows: ${chunk.metadata.rows} (${chunk.metadata.rowStart}-${chunk.metadata.rowEnd})`);
      console.log(`Characters: ${chunk.charCount}`);
      console.log(`Columns: ${(chunk.metadata.columns as string[]).length}`);
      console.log(`Metadata:`, JSON.stringify(chunk.metadata, null, 2));
      
      // Show first few lines of content
      const contentLines = chunk.content.split('\n');
      console.log(`Content preview (${contentLines.length} lines):`);
      contentLines.slice(0, 3).forEach((line, i) => {
        console.log(`  ${i + 1}: ${line.length > 80 ? line.substring(0, 80) + '...' : line}`);
      });
      if (contentLines.length > 3) {
        console.log(`  ... and ${contentLines.length - 3} more lines`);
      }
    });
  }

  // Save results to files
  const resultsPath = path.join(outDir, 'csv-chunks.json');
  await fsp.writeFile(resultsPath, JSON.stringify(allResults, null, 2), 'utf8');

  const manifest = {
    lab: '06-csv-chunking',
    sourceFile: 'CheckrideTracking_Report (2).csv',
    totalRows: csvContent.split('\n').length - 1,
    chunkSizes: chunkSizes,
    results: Object.keys(allResults).map(key => {
      const chunks = allResults[key] || [];
      const chunkSizes = chunks.map(chunk => chunk.charCount);
      const totalRows = chunks.reduce((sum, chunk) => sum + (chunk.metadata.rows as number), 0);
      
      return {
        chunkSize: key.replace('chunkSize_', ''),
        chunkCount: chunks.length,
        totalRows: totalRows,
        chunkSizes: {
          min: chunkSizes.length > 0 ? Math.min(...chunkSizes) : 0,
          max: chunkSizes.length > 0 ? Math.max(...chunkSizes) : 0,
          average: chunkSizes.length > 0 ? Math.round(chunkSizes.reduce((sum, size) => sum + size, 0) / chunkSizes.length) : 0,
          all: chunkSizes
        }
      };
    })
  };

  const manifestPath = path.join(outDir, 'manifest.json');
  await fsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log('\n=== Summary ===');
  console.log('Wrote:');
  console.log(' -', path.relative(process.cwd(), resultsPath));
  console.log(' -', path.relative(process.cwd(), manifestPath));
  
  console.log('\nChunking Results:');
  Object.entries(allResults).forEach(([key, chunks]) => {
    const chunkSize = key.replace('chunkSize_', '');
    const chunkSizes = chunks.map(chunk => chunk.charCount);
    const minSize = Math.min(...chunkSizes);
    const maxSize = Math.max(...chunkSizes);
    const avgSize = Math.round(chunkSizes.reduce((sum, size) => sum + size, 0) / chunkSizes.length);
    
    console.log(`  ${chunkSize} rows/chunk: ${chunks.length} chunks`);
    console.log(`    Chunk sizes: ${minSize}-${maxSize} chars (avg: ${avgSize})`);
  });
}
