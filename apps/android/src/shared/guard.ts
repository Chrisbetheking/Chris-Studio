import type { GuardResult, RiskLevel, SensitiveFinding, SensitiveType } from './types';

interface Pattern {
  type: SensitiveType;
  label: string;
  regex: RegExp;
}

// Every pattern must consume the credential BODY, never just its prefix.
// Matching only "ghp_" or "Bearer " previously left the secret itself in the
// "redacted" output, so the guard reported high risk while shipping the token.
const PATTERNS: Pattern[] = [
  // Provider keys with an explicit assignment prefix keep their label context.
  { type: 'api_key', label: 'API Key', regex: /(?:api[_-]?key|apikey)\s*[=:]\s*['"]?\s*[\w-]{16,}['"]?/gi },
  // Bare provider keys (sk-, sk-proj-, ds-, ak-) must also be caught.
  { type: 'api_key', label: 'API Key', regex: /\b(?:sk(?:-proj)?|ds|ak)-[A-Za-z0-9_-]{16,}\b/g },
  // Bearer tokens: consume the whole credential that follows the scheme.
  { type: 'token', label: 'Token', regex: /\bbearer\s+[A-Za-z0-9._~+/=-]{12,}/gi },
  // GitHub token families, including the underscore inside github_pat_ bodies.
  { type: 'token', label: 'Token', regex: /\b(?:ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]{16,}\b/g },
  // Slack token families.
  { type: 'token', label: 'Token', regex: /\bxox[bpras]-[A-Za-z0-9-]{10,}\b/g },
  { type: 'database_url', label: 'Database URL', regex: /(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"']+/gi },
  { type: 'email', label: 'Email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'phone', label: 'Phone', regex: /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
  // Both quoted and bare `.env` style assignments must be redacted.
  { type: 'secret_assignment', label: 'Secret Assignment', regex: /(?:secret|password|passwd|pwd)\s*[=:]\s*(?:['"][^'"\s]{2,}['"]|[^\s'"]{4,})/gi },
  { type: 'chinese_id', label: 'Chinese ID', regex: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g },
  { type: 'credential_like', label: 'Credential-like Text', regex: /(?:access[_-]?key|secret[_-]?key|private[_-]?key)\s*[=:]\s*(?:['"][^'"\s]{2,}['"]|[^\s'"]{4,})/gi },
];

function redactMatch(match: string, type: SensitiveType): string {
  if (match.length <= 4) return '***';
  if (type === 'email') {
    const [name, domain] = match.split('@');
    return name[0] + '***@' + domain;
  }
  return match.slice(0, 2) + '***' + match.slice(-2);
}

function findOverlap(findings: SensitiveFinding[]): SensitiveFinding[] {
  const sorted = [...findings].sort((a, b) => a.start - b.start);
  const result: SensitiveFinding[] = [];
  let lastEnd = 0;
  for (const f of sorted) {
    if (f.start >= lastEnd) {
      result.push(f);
      lastEnd = Math.max(lastEnd, f.end);
    }
  }
  return result;
}

function computeRisk(findings: SensitiveFinding[]): RiskLevel {
  if (findings.length === 0) return 'safe';
  const severe = findings.some((f) => f.type === 'api_key' || f.type === 'token' || f.type === 'database_url');
  if (severe) return 'high';
  if (findings.length >= 3) return 'medium';
  return 'low';
}

export function scanPrompt(text: string): GuardResult {
  const allFindings: SensitiveFinding[] = [];

  for (const pattern of PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      allFindings.push({
        type: pattern.type,
        label: pattern.label,
        match: match[0],
        redacted: redactMatch(match[0], pattern.type),
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  const findings = findOverlap(allFindings);
  findings.sort((a, b) => a.start - b.start);

  let redacted = text;
  for (let i = findings.length - 1; i >= 0; i--) {
    const f = findings[i];
    redacted = redacted.slice(0, f.start) + f.redacted + redacted.slice(f.end);
  }

  return {
    riskLevel: computeRisk(findings),
    findings,
    original: text,
    redacted,
    timestamp: Date.now(),
  };
}
