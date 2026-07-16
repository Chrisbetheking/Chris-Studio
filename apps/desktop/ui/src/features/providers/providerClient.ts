import { invoke } from '@tauri-apps/api/tauri';
import type { ChatMessage, ProviderProfile } from '../../app/types';
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
      ? 'Provider requests must run inside the TokenFence desktop app.'
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
    // A securely saved profile intentionally has an empty in-memory apiKey.
    // Only block when neither a typed key nor the persisted credential marker exists;
    // otherwise let the native backend hydrate the secret from Keychain/Credential Manager.
    if (resolved.requiresCredential && !resolved.apiKey && !profile.credentialStored) {
      return missingCredential(profile);
    }
    return await invoke<ProviderReply>('provider_connection_test', { config: resolved });
  } catch (error) {
    return safeFailure(error);
  }
}

export async function sendProviderChat(
  profile: ProviderProfile,
  messages: Pick<ChatMessage, 'role' | 'content'>[],
  timeoutMs: number,
  modelOverride?: string,
): Promise<ProviderReply> {
  if (profile.providerId === 'local-demo') {
    return { ok: true, status: 200, content: 'Local sandbox response', model: profile.model, latencyMs: 0 };
  }
  try {
    const resolved = await runtimeConfig({ ...profile, model: modelOverride || profile.model }, timeoutMs);
    // Do not reject secure profiles in the WebView just because the key is absent
    // from React state. The Rust command resolves it from the OS credential store.
    if (resolved.requiresCredential && !resolved.apiKey && !profile.credentialStored) {
      return missingCredential(profile);
    }
    return await invoke<ProviderReply>('provider_chat', {
      request: {
        config: resolved,
        messages: messages.map(({ role, content }) => ({ role, content })),
        maxTokens: 3072,
        temperature: 0.25,
      },
    });
  } catch (error) {
    return safeFailure(error);
  }
}
