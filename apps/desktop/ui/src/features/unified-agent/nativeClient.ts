import { invoke } from '@tauri-apps/api/tauri';
import { isDesktopRuntime } from '../platform/desktopClient';

export interface AccessibilityElementSummary {
  index: number;
  role: string;
  title: string;
  description: string;
  enabled: boolean;
  actions: string[];
}

export interface AccessibilitySnapshot {
  ok: boolean;
  app?: string;
  window?: string;
  elements: AccessibilityElementSummary[];
  message: string;
  errorMessage?: string;
}

export interface AccessibilityActionResult {
  ok: boolean;
  app?: string;
  index?: number;
  role?: string;
  title?: string;
  message: string;
  errorMessage?: string;
}

export async function inspectAccessibility(app?: string): Promise<AccessibilitySnapshot> {
  if (!isDesktopRuntime()) {
    return { ok: false, elements: [], message: 'Accessibility inspection requires the desktop app.', errorMessage: 'Desktop runtime unavailable.' };
  }
  return invoke<AccessibilitySnapshot>('computer_inspect_accessibility', { app: app?.trim() || null });
}

export async function activateAccessibility(index: number, app: string | undefined, confirmed: boolean): Promise<AccessibilityActionResult> {
  if (!isDesktopRuntime()) {
    return { ok: false, index, message: 'Accessibility activation requires the desktop app.', errorMessage: 'Desktop runtime unavailable.' };
  }
  return invoke<AccessibilityActionResult>('computer_activate_accessibility', {
    index,
    app: app?.trim() || null,
    confirmed,
  });
}
