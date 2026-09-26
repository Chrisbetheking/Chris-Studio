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
const ACTION_IDS: ReadonlySet<string> = new Set(['capture', 'open', 'click', 'type', 'key', 'done', 'ask']);
const MAX_COORDINATE = 16_384;

/**
 * Parse the JSON object out of one model reply.
 *
 * The reply is untrusted text, so a non-string payload must fail with the same
 * actionable message as a malformed one instead of a `TypeError` from
 * `value.match is not a function`.
 */
function extractJsonObject(value: unknown): unknown {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('The model did not return a valid Computer Use action.');
  }
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

/**
 * Read one click coordinate.
 *
 * Only a genuine number, or a string that parses as one, may become a
 * coordinate. `Number(value)` used to accept `null`, `''`, `[]` and `true` as
 * `0`/`1`, so a reply that omitted its coordinates became a click at the
 * top-left corner of the screen — the approval prompt then showed a plausible
 * coordinate instead of reporting the malformed action.
 */
function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function parseModelComputerAction(content: string, visionAvailable: boolean): ModelComputerAction {
  const raw = extractJsonObject(content) as Record<string, unknown>;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('The model did not return a valid Computer Use action.');
  }
  const action = stringValue(raw.action);
  if (!action || !ACTION_IDS.has(action)) {
    throw new Error('The model selected an unsupported Computer Use action.');
  }
  const result: ModelComputerAction = {
    action: action as ModelComputerActionId,
    reason: stringValue(raw.reason) || 'Model-selected next step.',
    app: stringValue(raw.app),
    x: numberValue(raw.x),
    y: numberValue(raw.y),
    text: stringValue(raw.text),
    key: stringValue(raw.key)?.toLowerCase(),
    message: stringValue(raw.message),
  };

  // An application may only be named from the allowlist, for every action that
  // can carry one. Checking `open` alone let a `type` or `key` action target an
  // arbitrary application.
  if (result.app !== undefined && !ALLOWED_APPS.has(result.app)) {
    throw new Error('The model requested an application outside the allowlist.');
  }
  if (action === 'open' && !result.app) {
    throw new Error('The model requested an application outside the allowlist.');
  }
  if (action === 'capture' && !visionAvailable) {
    throw new Error('Screen capture is not useful to a model that cannot receive images. Choose an open, type, key, ask or done action instead.');
  }
  if (action === 'click') {
    if (!visionAvailable) throw new Error('Coordinate clicking requires a vision-capable model.');
    if (
      result.x === undefined || result.y === undefined
      || result.x < 0 || result.y < 0
      || result.x > MAX_COORDINATE || result.y > MAX_COORDINATE
    ) {
      throw new Error('The model returned invalid click coordinates.');
    }
  }
  if (action === 'type' && !result.text) throw new Error('The model returned an empty typing action.');
  if (action === 'key' && (!result.key || !ALLOWED_KEYS.has(result.key))) {
    throw new Error('The model requested a key outside the allowlist.');
  }
  return result;
}
