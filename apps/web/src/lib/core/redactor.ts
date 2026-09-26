import type { Detection } from "../types";

export function redactText(input: string, detections: Detection[]) {
  const counters: Record<string, number> = {};
  const mapping: Record<string, string> = {};
  let cursor = 0;
  let output = "";

  for (const item of detections) {
    if (item.start < cursor) continue;

    counters[item.kind] = (counters[item.kind] || 0) + 1;
    const token = `[${item.kind.toUpperCase()}_${counters[item.kind]}]`;

    output += input.slice(cursor, item.start);
    output += token;
    mapping[token] = item.value;
    cursor = item.end;
  }

  output += input.slice(cursor);
  return { text: output, mapping };
}
