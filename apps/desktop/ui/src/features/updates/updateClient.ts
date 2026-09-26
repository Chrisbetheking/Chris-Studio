import { invoke } from '@tauri-apps/api/tauri';
import type { UpdateInfo } from '../../app/types';
import { PRODUCT_VERSION } from '../../app/productVersion';
import { isDesktopRuntime } from '../platform/desktopClient';

export async function checkForUpdates(owner: string, repo: string): Promise<UpdateInfo> {
  if (!isDesktopRuntime()) {
    return {
      ok: false,
      // Was a stale `2.1.0` literal, so the update screen reported the wrong
      // installed version for a 2.4.0-alpha.2 build.
      currentVersion: PRODUCT_VERSION,
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
      currentVersion: PRODUCT_VERSION,
      updateAvailable: false,
      assets: [],
      errorMessage: error instanceof Error ? error.message : 'The update request could not be completed.',
    };
  }
}

/**
 * Open a link in the user's browser or the OS handler.
 *
 * The callers are fire-and-forget (`void openExternal(...)`), so a rejected
 * native invocation used to surface as an unhandled rejection with no feedback:
 * the button did nothing visible. A browser-preview pop-up can also be blocked,
 * which is reported the same way rather than silently ignored.
 */
export async function openExternal(url: string): Promise<void> {
  const link = String(url ?? '').trim();
  if (!link) return;
  if (!isDesktopRuntime()) {
    try {
      window.open(link, '_blank', 'noopener,noreferrer');
    } catch {
      // A blocked pop-up is outside this module's control.
    }
    return;
  }
  try {
    await invoke('open_external_url', { url: link });
  } catch {
    // The desktop handler can refuse a URL; there is nothing to report to a
    // fire-and-forget caller, so the rejection is contained here.
  }
}
