import type { Detection } from "../types";

const patterns: Array<{
  kind: string;
  label: string;
  severity: Detection["severity"];
  regex: RegExp;
}> = [
  {
    kind: "private_key",
    label: "Private key block",
    severity: "critical",
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PRIVATE )?PRIVATE KEY-----[\s\S]+?-----END (?:RSA |EC |OPENSSH |DSA |PRIVATE )?PRIVATE KEY-----/g
  },
  {
    kind: "github_token",
    label: "GitHub token",
    severity: "critical",
    regex: /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g
  },
  {
    kind: "openai_key",
    label: "OpenAI-style API key",
    severity: "critical",
    regex: /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{20,}\b/g
  },
  {
    kind: "google_api_key",
    label: "Google API key",
    severity: "critical",
    regex: /\bAIza[0-9A-Za-z_-]{20,}\b/g
  },
  {
    kind: "anthropic_key",
    label: "Anthropic API key",
    severity: "critical",
    regex: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g
  },
  {
    kind: "aws_access_key",
    label: "AWS access key id",
    severity: "high",
    regex: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g
  },
  {
    kind: "stripe_key",
    label: "Stripe API key",
    severity: "critical",
    regex: /\b(?:sk|pk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g
  },
  {
    kind: "slack_token",
    label: "Slack token",
    severity: "critical",
    regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g
  },
  {
    kind: "vercel_token",
    label: "Vercel token",
    severity: "critical",
    regex: /\bvercel_[A-Za-z0-9]{24,}\b/g
  },
  {
    kind: "generic_secret",
    label: "Secret assignment",
    severity: "high",
    regex: /\b(?:api[_-]?key|secret|client[_-]?secret|access[_-]?token|auth[_-]?token|bearer[_-]?token|password|passwd|private[_-]?key)\s*[:=]\s*["']?[^\s"']{12,}/gi
  },
  {
    kind: "database_url",
    label: "Database URL",
    severity: "critical",
    regex: /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'`]+/gi
  },
  {
    kind: "jwt",
    label: "JWT",
    severity: "high",
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
  },
  {
    kind: "email",
    label: "Email",
    severity: "medium",
    regex: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
  },
  {
    kind: "phone_cn",
    label: "CN mobile number",
    severity: "medium",
    regex: /(?<!\d)(?:\+?86[-\s]?)?1[3-9]\d{9}(?!\d)/g
  },
  {
    kind: "phone_global",
    label: "Phone number",
    severity: "medium",
    regex: /(?<!\d)(?:\+\d{1,3}[\s-]?)?(?:\d[\s-]?){8,14}\d(?!\d)/g
  },
  {
    kind: "id_cn",
    label: "CN ID number",
    severity: "high",
    regex: /(?<!\d)[1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[0-9Xx](?!\d)/g
  },
  {
    kind: "bank_card",
    label: "Bank card-like number",
    severity: "high",
    regex: /(?<!\d)(?:\d[ -]?){15,19}(?!\d)/g
  },
  {
    kind: "internal_url",
    label: "Internal URL or host",
    severity: "medium",
    regex: /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[^\s/]+\.(?:internal|corp|local))[^\s"'`]*/gi
  }
];

const labelledPatterns: Array<{
  kind: string;
  label: string;
  severity: Detection["severity"];
  regex: RegExp;
}> = [
  {
    kind: "name_cn",
    label: "Chinese name after label",
    severity: "medium",
    regex: /(?:姓名|名字|联系人|客户姓名|负责人|用户)\s*[:：]\s*([\u4e00-\u9fa5·]{2,8})(?=\s|,|，|。|；|;|\n|$)/g
  },
  {
    kind: "id_label",
    label: "ID number after label",
    severity: "high",
    regex: /(?:身份证号?|证件号|护照号|学号|工号)\s*[:：]\s*([A-Za-z0-9_-]{5,30})/g
  },
  {
    kind: "phone_label",
    label: "Phone number after label",
    severity: "medium",
    regex: /(?:手机号|手机|电话|联系电话|联系方式)\s*[:：]\s*([+\d][\d\s-]{5,22})/g
  },
  {
    kind: "address_cn",
    label: "Address after label",
    severity: "medium",
    regex: /(?:地址|住址|家庭住址|公司地址)\s*[:：]\s*([^\n，,。；;]{4,70})/g
  },
  {
    kind: "company_cn",
    label: "Company or client after label",
    severity: "medium",
    regex: /(?:公司|客户|甲方|乙方|项目代号)\s*[:：]\s*([^\n，,。；;]{2,40})/g
  },
  {
    kind: "amount_cn",
    label: "Money amount after label",
    severity: "medium",
    regex: /(?:合同金额|报价|预算|工资|薪资|收入)\s*[:：]\s*([¥￥$]?\s*[\d,.]+\s*(?:元|人民币|RMB|USD|美元|万)?)/gi
  }
];

export function scanText(input: string): Detection[] {
  const hits: Detection[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      const value = match[0];
      if (!value || isLikelyNoise(pattern.kind, value)) continue;
      hits.push({
        kind: pattern.kind,
        label: pattern.label,
        value,
        start: match.index,
        end: match.index + value.length,
        severity: pattern.severity
      });
    }
  }

  for (const pattern of labelledPatterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match: RegExpExecArray | null;

    while ((match = regex.exec(input)) !== null) {
      const value = match[1]?.trim();
      if (!value) continue;
      const start = match.index + match[0].indexOf(value);
      hits.push({
        kind: pattern.kind,
        label: pattern.label,
        value,
        start,
        end: start + value.length,
        severity: pattern.severity
      });
    }
  }

  return mergeOverlaps(hits).sort((a, b) => a.start - b.start);
}

function isLikelyNoise(kind: string, value: string) {
  if (kind === "phone_global") {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 16) return true;
    if (/^0+$|^1+$|^123456789/.test(digits)) return true;
    // Do not flag obvious dates or small ids unless the user wrote a label.
    if (/^(19|20)\d{6,12}$/.test(digits) && digits.length <= 12) return true;
  }
  if (kind === "bank_card") {
    const digits = value.replace(/\D/g, "");
    if (digits.length < 15) return true;
  }
  return false;
}

function mergeOverlaps(items: Detection[]): Detection[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: Detection[] = [];

  for (const item of sorted) {
    const last = kept[kept.length - 1];
    if (!last || item.start >= last.end) {
      kept.push(item);
      continue;
    }

    if (rank(item.severity) > rank(last.severity) || item.end - item.start > last.end - last.start) {
      kept[kept.length - 1] = item;
    }
  }

  return kept;
}

function rank(severity: Detection["severity"]): number {
  return { low: 1, medium: 2, high: 3, critical: 4 }[severity];
}
