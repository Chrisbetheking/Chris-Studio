import { invoke } from '@tauri-apps/api/tauri';
import type { ChatMessage, ProviderConfig } from '../../app/types';

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
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
}

function runtimeConfig(config: ProviderConfig, timeoutMs: number): ProviderRuntimeConfig {
  return {
    apiKey: config.apiKey.trim(),
    model: config.model.trim(),
    baseUrl: config.baseUrl.trim(),
    timeoutMs,
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

export async function testDeepSeekConnection(
  config: ProviderConfig,
  timeoutMs: number,
): Promise<ProviderReply> {
  try {
    return await invoke<ProviderReply>('provider_connection_test', {
      config: runtimeConfig(config, timeoutMs),
    });
  } catch (error) {
    return safeFailure(error);
  }
}

export async function sendDeepSeekChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  timeoutMs: number,
): Promise<ProviderReply> {
  try {
    return await invoke<ProviderReply>('provider_chat', {
      request: {
        config: runtimeConfig(config, timeoutMs),
        messages: messages.map(({ role, content }) => ({ role, content })),
        maxTokens: 2048,
        temperature: 0.3,
      },
    });
  } catch (error) {
    return safeFailure(error);
  }
}
