import { invoke } from '@tauri-apps/api/tauri';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type { AttachmentDraft, ChatMessage, ProviderProfile } from '../../app/types';
import { providerDefinition } from '../../app/providerRegistry';

export interface ProviderReply {
  ok: boolean;
  status: number;
  content?: string;
  model?: string;
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
}

export interface ProviderStreamEvent {
  streamId: string;
  kind: 'delta' | 'reasoning' | 'done' | 'error' | 'cancelled';
  text?: string;
  model?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface ProviderStreamCallbacks {
  onDelta: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onStatus?: (event: ProviderStreamEvent) => void;
}

interface ProviderRuntimeConfig {
  profileId: string;
  providerId: string;
  apiStyle: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  requiresCredential: boolean;
}

async function runtimeConfig(profile: ProviderProfile, timeoutMs: number): Promise<ProviderRuntimeConfig> {
  const definition = providerDefinition(profile.providerId);
  const apiKey = profile.apiKey.trim();
  return {
    profileId: profile.id,
    providerId: profile.providerId,
    apiStyle: profile.apiStyle,
    apiKey,
    model: profile.model.trim(),
    baseUrl: profile.baseUrl.trim(),
    timeoutMs,
    requiresCredential: definition.requiresCredential,
  };
}

function safeFailure(error: unknown): ProviderReply {
  const message = error instanceof Error ? error.message : String(error);
  const isDesktopRuntimeError = /__TAURI__|invoke|not a function|window/i.test(message);
  return {
    ok: false,
    status: 0,
    errorCode: isDesktopRuntimeError ? 'DESKTOP_RUNTIME_REQUIRED' : 'CLIENT_ERROR',
    errorMessage: isDesktopRuntimeError
      ? 'Provider requests must run inside the Chris Studio desktop app.'
      : 'The provider request could not be started.',
    latencyMs: 0,
  };
}

function missingCredential(profile: ProviderProfile): ProviderReply {
  return {
    ok: false,
    status: 0,
    errorCode: 'INVALID_CREDENTIAL',
    errorMessage: `No ${profile.displayName} API key is stored in the operating-system credential store.`,
    latencyMs: 0,
  };
}

export async function testProviderConnection(profile: ProviderProfile, timeoutMs: number): Promise<ProviderReply> {
  if (profile.providerId === 'local-demo') {
    return { ok: true, status: 200, content: 'Local sandbox ready', model: profile.model, latencyMs: 0 };
  }
  try {
    const resolved = await runtimeConfig(profile, timeoutMs);
    if (resolved.requiresCredential && !resolved.apiKey && !profile.credentialStored) return missingCredential(profile);
    return await invoke<ProviderReply>('provider_connection_test', { config: resolved });
  } catch (error) {
    return safeFailure(error);
  }
}

function providerMessages(
  profile: ProviderProfile,
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  attachments: AttachmentDraft[],
  includeVisionImages: boolean,
) {
  const definition = providerDefinition(profile.providerId);
  return messages.map(({ role, content }, index) => {
    const isLastUser = role === 'user' && index === messages.length - 1;
    const images = isLastUser && includeVisionImages && definition.capabilities.vision
      ? attachments.filter((attachment) => attachment.kind === 'image' && attachment.dataUrl)
      : [];
    if (!images.length) return { role, content };
    return {
      role,
      content: [
        { type: 'text', text: content },
        ...images.map((attachment) => ({ type: 'image_url', image_url: { url: attachment.dataUrl } })),
      ],
    };
  });
}

function providerRequest(config: ProviderRuntimeConfig, messages: ReturnType<typeof providerMessages>) {
  return {
    config,
    messages,
    maxTokens: 8192,
    temperature: 0.25,
  };
}

export async function sendProviderChat(
  profile: ProviderProfile,
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  timeoutMs: number,
  modelOverride?: string,
  attachments: AttachmentDraft[] = [],
  includeVisionImages = false,
): Promise<ProviderReply> {
  if (profile.providerId === 'local-demo') {
    return { ok: true, status: 200, content: 'Local sandbox response', model: profile.model, latencyMs: 0 };
  }
  try {
    const resolvedProfile = { ...profile, model: modelOverride || profile.model };
    const resolved = await runtimeConfig(resolvedProfile, timeoutMs);
    if (resolved.requiresCredential && !resolved.apiKey && !profile.credentialStored) return missingCredential(profile);
    return await invoke<ProviderReply>('provider_chat', {
      request: providerRequest(resolved, providerMessages(resolvedProfile, messages, attachments, includeVisionImages)),
    });
  } catch (error) {
    return safeFailure(error);
  }
}

export async function cancelProviderStream(streamId: string): Promise<void> {
  if (!streamId.trim()) return;
  try {
    await invoke<boolean>('provider_stream_cancel', { streamId });
  } catch {
    // The caller still stops rendering immediately if the desktop runtime is already closing.
  }
}

export async function sendProviderChatStream(
  profile: ProviderProfile,
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  timeoutMs: number,
  modelOverride: string | undefined,
  attachments: AttachmentDraft[],
  includeVisionImages: boolean,
  callbacks: ProviderStreamCallbacks,
  signal?: AbortSignal,
): Promise<ProviderReply> {
  if (profile.providerId === 'local-demo') {
    const content = 'Local sandbox response';
    callbacks.onDelta(content);
    return { ok: true, status: 200, content, model: profile.model, latencyMs: 0 };
  }

  const streamId = `provider_${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
  const startedAt = Date.now();
  let unlisten: UnlistenFn | undefined;
  let settled = false;
  let streamedContent = '';
  let resolvedModel = modelOverride || profile.model;
  let resolveCompletion: ((reply: ProviderReply) => void) | undefined;
  const completion = new Promise<ProviderReply>((resolve) => { resolveCompletion = resolve; });

  const finish = (reply: ProviderReply) => {
    if (settled) return;
    settled = true;
    resolveCompletion?.(reply);
  };

  const cancelledReply = (): ProviderReply => ({
    ok: false,
    status: 0,
    errorCode: 'CANCELLED',
    errorMessage: 'The provider stream was stopped by the user.',
    latencyMs: Date.now() - startedAt,
  });

  const abort = () => {
    if (settled) return;
    void cancelProviderStream(streamId);
    finish(cancelledReply());
  };

  try {
    const resolvedProfile = { ...profile, model: modelOverride || profile.model };
    const resolved = await runtimeConfig(resolvedProfile, timeoutMs);
    if (resolved.requiresCredential && !resolved.apiKey && !profile.credentialStored) return missingCredential(profile);
    if (signal?.aborted) return cancelledReply();

    unlisten = await listen<ProviderStreamEvent>('chris-studio://provider-stream', ({ payload }) => {
      if (!payload || payload.streamId !== streamId || settled) return;
      callbacks.onStatus?.(payload);
      if (payload.model) resolvedModel = payload.model;

      if (payload.kind === 'delta' && payload.text) {
        streamedContent += payload.text;
        callbacks.onDelta(payload.text);
        return;
      }
      if (payload.kind === 'reasoning' && payload.text) {
        callbacks.onReasoning?.(payload.text);
        return;
      }
      if (payload.kind === 'done') {
        finish({
          ok: true,
          status: 200,
          content: streamedContent,
          model: resolvedModel,
          latencyMs: Date.now() - startedAt,
        });
        return;
      }
      if (payload.kind === 'cancelled') {
        finish(cancelledReply());
        return;
      }
      if (payload.kind === 'error') {
        const code = payload.errorCode || 'PROVIDER_STREAM_ERROR';
        // A few OpenAI-compatible gateways deliver the full assistant body and
        // then close the chunked connection without a clean terminal frame.
        // The Rust worker already salvages this case, but keep the renderer
        // defensive so a complete visible answer is never converted into a
        // red failure card by a late STREAM_READ_ERROR event.
        if (code === 'STREAM_READ_ERROR' && streamedContent.trim()) {
          callbacks.onStatus?.({ ...payload, kind: 'done', errorCode: undefined, errorMessage: undefined });
          finish({
            ok: true,
            status: 200,
            content: streamedContent,
            model: resolvedModel,
            latencyMs: Date.now() - startedAt,
          });
          return;
        }
        finish({
          ok: false,
          status: 0,
          content: streamedContent || undefined,
          model: resolvedModel,
          errorCode: code,
          errorMessage: payload.errorMessage || 'The provider stream failed.',
          latencyMs: Date.now() - startedAt,
        });
      }
    });

    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) {
      abort();
      return await completion;
    }

    try {
      const started = await invoke<boolean>('provider_chat_stream', {
        streamId,
        request: providerRequest(resolved, providerMessages(resolvedProfile, messages, attachments, includeVisionImages)),
      });
      if (!started) {
        finish({
          ok: false,
          status: 0,
          errorCode: 'STREAM_START_FAILED',
          errorMessage: 'The provider streaming worker did not start.',
          latencyMs: Date.now() - startedAt,
        });
      }
      // An abort can race with the short start command. Re-send cancellation
      // after the worker exists so it cannot continue silently in the background.
      if (settled && signal?.aborted) void cancelProviderStream(streamId);
    } catch (error) {
      finish(safeFailure(error));
    }

    return await completion;
  } catch (error) {
    return safeFailure(error);
  } finally {
    signal?.removeEventListener('abort', abort);
    unlisten?.();
  }
}
