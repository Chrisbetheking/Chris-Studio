# 2026-06-08 — Document Intelligence Pipeline

## Summary

This update adds the first version of the **Document Intelligence Pipeline** to TokenFence Studio.

The goal is to make file handling more useful than basic upload. Before document content is sent to an LLM, TokenFence can now parse, clean, scan, chunk, and route the content.

This is still an early-stage implementation, but it gives the project a clearer document workflow:

```text
File Upload
  -> text extraction / best-effort parsing
  -> cleaning
  -> sensitive data scanning
  -> RAG-ready chunks
  -> file-level model route
  -> Markdown / JSON export
```

## Added

- Added a new **Docs** tab in the main workspace.
- Added `DocumentPipelineDesk` for document upload, pasted document input, report preview, and export preview.
- Added `/api/documents` for processing uploaded or pasted documents.
- Added a new document pipeline library under `src/lib/document/`.
- Added best-effort parsing for:
  - Text files
  - Markdown files
  - Logs
  - JSON / JSONL
  - Code files
  - PDF files
  - DOCX files
  - Image placeholders for future OCR / vision model support
- Added document cleaning rules for:
  - Extra blank lines
  - Page numbers
  - Common repeated page headers
  - Common repeated page footers
  - Duplicate paragraphs
  - Simple line-break hyphenation
- Added RAG-ready chunk generation with metadata.
- Added per-chunk risk scanning using the existing TokenFence scanner.
- Added suggested model routing per file and per chunk.
- Added Markdown export and `chunks.json` export.
- Added example assets under `examples/document-intelligence/`.
- Added `docs/INTERVIEW_NOTES.md` with project explanation notes.
- Added `docs/releases/v0.3.0.md` as a release note draft.

## Changed

- Updated the main Studio navigation to include a **Docs** page.
- Updated README files to describe the Document Intelligence Pipeline.
- Updated README project structure and roadmap.
- Bumped the package version to `0.3.0`.

## Files Updated

- `package.json`
- `README.md`
- `README.zh-CN.md`
- `src/components/studio.tsx`

## Files Added

- `src/components/document-pipeline-desk.tsx`
- `src/app/api/documents/route.ts`
- `src/lib/document/pipeline.ts`
- `src/lib/document/server-parsers.ts`
- `examples/document-intelligence/README.md`
- `examples/document-intelligence/sample.pdf`
- `examples/document-intelligence/sample.docx`
- `examples/document-intelligence/sample-image.png`
- `examples/document-intelligence/before-cleaning.txt`
- `examples/document-intelligence/after-cleaning.md`
- `examples/document-intelligence/chunks.json`
- `docs/INTERVIEW_NOTES.md`
- `docs/releases/v0.3.0.md`
- `docs/changelog/2026-06-08-document-intelligence-pipeline.md`

## Notes

The PDF and DOCX parsers are intentionally lightweight for now. They are useful for a first prototype and examples, but they are not meant to replace production-grade layout-aware document extraction.

The image flow currently creates a safe placeholder instead of real OCR. A future version can connect local OCR, a vision model, or an OCR provider.
