# Extracting Chapter Headings from PDFs with pdfjs-dist (Node.js)

This guide shows how to use **pdfjs-dist** in Node.js to parse PDFs (e.g., RPG books like *Tomb of Annihilation*) and detect chapter headings using font size, alignment, and style.

---

## 1. Install & Import
```bash
npm i pdfjs-dist
```

```js
// parse-pdf.js
import fs from "node:fs";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.js"; // 'legacy' build works well in Node
```

---

## 2. Load the PDF and Extract Structured Text
```js
async function loadPdf(filePath) {
  const data = new Uint8Array(fs.readFileSync(filePath));
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;
  return pdf;
}

function approxFontSizeFromTransform(tr) {
  const [a, b, c, d] = tr;
  return Math.hypot(a, b, c, d); // rotation-robust size estimate
}

async function extractPageItems(pdf, pageNumber) {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const textContent = await page.getTextContent({ includeMarkedContent: true });

  const items = textContent.items.map(it => {
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

  return { pageNumber, width: viewport.width, height: viewport.height, items };
}
```

---

## 3. Group Into Lines
```js
function groupIntoLines(items, yTolerance = 2) {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines = [];
  for (const it of sorted) {
    const line = lines.find(L => Math.abs(L.y - it.y) <= yTolerance);
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
    L.text = L.items.map(i => i.str).join("").trim();
  }
  return lines;
}
```

---

## 4. Detect Chapter Headings (Heuristics)
```js
function isAllCaps(text) {
  const letters = text.replace(/[^A-Za-z]/g, "");
  return letters.length >= 3 && letters === letters.toUpperCase();
}

function detectHeadings(lines, pageWidth) {
  const sizes = lines.map(L => L.maxSize).filter(Boolean).sort((a,b)=>a-b);
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
    const looksLikeNumbered = /^chapter\s+\d+|^\d+\.\s+/i.test(text);

    if ((sizeBoost && shortish && (centered || caps)) || looksLikeNumbered) {
      headings.push({ y: L.y, text, maxSize: L.maxSize, minX: L.minX, maxX: L.maxX });
    }
  }
  return headings.sort((a, b) => b.y - a.y);
}
```

---

## 5. Putting It Together
```js
export async function findChapterHeadings(pdfPath) {
  const pdf = await loadPdf(pdfPath);
  const results = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await extractPageItems(pdf, p);
    const lines = groupIntoLines(page.items);
    const headings = detectHeadings(lines, page.width);

    const withContext = headings.map(h => {
      const below = lines.filter(L => L.y < h.y).slice(0, 5).map(L => L.text).join(" ");
      return { page: p, heading: h.text, preview: below };
    });

    results.push(...withContext);
  }

  return results;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const pdfPath = process.argv[2] ?? path.resolve("your.pdf");
  findChapterHeadings(pdfPath).then(h => {
    console.log(JSON.stringify(h, null, 2));
  });
}
```

---

## 6. Tips for Accuracy
- Use `fontName` to distinguish bold/italic. Many fonts have suffixes like `...Bold`.
- Merge consecutive centered lines to handle multi-line titles.
- Filter headers/footers by ignoring text very close to page edges.
- Add Roman numeral regex: `/^chapter\s+[ivxlcdm]+$/i`.
- For image-only PDFs, run OCR first (e.g., Tesseract).

---

## 7. Chunking for RAG
1. Identify `(page, heading, y)`.
2. Collect lines until the next heading.
3. Save `{ id, path: [Book, Chapter, Subsection], pageStart, pageEnd, text }`.
4. Feed these into your hierarchical chunker.

---

This setup should let you detect and extract chapters reliably in Node.js using **pdfjs-dist**.
