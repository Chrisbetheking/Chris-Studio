/**
 * Bounded conversation context window for the Unified Agent Runtime.
 *
 * The workspace exposes a user setting (`conversationContextLimit`, 2–100) that
 * controls how many trailing messages are sent to a provider. Keeping the
 * normalization here makes the contract testable and guarantees the value can
 * never collapse to zero or grow unbounded even if stored settings are corrupted.
 */

export const DEFAULT_CONTEXT_MESSAGE_LIMIT = 24;
export const MIN_CONTEXT_MESSAGE_LIMIT = 2;
export const MAX_CONTEXT_MESSAGE_LIMIT = 100;

/** Clamp a stored/boundary value into the supported range, falling back to the default. */
export function normalizeContextLimit(value: number | undefined | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CONTEXT_MESSAGE_LIMIT;
  const rounded = Math.floor(value);
  if (rounded < MIN_CONTEXT_MESSAGE_LIMIT) return MIN_CONTEXT_MESSAGE_LIMIT;
  if (rounded > MAX_CONTEXT_MESSAGE_LIMIT) return MAX_CONTEXT_MESSAGE_LIMIT;
  return rounded;
}

/**
 * Return the trailing provider-ready history for one conversation.
 *
 * System messages and empty content are dropped first so a burst of blank
 * assistant placeholders cannot crowd out real context, and the user limit is
 * applied after filtering.
 */
export function limitConversationHistory<T extends { role: string; content: string }>(
  messages: readonly T[],
  limit?: number,
): Pick<T, 'role' | 'content'>[] {
  const bounded = normalizeContextLimit(limit);
  return messages
    .filter((message) => message.role !== 'system' && message.content.trim())
    .slice(-bounded)
    .map((message) => ({ role: message.role, content: message.content }));
}
