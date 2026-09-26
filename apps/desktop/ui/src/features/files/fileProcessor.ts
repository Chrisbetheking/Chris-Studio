import type { AttachmentDraft, FileKind, ProcessorId } from '../../app/types';
import { makeId } from '../../app/store';

const CODE_EXTENSIONS = new Set(['js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'java', 'kt', 'swift', 'c', 'cc', 'cpp', 'h', 'hpp', 'cs', 'php', 'rb', 'sh', 'zsh', 'fish', 'sql', 'html', 'css', 'scss', 'vue', 'svelte', 'toml', 'ini', 'env']);
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'jsonl', 'csv', 'log', 'xml', 'yaml', 'yml', 'rtf']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff']);

export interface FileProcessingOptions {
  ocrLanguage?: 'eng' | 'chi_sim' | 'eng+chi_sim';
  ocrScannedPdf?: boolean;
  maxPdfOcrPages?: number;
}

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function classifyFile(file: Pick<File, 'name' | 'type'>): FileKind {
  const ext = extension(file.name);
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith('text/')) return 'text';
  if (ext === 'pdf' || file.type === 'application/pdf') return 'pdf';
  if (['docx', 'doc'].includes(ext)) return 'document';
  if (['xlsx', 'xls', 'ods'].includes(ext)) return 'spreadsheet';
  if (IMAGE_EXTENSIONS.has(ext) || file.type.startsWith('image/')) return 'image';
  return 'unknown';
}

async function ocrSource(source: File | HTMLCanvasElement, language: string, onProgress?: (progress: number) => void): Promise<string> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(language, 1, {
    logger: (message) => {
      if (message.status === 'recognizing text' && typeof message.progress === 'number') onProgress?.(message.progress);
    },
  });
  try {
    const result = await worker.recognize(source);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

async function readPdf(
  file: File,
  options: FileProcessingOptions,
  onProgress?: (progress: number) => void,
): Promise<{ text: string; pages: number; usedOcr: boolean; warnings: string[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const pdfDocument = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages: string[] = [];
  const warnings: string[] = [];
  let usedOcr = false;
  const maxOcrPages = Math.max(1, Math.min(options.maxPdfOcrPages ?? 12, 40));
  const language = options.ocrLanguage ?? 'eng+chi_sim';

  for (let index = 1; index <= pdfDocument.numPages; index += 1) {
    const page = await pdfDocument.getPage(index);
    const content = await page.getTextContent();
    let text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (options.ocrScannedPdf && text.length < 30 && index <= maxOcrPages) {
      const viewport = page.getViewport({ scale: 1.7 });
      const canvas = window.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (context) {
        await page.render({ canvas, canvasContext: context, viewport }).promise;
        text = (await ocrSource(canvas, language, (value) => onProgress?.(((index - 1) + value) / Math.min(pdfDocument.numPages, maxOcrPages)))).trim();
        usedOcr = true;
      }
    }
    pages.push(`[Page ${index}]\n${text}`);
  }

  if (pdfDocument.numPages > maxOcrPages && usedOcr) warnings.push(`Scanned-PDF OCR was limited to the first ${maxOcrPages} pages.`);
  if (!pages.join('').replace(/\[Page \d+\]/g, '').trim()) warnings.push('No readable text was found in this PDF.');
  return { text: pages.join('\n\n'), pages: pdfDocument.numPages, usedOcr, warnings };
}

async function readDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

function csvValue(value: unknown): string {
  if (value == null) return '';
  const normalized = typeof value === 'object' && value && 'text' in value
    ? String((value as { text?: unknown }).text ?? '')
    : value instanceof Date
      ? value.toISOString()
      : String(value);
  return /[\n\r,"]/.test(normalized) ? `"${normalized.replace(/"/g, '""')}"` : normalized;
}

async function readSheet(file: File): Promise<string> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer() as never);
  const sections: string[] = [];
  workbook.eachSheet((sheet) => {
    const rows: string[] = [];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map(csvValue).join(','));
    });
    sections.push(`# Sheet: ${sheet.name}\n${rows.join('\n')}`);
  });
  return sections.join('\n\n');
}

function processorFor(kind: FileKind, usedPdfOcr = false): ProcessorId {
  if (kind === 'pdf') return usedPdfOcr ? 'local-ocr' : 'pdf-extractor';
  if (kind === 'document') return 'docx-reader';
  if (kind === 'spreadsheet') return 'sheet-reader';
  if (kind === 'image') return 'local-ocr';
  return 'text-reader';
}

async function fileDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read image data.'));
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  });
}

export async function processFile(
  file: File,
  maxBytes: number,
  onProgress?: (progress: number) => void,
  options: FileProcessingOptions = {},
): Promise<AttachmentDraft> {
  if (file.size > maxBytes) throw new Error(`File exceeds the configured ${Math.round(maxBytes / 1_000_000)} MB processing limit.`);
  const kind = classifyFile(file);
  let content = '';
  let pageCount: number | undefined;
  let usedPdfOcr = false;
  let dataUrl: string | undefined;
  const warnings: string[] = [];
  const ocrLanguage = options.ocrLanguage ?? 'eng+chi_sim';

  if (kind === 'text' || kind === 'code') content = await file.text();
  else if (kind === 'pdf') {
    const result = await readPdf(file, { ...options, ocrScannedPdf: options.ocrScannedPdf ?? true }, onProgress);
    content = result.text;
    pageCount = result.pages;
    usedPdfOcr = result.usedOcr;
    warnings.push(...result.warnings);
  } else if (kind === 'document') content = await readDocx(file);
  else if (kind === 'spreadsheet') content = await readSheet(file);
  else if (kind === 'image') {
    content = await ocrSource(file, ocrLanguage, onProgress);
    dataUrl = await fileDataUrl(file);
  } else {
    throw new Error('This file type is not supported by the local processor yet.');
  }

  return {
    id: makeId('attachment'),
    name: file.name,
    size: file.size,
    content: content.slice(0, 1_500_000),
    kind,
    processor: processorFor(kind, usedPdfOcr),
    mimeType: file.type,
    pageCount,
    warnings,
    dataUrl,
    ocrLanguage: kind === 'image' || usedPdfOcr ? ocrLanguage : undefined,
  };
}
