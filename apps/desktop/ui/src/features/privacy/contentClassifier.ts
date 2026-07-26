export type PrivacyRoute = 'remote-ok' | 'review' | 'local-only';
export type PrivacyRisk = 'safe' | 'low' | 'medium' | 'high' | 'critical';

export interface PrivacyAssessmentInput {
  text: string;
  paths?: string[];
  customTerms?: string[];
}

export interface PrivacyAssessment {
  route: PrivacyRoute;
  risk: PrivacyRisk;
  score: number;
  confidence: number;
  categories: string[];
  reasons: string[];
  matchedSignals: number;
}

interface Signal {
  id: string;
  label: string;
  category: string;
  weight: number;
  hardLocal?: boolean;
  pattern: RegExp;
}

const CONTENT_SIGNALS: Signal[] = [
  { id: 'private-key', label: 'private key material', category: 'credentials', weight: 70, hardLocal: true, pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/i },
  { id: 'authorization', label: 'authorization token', category: 'credentials', weight: 55, hardLocal: true, pattern: /\b(?:authorization\s*:\s*bearer\s+|bearer\s+)[a-z0-9._~+/=-]{16,}/i },
  { id: 'secret-assignment', label: 'credential assignment', category: 'credentials', weight: 48, hardLocal: true, pattern: /\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|passwd|secret)\b\s*[:=]\s*["']?[^\s,"'}]{8,}/i },
  { id: 'known-token', label: 'provider or platform token', category: 'credentials', weight: 55, hardLocal: true, pattern: /\b(?:sk-[a-z0-9_-]{20,}|gh[opusr]_[a-z0-9]{20,}|github_pat_[a-z0-9_]{20,}|AKIA[0-9A-Z]{16})\b/i },
  { id: 'credential-url', label: 'credential-bearing service URL', category: 'credentials', weight: 48, hardLocal: true, pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s:@/]+:[^\s@/]+@/i },
  { id: 'session-cookie', label: 'session or cookie secret', category: 'credentials', weight: 42, hardLocal: true, pattern: /\b(?:session[_-]?id|cookie|set-cookie)\b\s*[:=]\s*[^\s;]{12,}/i },
  { id: 'personal-id', label: 'government or personal identifier', category: 'personal-data', weight: 34, pattern: /\b(?:身份证|护照|社会保障号|social security|passport number|national id)\b/i },
  { id: 'health', label: 'health or medical information', category: 'regulated-data', weight: 38, pattern: /\b(?:diagnosis|medical record|patient|病历|诊断|患者|处方|病人)\b/i },
  { id: 'finance', label: 'financial or payroll information', category: 'financial-data', weight: 34, pattern: /\b(?:payroll|salary sheet|bank account|credit card|工资表|薪资|银行账户|银行卡|财务报表)\b/i },
  { id: 'customer-data', label: 'customer or user dataset', category: 'customer-data', weight: 30, pattern: /\b(?:customer list|customer data|user database|crm export|客户名单|客户数据|用户数据库|用户明细)\b/i },
  { id: 'confidential', label: 'confidential or non-public context', category: 'confidential', weight: 26, pattern: /\b(?:confidential|strictly private|internal only|not for distribution|under nda|商业机密|内部资料|仅限内部|保密|未公开|禁止外传)\b/i },
  { id: 'internal-architecture', label: 'private architecture or incident context', category: 'internal-technical', weight: 22, pattern: /\b(?:internal architecture|production topology|incident report|postmortem|threat model|内部架构|生产拓扑|事故报告|安全事件|威胁模型)\b/i },
  { id: 'email', label: 'email address', category: 'personal-data', weight: 8, pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { id: 'phone', label: 'phone number', category: 'personal-data', weight: 8, pattern: /(?<!\d)(?:\+?86[- ]?)?1[3-9]\d{9}(?!\d)|(?<!\d)\+?[1-9]\d{7,14}(?!\d)/ },
];

const PATH_SIGNALS: Signal[] = [
  { id: 'env-path', label: 'environment or secret configuration path', category: 'credentials', weight: 36, hardLocal: true, pattern: /(^|\/)(?:\.env(?:\.|$)|secrets?\b|credentials?\b|id_rsa\b|id_ed25519\b|\.npmrc$|\.pypirc$)/i },
  { id: 'private-path', label: 'private or internal path', category: 'confidential', weight: 18, pattern: /(^|\/)(?:private|internal|confidential|finance|payroll|customers?|patients?|contracts?)(\/|$)/i },
  { id: 'key-extension', label: 'key or certificate file', category: 'credentials', weight: 42, hardLocal: true, pattern: /\.(?:pem|key|p12|pfx|jks|keystore)$/i },
];

const PUBLIC_HINTS = [
  /(^|\/)(?:README|LICENSE|CONTRIBUTING|CHANGELOG)(?:\.[^/]*)?$/i,
  /\b(?:public documentation|open source|公开文档|开源项目|公开说明)\b/i,
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function matches(pattern: RegExp, value: string): boolean {
  pattern.lastIndex = 0;
  return pattern.test(value);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function riskFor(score: number, hardLocal: boolean): PrivacyRisk {
  if (hardLocal || score >= 70) return 'critical';
  if (score >= 50) return 'high';
  if (score >= 28) return 'medium';
  if (score >= 10) return 'low';
  return 'safe';
}

export function classifyPrivacy(input: PrivacyAssessmentInput): PrivacyAssessment {
  const text = String(input.text || '').slice(0, 600_000);
  const paths = (input.paths || []).map((entry) => String(entry || '').replace(/\\/g, '/')).slice(0, 100);
  const reasons: string[] = [];
  const categories: string[] = [];
  let score = 0;
  let matchedSignals = 0;
  let hardLocal = false;

  for (const signal of CONTENT_SIGNALS) {
    if (!matches(signal.pattern, text)) continue;
    score += signal.weight;
    matchedSignals += 1;
    hardLocal ||= Boolean(signal.hardLocal);
    reasons.push(signal.label);
    categories.push(signal.category);
  }
  for (const path of paths) {
    for (const signal of PATH_SIGNALS) {
      if (!matches(signal.pattern, path)) continue;
      score += signal.weight;
      matchedSignals += 1;
      hardLocal ||= Boolean(signal.hardLocal);
      reasons.push(`${signal.label}: ${path}`);
      categories.push(signal.category);
    }
  }
  for (const customTerm of input.customTerms || []) {
    const term = String(customTerm || '').trim();
    if (term.length < 2 || !text.toLocaleLowerCase().includes(term.toLocaleLowerCase())) continue;
    score += 24;
    matchedSignals += 1;
    reasons.push(`custom sensitive term: ${term.slice(0, 40)}`);
    categories.push('custom-sensitive');
  }

  const hasPublicHint = PUBLIC_HINTS.some((pattern) => paths.some((path) => matches(pattern, path)) || matches(pattern, text));
  if (hasPublicHint && !hardLocal) score = Math.max(0, score - 8);
  score = clamp(score, 0, 100);
  const risk = riskFor(score, hardLocal);
  const route: PrivacyRoute = hardLocal || score >= 50
    ? 'local-only'
    : score >= 18
      ? 'review'
      : 'remote-ok';
  const confidence = clamp(0.52 + matchedSignals * 0.09 + (hardLocal ? 0.18 : 0) - (matchedSignals === 0 ? 0.08 : 0), 0.45, 0.99);

  return {
    route,
    risk,
    score,
    confidence: Number(confidence.toFixed(2)),
    categories: unique(categories),
    reasons: unique(reasons).slice(0, 12),
    matchedSignals,
  };
}

export function isLocalProviderId(providerId: string): boolean {
  return providerId === 'local-demo' || providerId === 'ollama' || providerId === 'lmstudio';
}

export function privacyRouteLabel(route: PrivacyRoute, language: 'en' | 'zh-CN'): string {
  const labels: Record<PrivacyRoute, [string, string]> = {
    'remote-ok': ['Remote allowed', '可远程处理'],
    review: ['Review before remote', '远程前需确认'],
    'local-only': ['Local recommended', '建议仅本地'],
  };
  return language === 'zh-CN' ? labels[route][1] : labels[route][0];
}
