import { invoke } from '@tauri-apps/api/tauri';
import type { ComputerCapability } from '../../app/types';

export interface PlatformInfo {
  appVersion: string;
  os: string;
  arch: string;
  secureStore: string;
  desktopRuntime: boolean;
}

interface SecretReply {
  ok: boolean;
  hasValue: boolean;
  value?: string;
  errorMessage?: string;
}

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export async function getPlatformInfo(): Promise<PlatformInfo> {
  if (!isDesktopRuntime()) {
    return {
      appVersion: '2.1.0-web-preview',
      os: navigator.platform || 'browser',
      arch: 'browser',
      secureStore: 'Desktop runtime required',
      desktopRuntime: false,
    };
  }

  try {
    return await invoke<PlatformInfo>('platform_info');
  } catch {
    return {
      appVersion: '2.1.0',
      os: 'unknown',
      arch: 'unknown',
      secureStore: 'Unavailable',
      desktopRuntime: true,
    };
  }
}

export async function loadProviderSecret(profileId: string): Promise<string> {
  if (!isDesktopRuntime()) return '';
  try {
    const result = await invoke<SecretReply>('provider_secret_load', { profileId });
    return result.ok && result.hasValue ? result.value ?? '' : '';
  } catch {
    return '';
  }
}

export async function saveProviderSecret(profileId: string, secret: string): Promise<{ ok: boolean; message?: string }> {
  if (!isDesktopRuntime()) {
    return { ok: false, message: 'The operating-system credential store is only available in the desktop app.' };
  }
  try {
    const result = await invoke<SecretReply>('provider_secret_save', { profileId, secret });
    return { ok: result.ok, message: result.errorMessage };
  } catch {
    return { ok: false, message: 'The operating-system credential store could not be opened.' };
  }
}

export async function deleteProviderSecret(profileId: string): Promise<{ ok: boolean; message?: string }> {
  if (!isDesktopRuntime()) return { ok: true };
  try {
    const result = await invoke<SecretReply>('provider_secret_delete', { profileId });
    return { ok: result.ok, message: result.errorMessage };
  } catch {
    return { ok: false, message: 'The operating-system credential store could not be opened.' };
  }
}

export async function getComputerCapabilities(): Promise<ComputerCapability[]> {
  if (!isDesktopRuntime()) {
    return [
      { id: 'screen-capture', available: false, permissionRequired: true, status: 'planned', message: 'Desktop runtime required.' },
      { id: 'open-url', available: false, permissionRequired: false, status: 'planned', message: 'Desktop runtime required.' },
      { id: 'keyboard', available: false, permissionRequired: true, status: 'planned', message: 'Desktop runtime required.' },
      { id: 'pointer', available: false, permissionRequired: true, status: 'planned', message: 'Desktop runtime required.' },
      { id: 'project-files', available: false, permissionRequired: true, status: 'planned', message: 'Desktop runtime required.' },
      { id: 'terminal', available: false, permissionRequired: true, status: 'planned', message: 'Desktop runtime required.' },
    ];
  }
  try {
    return await invoke<ComputerCapability[]>('computer_capabilities');
  } catch {
    return [];
  }
}
