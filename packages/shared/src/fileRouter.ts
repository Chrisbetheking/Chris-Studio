import type { FileCategory, FileTypeInfo, FileRoutingRule, ProviderModel } from './types';
import { PROVIDERS } from './providers';

const FILE_TYPE_MAP: FileTypeInfo[] = [
  {
    category: 'pdf',
    mimeTypes: ['application/pdf'],
    extensions: ['.pdf'],
    label: 'PDF Document',
    recommendedModel: 'claude-sonnet-4-20250514',
  },
  {
    category: 'document',
    mimeTypes: [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
      'text/plain',
    ],
    extensions: ['.doc', '.docx', '.odt', '.txt', '.rtf'],
    label: 'Document',
    recommendedModel: 'claude-sonnet-4-20250514',
  },
  {
    category: 'spreadsheet',
    mimeTypes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv',
    ],
    extensions: ['.xls', '.xlsx', '.csv', '.tsv'],
    label: 'Spreadsheet',
    recommendedModel: 'gpt-4o',
  },
  {
    category: 'presentation',
    mimeTypes: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
    extensions: ['.ppt', '.pptx'],
    label: 'Presentation',
    recommendedModel: 'gpt-4o',
  },
  {
    category: 'image',
    mimeTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'],
    extensions: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'],
    label: 'Image',
    recommendedModel: 'gemini-2.5-pro',
  },
  {
    category: 'code',
    mimeTypes: [
      'text/x-python',
      'text/x-java',
      'text/javascript',
      'text/typescript',
      'application/json',
      'text/x-c',
    ],
    extensions: [
      '.py', '.js', '.ts', '.tsx', '.jsx', '.java', '.c', '.cpp', '.h',
      '.rs', '.go', '.rb', '.php', '.swift', '.kt', '.json', '.yaml', '.yml',
      '.toml', '.xml', '.sh', '.bash', '.ps1', '.sql',
    ],
    label: 'Code',
    recommendedModel: 'gpt-4o',
  },
  {
    category: 'markdown',
    mimeTypes: ['text/markdown'],
    extensions: ['.md', '.mdx', '.markdown'],
    label: 'Markdown',
    recommendedModel: 'claude-sonnet-4-20250514',
  },
  {
    category: 'log',
    mimeTypes: ['text/plain'],
    extensions: ['.log', '.logs'],
    label: 'Log',
    recommendedModel: 'gpt-4o',
  },
  {
    category: 'data',
    mimeTypes: ['application/json', 'application/xml', 'text/xml'],
    extensions: ['.json', '.jsonl', '.xml', '.parquet'],
    label: 'Data File',
    recommendedModel: 'gpt-4o',
  },
  {
    category: 'archive',
    mimeTypes: ['application/zip', 'application/gzip', 'application/x-tar'],
    extensions: ['.zip', '.gz', '.tar', '.tar.gz', '.7z'],
    label: 'Archive',
    recommendedModel: 'gpt-4o',
  },
];

/**
 * Reduce a browser MIME value to its bare essence.
 *
 * `File.type` carries the media type verbatim, so it routinely includes
 * parameters (`application/pdf; charset=utf-8`), padding, and header-style
 * casing. Comparing such a value directly against the mapping missed every
 * match and the file fell through to `unknown`.
 */
function normalizeMimeType(mimeType: string | undefined): string | undefined {
  if (typeof mimeType !== 'string') return undefined;
  const bare = mimeType.split(';', 1)[0].trim().toLowerCase();
  return bare || undefined;
}

/**
 * Derive the compound extension when there is one.
 *
 * `.tar.gz` must win over `.gz`, and a dotfile like `.env` is a name rather
 * than an extension, so the leading dot is not treated as a separator.
 */
function normalizedExtension(fileName: string): string {
  const name = String(fileName ?? '').trim().toLowerCase();
  const lastDot = name.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === name.length - 1) return '';
  return name.slice(lastDot);
}

export function detectFileType(fileName: string, mimeType?: string): FileTypeInfo {
  const name = String(fileName ?? '').trim().toLowerCase();
  const ext = normalizedExtension(name);
  const mime = normalizeMimeType(mimeType);

  // Explicit MIME information is the stronger signal, so it is consulted first
  // across the whole table before the extension is considered.
  if (mime) {
    for (const info of FILE_TYPE_MAP) {
      if (info.mimeTypes.includes(mime)) return info;
    }
  }

  // Compound extensions are only meaningful as a whole, so the longest match
  // is preferred: `.tar.gz` before `.gz`.
  const compound = FILE_TYPE_MAP
    .flatMap((info) => info.extensions.map((extension) => ({ info, extension })))
    .filter((entry) => entry.extension.startsWith('.') && name.endsWith(entry.extension))
    .sort((a, b) => b.extension.length - a.extension.length);
  if (compound.length > 0) return compound[0].info;

  if (ext) {
    for (const info of FILE_TYPE_MAP) {
      if (info.extensions.includes(ext)) return info;
    }
  }

  return {
    category: 'unknown',
    mimeTypes: [],
    extensions: [],
    label: 'Unknown',
    recommendedModel: 'gpt-4o',
  };
}

export function getDefaultFileRoutingRules(): FileRoutingRule[] {
  const WORKFLOW_MAP: Record<string, { reason: string; workflow: string }> = {
    pdf: {
      reason: 'PDFs often contain long-form text; Claude excels at document analysis',
      workflow: 'Extract text -> clean noise -> chunk -> route to long-context model',
    },
    document: {
      reason: 'Documents need careful reading and structure preservation',
      workflow: 'Parse -> clean -> scan for sensitive data -> route for analysis',
    },
    spreadsheet: {
      reason: 'Tabular data benefits from GPT-4o structured reasoning',
      workflow: 'Parse sheets -> extract key data -> route for structured analysis',
    },
    presentation: {
      reason: 'Presentations mix text and structure; GPT-4o handles well',
      workflow: 'Extract slides -> preserve order -> route for summary',
    },
    image: {
      reason: 'Images need multimodal processing; Gemini excels here',
      workflow: 'OCR if needed -> describe visual content -> route extracted text',
    },
    code: {
      reason: 'Code review and generation benefits from GPT-4o coding strength',
      workflow: 'Detect language -> scan for secrets -> route with coding instructions',
    },
    markdown: {
      reason: 'Markdown documentation benefits from Claude nuanced reading',
      workflow: 'Parse structure -> preserve headings -> route for documentation tasks',
    },
    log: {
      reason: 'Logs can be very long; GPT-4o handles large context',
      workflow: 'Truncate if too long -> extract errors -> route with context window',
    },
    data: {
      reason: 'JSON/XML data benefits from GPT-4o structured analysis',
      workflow: 'Validate format -> extract schema -> route for data tasks',
    },
    archive: {
      reason: 'Archives need extraction before analysis',
      workflow: 'Extract contents -> process individual files -> route each separately',
    },
    unknown: {
      reason: 'Unknown file type; default to general-purpose model',
      workflow: 'Attempt text extraction -> scan for secrets -> route to general model',
    },
  };

  return FILE_TYPE_MAP.map((info, i) => {
    const provider = info.recommendedModel.startsWith('gpt')
      ? 'OpenAI'
      : info.recommendedModel.includes('claude')
        ? 'Claude'
        : info.recommendedModel.includes('gemini')
          ? 'Gemini'
          : 'OpenAI';

    const meta = WORKFLOW_MAP[info.category] || WORKFLOW_MAP.unknown;

    return {
      id: 'rule-' + i,
      fileCategory: info.category,
      provider,
      model: info.recommendedModel,
      enabled: info.category !== 'unknown',
      description: 'Route ' + info.label.toLowerCase() + ' files to ' + info.recommendedModel,
      reason: meta.reason,
      workflow: meta.workflow,
    };
  });
}

export function recommendModelForFile(
  fileName: string,
  mimeType?: string,
  rules?: FileRoutingRule[],
  providers?: ProviderModel[]
): ProviderModel | null {
  const fileInfo = detectFileType(fileName, mimeType);
  const ruleList = rules || getDefaultFileRoutingRules();
  const rule = ruleList.find((r) => r.fileCategory === fileInfo.category && r.enabled);

  if (!rule) return null;

  const modelList = providers || PROVIDERS;
  return modelList.find(
    (m) => m.provider === rule.provider && m.model === rule.model
  ) || null;
}
