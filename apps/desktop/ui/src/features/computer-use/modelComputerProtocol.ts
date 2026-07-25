export type ModelComputerActionId = 'capture' | 'open' | 'click' | 'type' | 'key' | 'done' | 'ask';

export interface ModelComputerAction {
  action: ModelComputerActionId;
  reason: string;
  app?: string;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  message?: string;
}

export interface ModelComputerObservation {
  action: ModelComputerActionId;
  ok: boolean;
  detail: string;
  target?: string;
}

const ALLOWED_APPS = new Set(['TextEdit', 'Notes', 'Safari', 'Finder', 'Terminal', 'System Settings']);
const ALLOWED_KEYS = new Set(['enter', 'escape', 'tab', 'space', 'delete', 'cmd+n', 'cmd+s', 'cmd+l', 'cmd+w']);

function extractJsonObject(value: string): unknown {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
  const candidate = fenced || value.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error('The model did not return a valid Computer Use action.');
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseModelComputerAction(content: string, visionAvailable: boolean): ModelComputerAction {
  const raw = extractJsonObject(content) as Record<string, unknown>;
  const action = stringValue(raw.action) as ModelComputerActionId | undefined;
  if (!action || !['capture', 'open', 'click', 'type', 'key', 'done', 'ask'].includes(action)) {
    throw new Error('The model selected an unsupported Computer Use action.');
  }
  const result: ModelComputerAction = {
    action,
    reason: stringValue(raw.reason) || 'Model-selected next step.',
    app: stringValue(raw.app),
    x: numberValue(raw.x),
    y: numberValue(raw.y),
    text: stringValue(raw.text),
    key: stringValue(raw.key)?.toLowerCase(),
    message: stringValue(raw.message),
  };

  if (action === 'open' && (!result.app || !ALLOWED_APPS.has(result.app))) {
    throw new Error('The model requested an application outside the allowlist.');
  }
  if (action === 'capture' && !visionAvailable) {
    throw new Error('Screen capture is not useful to a model that cannot receive images. Choose an open, type, key, ask or done action instead.');
  }
  if (action === 'click') {
    if (!visionAvailable) throw new Error('Coordinate clicking requires a vision-capable model.');
    if (result.x === undefined || result.y === undefined || result.x < 0 || result.y < 0 || result.x > 16384 || result.y > 16384) {
      throw new Error('The model returned invalid click coordinates.');
    }
  }
  if (action === 'type' && !result.text) throw new Error('The model returned an empty typing action.');
  if (action === 'key' && (!result.key || !ALLOWED_KEYS.has(result.key))) {
    throw new Error('The model requested a key outside the allowlist.');
  }
  return result;
}
