# Document Intelligence Example

This folder contains small sample files for testing the TokenFence Document Intelligence Pipeline.

## Files

- `sample.pdf` - simple PDF with repeated page-style text and sensitive-looking content.
- `sample.docx` - simple DOCX document with the same idea.
- `sample-image.png` - image-style sample for future OCR / vision model workflows.
- `before-cleaning.txt` - noisy raw text with repeated headers, page numbers, and sensitive values.
- `after-cleaning.md` - expected clean Markdown-style output.
- `chunks.json` - example chunk metadata shape.

## How to use

1. Run the app with `npm run dev`.
2. Open the **Docs** tab.
3. Upload `sample.pdf`, `sample.docx`, or paste `before-cleaning.txt`.
4. Run the pipeline.
5. Compare the output with `after-cleaning.md` and `chunks.json`.

The current parser is intentionally lightweight. It is good enough for a prototype and examples, but production-quality extraction should use stronger PDF layout parsing and OCR.
