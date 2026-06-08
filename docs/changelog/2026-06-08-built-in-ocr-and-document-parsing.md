# 2026-06-08 — Built-in OCR and Document Parsing

## Summary

This update upgrades the Document Intelligence Pipeline from a placeholder document workflow into a real local parsing workflow.

TokenFence Studio can now extract text from PDF and DOCX files and run built-in OCR for uploaded image files before sending anything to an LLM.

## Added

- Added `pdf-parse` for real PDF text extraction.
- Added `mammoth` for DOCX raw text extraction.
- Added `tesseract.js` for local image OCR.
- Added OCR language configuration in the Docs workspace.
- Added an OCR enable / disable switch for image uploads.
- Added server-side parsing through `/api/documents` using the Node.js runtime.
- Added TypeScript module declarations for document parser dependencies.

## Improved

- PDF and DOCX uploads now produce extracted text instead of relying only on lightweight fallback parsing.
- Image uploads now run a local OCR path instead of returning only a placeholder record.
- The Docs workspace now explains the difference between text PDF extraction, image OCR, and scanned-PDF page OCR.
- The document pipeline still connects extracted text to cleaning, risk scanning, chunk generation, and file-level model routing.

## Notes

- Text-based PDFs are supported through PDF text extraction.
- Normal DOCX files are supported through DOCX raw text extraction.
- Image OCR is supported through Tesseract.js.
- Scanned PDF page OCR still needs a PDF-to-image rendering step before OCR can be applied to each page. This is planned as a later improvement.

## Files Updated

- `package.json`
- `src/app/api/documents/route.ts`
- `src/components/document-pipeline-desk.tsx`
- `src/lib/document/server-parsers.ts`
- `src/types/external-modules.d.ts`
