// NH - this is still having issues during extraction but runs
// even though it throws errors.

// NOTE: For TypeScript, add a declaration: declare module 'pdfjs-dist/legacy/build/pdf.mjs';

import fs from 'node:fs';

interface Section {
  path: string[];
  pageStart: number;
  pageEnd: number;
  text: string;
}

function approxFontSizeFromTransform(tr: number[]) {
  const [a, b, c, d] = tr;
  return Math.hypot(a, b, c, d);
}

function groupIntoLines(items: any[], yTolerance = 2) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: any[] = [];
  for (const it of sorted) {
    const line = lines.find((L) => Math.abs(L.y - it.y) <= yTolerance);
    if (line) {
      line.items.push(it);
      line.minX = Math.min(line.minX, it.x);
      line.maxX = Math.max(line.maxX, it.x);
      line.maxSize = Math.max(line.maxSize, it.size);
    } else {
      lines.push({
        y: it.y,
        items: [it],
        minX: it.x,
        maxX: it.x,
        maxSize: it.size,
      });
    }
  }
  for (const L of lines) {
    L.text = L.items
      .map((i: any) => i.str)
      .join('')
      .trim();
  }
  return lines;
}

function isAllCaps(text: string) {
  const letters = text.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function detectHeadings(lines: any[], pageWidth: number) {
  const sizes = lines
    .map((L) => L.maxSize)
    .filter(Boolean)
    .sort((a, b) => a - b);
  const median = sizes[Math.floor(sizes.length / 2)] || 0;
  const headings = [];
  for (const L of lines) {
    const text = L.text;
    if (!text) continue;
    const sizeBoost = L.maxSize >= median * 1.35;
    const centered = (() => {
      const lineCenter = (L.minX + L.maxX) / 2;
      const pageCenter = pageWidth / 2;
      return Math.abs(lineCenter - pageCenter) <= pageWidth * 0.12;
    })();
    const caps = isAllCaps(text);
    const shortish = text.length <= 60;
    const looksLikeNumbered = /^chapter\s+(\d+|[ivxlcdm]+)|^\d+\.\s+/i.test(
      text,
    );
    if ((sizeBoost && shortish && (centered || caps)) || looksLikeNumbered) {
      headings.push({
        y: L.y,
        text,
        maxSize: L.maxSize,
        minX: L.minX,
        maxX: L.maxX,
      });
    }
  }
  return headings.sort((a, b) => b.y - a.y);
}

export async function extractPdfSections(pdfPath: string): Promise<Section[]> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjs.getDocument({ data });
    const pdf = await loadingTask.promise;
    const sections: Section[] = [];
    let headings: { page: number; y: number; text: string }[] = [];
    let pageLines: { page: number; lines: any[]; width: number }[] = [];

    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const textContent = await page.getTextContent({
        includeMarkedContent: true,
      });
      let items: any[] = [];
      if (Array.isArray(textContent.items)) {
        items = textContent.items.map((it: any) => {
          const [a, b, c, d, e, f] = it.transform;
          const size = approxFontSizeFromTransform(it.transform);
          return {
            str: it.str,
            fontName: it.fontName,
            x: e,
            y: f,
            size,
          };
        });
      } else {
        console.warn(
          '[extractPdfSections] Warning: textContent.items is not an array on page',
          p,
        );
      }
      let lines = groupIntoLines(items);
      if (!Array.isArray(lines)) {
        console.warn(
          '[extractPdfSections] Warning: lines is not an array on page',
          p,
        );
        lines = [];
      }
      let detected = detectHeadings(lines, viewport.width);
      if (!Array.isArray(detected)) {
        console.warn(
          '[extractPdfSections] Warning: detectHeadings did not return an array on page',
          p,
        );
        detected = [];
      }
      // Defensive: filter out undefined/malformed detected elements before mapping
      const pageHeadings = Array.isArray(detected)
        ? detected
            .filter(
              (h) => h && typeof h === 'object' && 'y' in h && 'text' in h,
            )
            .map((h) => ({
              page: p,
              y: h.y,
              text: h.text,
            }))
        : [];
      headings = Array.isArray(headings) ? headings : [];
      headings.push(...pageHeadings);
      pageLines = Array.isArray(pageLines) ? pageLines : [];
      pageLines.push({ page: p, lines, width: viewport.width });
    }

    // Pass 2: Build sections
    // Sort headings by (page, y descending)
    if (!Array.isArray(headings)) {
      console.warn('[extractPdfSections] Warning: headings is not an array');
      return sections;
    }
    headings.sort((a, b) => a.page - b.page || b.y - a.y);
    for (let i = 0; i < headings.length; i++) {
      const h = headings[i];
      const next = headings[i + 1];
      const sectionLines: string[] = [];
      let page = h.page;
      const found = false;
      while (page <= (next ? next.page : pdf.numPages)) {
        const foundPage = pageLines.find((pl) => pl.page === page);
        let lines =
          foundPage && Array.isArray(foundPage.lines) ? foundPage.lines : [];
        if (!Array.isArray(lines)) {
          console.warn(
            '[extractPdfSections] Warning: lines is not an array for section page',
            page,
          );
          lines = [];
        }
        let fromIdx = 0;
        let toIdx = lines.length;
        if (page === h.page) {
          fromIdx = lines.findIndex((L) => L.y === h.y);
          if (fromIdx < 0) fromIdx = 0;
        }
        if (next && page === next.page) {
          toIdx = lines.findIndex((L) => L.y === next.y);
          if (toIdx < 0) toIdx = lines.length;
        }
        for (let li = fromIdx + 1; li < toIdx; li++) {
          if (
            lines[li] &&
            typeof lines[li] === 'object' &&
            typeof lines[li].text === 'string'
          ) {
            sectionLines.push(lines[li].text);
          }
        }
        if (next && page === next.page) break;
        page++;
      }
      const path = [h.text];
      sections.push({
        path,
        pageStart: h.page,
        pageEnd: next ? next.page : pdf.numPages,
        text: sectionLines.join('\n'),
      });
    }
    return sections;
  } catch (err) {
    console.error('[extractPdfSections] Fatal error:', err);
    // Log all relevant variables for debugging
    try {
      console.error('pdfPath:', pdfPath);
    } catch {}
    return [];
  }
}
