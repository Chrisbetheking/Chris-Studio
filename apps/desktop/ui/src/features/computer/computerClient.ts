import { invoke } from '@tauri-apps/api/tauri';
import type { ComputerActionResult } from '../../app/types';
import { isDesktopRuntime } from '../platform/desktopClient';

function unavailable(action: string): ComputerActionResult {
  return { ok: false, action, message: 'Desktop runtime required.', timestamp: new Date().toISOString() };
}

export async function captureScreen(confirmed: boolean): Promise<ComputerActionResult> {
  if (!isDesktopRuntime()) return unavailable('screen-capture');
  return await invoke<ComputerActionResult>('computer_capture_screen', { confirmed });
}

export async function clickPointer(x: number, y: number, confirmed: boolean): Promise<ComputerActionResult> {
  if (!isDesktopRuntime()) return unavailable('pointer-click');
  return await invoke<ComputerActionResult>('computer_click', { x, y, confirmed });
}

export async function typeText(text: string, confirmed: boolean, app?: string): Promise<ComputerActionResult> {
  if (!isDesktopRuntime()) return unavailable('keyboard-type');
  return await invoke<ComputerActionResult>('computer_type_text', { text, confirmed, app: app || null });
}

export async function pressKey(key: string, confirmed: boolean, app?: string): Promise<ComputerActionResult> {
  if (!isDesktopRuntime()) return unavailable('keyboard-key');
  return await invoke<ComputerActionResult>('computer_press_key', { key, confirmed, app: app || null });
}

export async function openApplication(app: string, confirmed: boolean): Promise<ComputerActionResult> {
  if (!isDesktopRuntime()) return unavailable('open-application');
  return await invoke<ComputerActionResult>('computer_open_application', { app, confirmed });
}

export async function requestComputerPermissions(): Promise<ComputerActionResult> {
  if (!isDesktopRuntime()) return unavailable('request-permissions');
  return await invoke<ComputerActionResult>('computer_request_permissions');
}

export async function openComputerPrivacySettings(): Promise<ComputerActionResult> {
  if (!isDesktopRuntime()) return unavailable('open-privacy-settings');
  return await invoke<ComputerActionResult>('computer_open_privacy_settings');
}
