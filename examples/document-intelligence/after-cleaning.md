# Document Intelligence Output

## before-cleaning.txt

- Type: text
- Risk: critical
- Tokens: 92 -> 71 (22% saved)
- Suggested route: ollama / llama3.1

### before-cleaning-txt-001
Metadata: section=Document; tokens=71; risk=critical; route=ollama/llama3.1

Client: Acme Pay CN
Contact: [EMAIL_1] / [PHONE_CN_1]
Database: [DATABASE_URL_1]

TokenFence should not just upload files. It should parse documents, clean repeated headers, scan sensitive values, create RAG-ready chunks, and route each file to a suitable model.

Document Intelligence Pipeline should support PDF, DOCX, image OCR placeholders, logs, Markdown, and code files.

Secret-like files should prefer local models or redacted cloud requests.

The output should include clean Markdown, chunks.json, risk metadata, and suggested model routing.
