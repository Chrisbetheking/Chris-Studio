import type { GuardResult, RiskLevel, SensitiveFinding, SensitiveType } from './types';

interface Pattern {
  type: SensitiveType;
  label: string;
  regex: RegExp;
}

const PATTERNS: Pattern[] = [
  { type: 'api_key', label: 'API Key', regex: /(?:sk(-proj)?|api[_-]?key|apikey)[=:]\s*['"]?\s*[\w-]{20,}['"]?/gi },
  { type: 'token', label: 'Token', regex: /(?:bearer\s+|ghp_|gho_|ghu_|ghs_|github_pat_|xox[bpras]-\S+)/gi },
  { type: 'database_url', label: 'Database URL', regex: /(?:postgres|mysql|mongodb|redis):\/\/[^\s]+/gi },
  { type: 'email', label: 'Email', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { type: 'phone', label: 'Phone', regex: /(?:\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g },
  { type: 'secret_assignment', label: 'Secret Assignment', regex: /(?:secret|password|passwd|pwd)\s*[=:]\s*['"][^'"]{2,}['"]/gi },
  { type: 'chinese_id', label: 'Chinese ID', regex: /[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]/g },
  { type: 'credential_like', label: 'Credential-like Text', regex: /(?:access[_-]?key|secret[_-]?key|private[_-]?key)[=:]\s*\S+/gi },
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
