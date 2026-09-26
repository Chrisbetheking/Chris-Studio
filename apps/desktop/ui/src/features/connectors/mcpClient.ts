import { invoke } from '@tauri-apps/api/tauri';
import type { McpReply, ToolConnectorProfile } from '../../app/types';
import { isDesktopRuntime } from '../platform/desktopClient';

interface SecretReply {
  ok: boolean;
  hasValue: boolean;
  errorMessage?: string;
}

export async function saveConnectorSecret(id: string, secret: string): Promise<SecretReply> {
  if (!isDesktopRuntime()) return { ok: false, hasValue: false, errorMessage: 'Desktop runtime required.' };
  return await invoke<SecretReply>('mcp_connector_secret_save', { profileId: id, secret });
}

export async function deleteConnectorSecret(id: string): Promise<SecretReply> {
  if (!isDesktopRuntime()) return { ok: true, hasValue: false };
  return await invoke<SecretReply>('mcp_connector_secret_delete', { profileId: id });
}

export async function callMcp(
  profile: ToolConnectorProfile,
  method: 'initialize' | 'tools/list' | 'resources/list' | 'prompts/list' | 'tools/call',
  params: unknown,
  confirmed = false,
): Promise<McpReply> {
  if (!isDesktopRuntime()) return { ok: false, status: 0, errorCode: 'DESKTOP_REQUIRED', errorMessage: 'Desktop runtime required.', latencyMs: 0 };
  return await invoke<McpReply>('mcp_request', {
    request: {
      profileId: profile.id,
      url: profile.url,
      token: profile.token,
      requiresCredential: profile.requiresCredential,
      method,
      params,
      confirmed,
    },
  });
}
