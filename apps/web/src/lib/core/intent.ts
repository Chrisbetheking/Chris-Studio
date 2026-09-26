import type { IntentReport } from "../types";

const zhWeatherWords = ["天气", "湿度", "温度", "气温", "降雨", "下雨", "雨", "风速", "体感", "今日", "今天", "明天"];
const enWeatherWords = ["weather", "humidity", "temperature", "rain", "forecast", "wind", "today", "tomorrow"];

const knownPlaces: Record<string, string> = {
  "吉隆坡": "Kuala Lumpur",
  "kuala lumpur": "Kuala Lumpur",
  "kl": "Kuala Lumpur",
  "北京": "Beijing",
  "上海": "Shanghai",
  "广州": "Guangzhou",
  "深圳": "Shenzhen",
  "杭州": "Hangzhou",
  "成都": "Chengdu",
  "纽约": "New York",
  "伦敦": "London",
  "东京": "Tokyo",
  "新加坡": "Singapore",
  "香港": "Hong Kong",
  "台北": "Taipei"
};

export function analyzeIntent(input: string): IntentReport {
  const text = input.trim();
  const lower = text.toLowerCase();
  const language = detectLanguage(text);
  const hints: string[] = [];
  const entities: Record<string, string> = {};

  const weatherScore = scoreKeywords(lower, enWeatherWords) + scoreKeywords(text, zhWeatherWords);
  if (weatherScore > 0) {
    entities.location = extractLocation(text) || "";
    hints.push("Needs fresh weather data. Do not answer from model memory only.");
    return {
      intent: "weather",
      confidence: Math.min(0.98, 0.55 + weatherScore * 0.12),
      language,
      needsRealtime: true,
      needsFiles: false,
      sensitiveByNature: false,
      query: text,
      entities,
      hints
    };
  }

  if (/简历|resume|cv|cover letter|求职|面试/i.test(text)) {
    return base("resume", 0.78, language, text, { sensitiveByNature: true, hints: ["Resume tasks often contain personal data. Keep redaction careful and reversible."] });
  }

  if (/泄露|脱敏|敏感|隐私|api key|secret|token|密码|身份证|手机号|邮箱|privacy|redact|leak/i.test(text)) {
    return base("privacy_check", 0.82, language, text, { sensitiveByNature: true, hints: ["User is asking about privacy or secrets."] });
  }

  if (/```|function |class |const |let |var |报错|异常|stack|error|bug|代码|接口|数据库|sql|next\.js|react|typescript|python/i.test(text)) {
    return base("code", 0.74, language, text, { needsFiles: /文件|项目|repo|repository|codebase|目录/i.test(text), hints: ["Preserve code symbols and error lines during compression."] });
  }

  if (/总结|摘要|summari[sz]e|提炼|归纳/i.test(text)) {
    return base("summarize", 0.72, language, text, { hints: ["Keep decisions, numbers, owners, deadlines and quoted requirements."] });
  }

  if (/翻译|translate|中译英|英译中/i.test(text)) {
    return base("translate", 0.72, language, text, { hints: ["Do not compress away tone or formatting before translation."] });
  }

  if (/计划|方案|roadmap|todo|待办|拆解|排期|plan/i.test(text)) {
    return base("plan", 0.68, language, text, { hints: ["Preserve goal, constraints, timeline and deliverables."] });
  }

  return base("chat", 0.45, language, text, { hints: ["General chat. Keep the user's wording and intent intact."] });
}

function base(
  intent: IntentReport["intent"],
  confidence: number,
  language: IntentReport["language"],
  query: string,
  extra: Partial<IntentReport> = {}
): IntentReport {
  return {
    intent,
    confidence,
    language,
    needsRealtime: false,
    needsFiles: false,
    sensitiveByNature: false,
    query,
    entities: {},
    hints: [],
    ...extra
  };
}

function detectLanguage(text: string): IntentReport["language"] {
  const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  if (cjk && latin) return "mixed";
  if (cjk) return "zh";
  return "en";
}

function scoreKeywords(text: string, words: string[]) {
  return words.reduce((sum, word) => sum + (text.includes(word.toLowerCase ? word.toLowerCase() : word) ? 1 : 0), 0);
}

function extractLocation(text: string) {
  const lower = text.toLowerCase();
  for (const [key, value] of Object.entries(knownPlaces)) {
    if (lower.includes(key.toLowerCase())) return value;
  }

  const afterIn = text.match(/(?:in|for|at)\s+([A-Za-z][A-Za-z\s.-]{2,40})(?:\?|,|，|。|$)/i)?.[1]?.trim();
  if (afterIn) return afterIn;

  const beforeWeather = text.match(/([\u4e00-\u9fa5A-Za-z\s.-]{2,30})(?:今天|今日|明天)?(?:的)?(?:天气|湿度|温度|气温|降雨|weather|humidity|temperature)/i)?.[1]?.trim();
  if (beforeWeather) return knownPlaces[beforeWeather.toLowerCase()] || beforeWeather;

  return "";
}
