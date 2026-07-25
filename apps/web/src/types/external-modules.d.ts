declare module "pdf-parse" {
  type PdfParseResult = {
    numpages?: number;
    numrender?: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    text: string;
    version?: string;
  };

  const pdfParse: (buffer: Buffer | Uint8Array, options?: Record<string, unknown>) => Promise<PdfParseResult>;
  export default pdfParse;
}

declare module "mammoth" {
  type MammothMessage = { type?: string; message?: string };
  export function extractRawText(input: { buffer: Buffer }): Promise<{ value: string; messages: MammothMessage[] }>;
}
