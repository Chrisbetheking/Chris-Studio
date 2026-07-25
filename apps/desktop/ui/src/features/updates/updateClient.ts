import { invoke } from '@tauri-apps/api/tauri';
import type { UpdateInfo } from '../../app/types';
import { isDesktopRuntime } from '../platform/desktopClient';

export async function checkForUpdates(owner: string, repo: string): Promise<UpdateInfo> {
  if (!isDesktopRuntime()) {
    return {
      ok: false,
      currentVersion: '2.1.0',
      updateAvailable: false,
      assets: [],
      errorMessage: 'Update checks run inside the desktop app.',
    };
  }
  try {
    return await invoke<UpdateInfo>('github_release_check', { owner, repo });
  } catch (error) {
    return {
      ok: false,
      currentVersion: '2.1.0',
      updateAvailable: false,
      assets: [],
      errorMessage: error instanceof Error ? error.message : 'The update request could not be completed.',
    };
  }
}

export async function openExternal(url: string): Promise<void> {
  if (!isDesktopRuntime()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await invoke('open_external_url', { url });
}
