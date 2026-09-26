import { DEFAULT_SETTINGS, loadSettings } from '../../app/store';
import { optimizeText } from './optimizer';

export type CompactionMode = 'off' | 'conservative' | 'balanced';

export const COMPACTION_MODES: readonly CompactionMode[] = ['off', 'conservative', 'balanced'];

/**
 * Content that must never be rewritten by the compactor.
 *
 * These payloads are machine-readable rather than prose: the attachment context
 * block embeds extracted file text (where indentation is semantic), and the
 * tool-observation and repair messages are part of the agent protocol, so a
 * whitespace rewrite would change their meaning.
 */
const MACHINE_PAYLOAD_MARKERS = [
  'User-approved local attachment context:',
  '{"type":"tool_observation"',
  'Your previous response was not a valid',
];

/**
 * Resolve the configured context-compaction mode.
 *
 * The settings screen promises "Compact repeated context before billing starts"
 * and offers Off / Conservative / Balanced, but `optimizeText` had no product
 * caller at all: the control changed nothing about what was sent. The value is
 * read per request so a change applies to the next send, and an unusable value
 * falls back to the documented default instead of silently disabling the
 * feature the user configured.
 */
export function compactionMode(): CompactionMode {
  try {
    const configured = loadSettings().tokenOptimizationMode;
    if (configured === 'off' || configured === 'conservative' || configured === 'balanced') return configured;
  } catch {
    // Settings must never block a send.
  }
  return DEFAULT_SETTINGS.tokenOptimizationMode;
}

/**
 * Decide whether one provider message may be compacted.
 *
 * The final message is the current turn: it has just been reviewed and redacted,
 * and rewriting it afterwards would change the payload the user approved. System
 * prompts are instructions rather than context, and machine payloads are excluded
 * by `MACHINE_PAYLOAD_MARKERS`.
 */
export function isCompactionCandidate(
  role: string,
  content: string,
  index: number,
  total: number,
): boolean {
  if (role !== 'user' && role !== 'assistant') return false;
  if (index === total - 1) return false;
  const trimmed = content.replace(/^\s+/, '');
  return !MACHINE_PAYLOAD_MARKERS.some((marker) => trimmed.startsWith(marker));
}

/**
 * Compact the re-sent conversation history that reaches a provider.
 *
 * Only prose turns in the history are rewritten; everything else (system prompt,
 * attachment context, tool observations, the current turn) is passed through
 * verbatim. `optimizeText` additionally leaves fenced code blocks untouched.
 */
export function compactProviderMessages(
  messages: readonly { role: string; content: string }[],
  mode: CompactionMode = compactionMode(),
): { role: string; content: string }[] {
  if (!Array.isArray(messages)) return [];
  const total = messages.length;
  return messages.map((message, index) => {
    if (!message || typeof message.content !== 'string') {
      return { role: message?.role ?? 'user', content: '' };
    }
    if (mode === 'off' || !isCompactionCandidate(message.role, message.content, index, total)) {
      return { role: message.role, content: message.content };
    }
    return { role: message.role, content: optimizeText(message.content, mode).optimizedText };
  });
}
