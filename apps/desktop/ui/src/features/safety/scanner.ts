import type {
  AttachmentDraft,
  PayloadScanResult,
  RiskLevel,
  SafetyFinding,
  Severity,
  TextScanResult,
} from '../../app/types';

let findingSequence = 0;

function findingId(): string {
  findingSequence += 1;
  return `finding_${Date.now().toString(36)}_${findingSequence.toString(36)}`;
}

interface PatternRule {
  kind: string;
  label: string;
  severity: Severity;
  source: string;
  flags?: string;
}

const RULES: PatternRule[] = [
  {
    kind: 'private_key',
    label: 'Private key',
    severity: 'critical',
    source: '-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\\s\\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----',
    flags: 'gi',
  },
  {
    kind: 'bearer_token',
    label: 'Bearer token',
    severity: 'critical',
    source: '\\bBearer\\s+[A-Za-z0-9._~+/=-]{12,}\\b',
    flags: 'gi',
  },
  {
    kind: 'api_key',
    label: 'API key',
    severity: 'critical',
    source: '\\b(?:sk|ds|ak)-(?:proj-)?[A-Za-z0-9_-]{16,}\\b',
    flags: 'gi',
  },
  {
    kind: 'github_token',
    label: 'GitHub token',
    severity: 'critical',
    source: '\\bgh[pousr]_[A-Za-z0-9]{20,}\\b',
    flags: 'g',
  },
  {
    kind: 'aws_access_key',
    label: 'AWS access key',
    severity: 'critical',
    source: '\\bAKIA[0-9A-Z]{16}\\b',
    flags: 'g',
  },
  {
    kind: 'database_url',
    label: 'Database connection URL',
    severity: 'critical',
    source: '\\b(?:postgres(?:ql)?|mysql|mongodb(?:\\+srv)?|redis):\\/\\/[^\\s"\'<>]+',
    flags: 'gi',
  },
  {
    kind: 'secret_assignment',
    label: 'Assigned secret',
    severity: 'critical',
    source: '\\b(?:api[_-]?key|client[_-]?secret|access[_-]?token|auth[_-]?token|password|passwd)\\s*[:=]\\s*["\']?[^\\s"\',;]{8,}',
    flags: 'gi',
  },
  {
    kind: 'credit_card',
    label: 'Payment card number',
    severity: 'high',
    source: '\\b(?:\\d[ -]*?){13,19}\\b',
    flags: 'g',
  },
  {
    kind: 'cn_identity',
    label: 'Chinese identity number',
    severity: 'high',
    source: '\\b\\d{17}[0-9Xx]\\b',
    flags: 'g',
  },
  {
    kind: 'email',
    label: 'Email address',
    severity: 'medium',
    source: '\\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}\\b',
    flags: 'gi',
  },
  {
    kind: 'phone',
    label: 'Phone number',
    severity: 'medium',
    source: '(?<!\\d)(?:\\+?86[- ]?)?1[3-9]\\d{9}(?!\\d)|(?<!\\d)\\+?[1-9]\\d{7,14}(?!\\d)',
    flags: 'g',
  },
];

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 45,
  high: 25,
  medium: 12,
  low: 4,
};

const RISK_ORDER: RiskLevel[] = ['safe', 'low', 'medium', 'high', 'critical'];

function replacementFor(kind: string): string {
  return `[REDACTED:${kind.toUpperCase()}]`;
}

function overlaps(a: Pick<SafetyFinding, 'start' | 'end'>, b: Pick<SafetyFinding, 'start' | 'end'>): boolean {
  return a.start < b.end && b.start < a.end;
}

function normalizeCustomTerms(terms: string[]): string[] {
  return Array.from(
    new Set(
      terms
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
        .slice(0, 100),
    ),
  );
}

export function riskLevelFromScore(score: number, findings: SafetyFinding[]): RiskLevel {
  if (findings.some((finding) => finding.severity === 'critical')) return 'critical';
  if (findings.some((finding) => finding.severity === 'high') || score >= 40) return 'high';
  if (findings.some((finding) => finding.severity === 'medium') || score >= 18) return 'medium';
  if (findings.length > 0) return 'low';
  return 'safe';
}

export function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(a) >= RISK_ORDER.indexOf(b) ? a : b;
}

export function scanText(input: string, customTerms: string[] = []): TextScanResult {
  const candidates: SafetyFinding[] = [];

  for (const rule of RULES) {
    const expression = new RegExp(rule.source, rule.flags ?? 'g');
    for (const match of input.matchAll(expression)) {
      if (typeof match.index !== 'number' || !match[0]) continue;
      candidates.push({
        id: findingId(),
        kind: rule.kind,
        label: rule.label,
        severity: rule.severity,
        start: match.index,
        end: match.index + match[0].length,
        replacement: replacementFor(rule.kind),
      });
    }
  }

  for (const term of normalizeCustomTerms(customTerms)) {
    let from = 0;
    while (from < input.length) {
      const index = input.toLocaleLowerCase().indexOf(term.toLocaleLowerCase(), from);
      if (index < 0) break;
      candidates.push({
        id: findingId(),
        kind: 'custom_term',
        label: 'Custom sensitive term',
        severity: 'high',
        start: index,
        end: index + term.length,
        replacement: replacementFor('custom_term'),
      });
      from = index + Math.max(term.length, 1);
    }
  }

  const severityRank: Record<Severity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const findings = candidates
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity] || (b.end - b.start) - (a.end - a.start))
    .reduce<SafetyFinding[]>((accepted, candidate) => {
      if (!accepted.some((existing) => overlaps(existing, candidate))) accepted.push(candidate);
      return accepted;
    }, [])
    .sort((a, b) => a.start - b.start);

  let cursor = 0;
  let redactedText = '';
  for (const finding of findings) {
    redactedText += input.slice(cursor, finding.start);
    redactedText += finding.replacement;
    cursor = finding.end;
  }
  redactedText += input.slice(cursor);

  const riskScore = Math.min(100, findings.reduce((sum, finding) => sum + SEVERITY_WEIGHT[finding.severity], 0));
  return {
    originalLength: input.length,
    redactedText,
    findings,
    riskLevel: riskLevelFromScore(riskScore, findings),
    riskScore,
    estimatedTokens: Math.max(0, Math.ceil(input.length / 4)),
  };
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `${value.length.toString(36)}-${(hash >>> 0).toString(36)}`;
}

export function payloadHash(prompt: string, attachments: AttachmentDraft[]): string {
  return fnv1a([
    prompt,
    ...attachments.map((file) => `${file.name}\u0000${file.size}\u0000${file.content}`),
  ].join('\u0001'));
}

export function scanPayload(
  prompt: string,
  attachments: AttachmentDraft[],
  customTerms: string[] = [],
): PayloadScanResult {
  const promptScan = scanText(prompt, customTerms);
  const scannedAttachments = attachments.map((attachment) => ({
    ...attachment,
    scan: scanText(attachment.content, customTerms),
  }));
  const findings = [
    ...promptScan.findings,
    ...scannedAttachments.flatMap((attachment) => attachment.scan.findings),
  ];
  const riskScore = Math.min(
    100,
    promptScan.riskScore + scannedAttachments.reduce((sum, attachment) => sum + attachment.scan.riskScore, 0),
  );
  const riskLevel = scannedAttachments.reduce(
    (level, attachment) => maxRisk(level, attachment.scan.riskLevel),
    promptScan.riskLevel,
  );
  return {
    hash: payloadHash(prompt, attachments),
    prompt: promptScan,
    attachments: scannedAttachments,
    findings,
    riskLevel,
    riskScore,
    estimatedTokens: promptScan.estimatedTokens
      + scannedAttachments.reduce((sum, attachment) => sum + attachment.scan.estimatedTokens, 0),
  };
}

export function formatSafePayload(scan: PayloadScanResult): string {
  const sections: string[] = [];
  if (scan.prompt.redactedText.trim()) sections.push(scan.prompt.redactedText.trim());
  for (const attachment of scan.attachments) {
    sections.push(`\n--- Safe attachment: ${attachment.name} ---\n${attachment.scan.redactedText}`);
  }
  return sections.join('\n').trim();
}
