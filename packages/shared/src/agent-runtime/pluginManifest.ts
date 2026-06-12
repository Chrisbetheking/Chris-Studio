import type { PluginManifest } from "./types";

const registry = new Map<string, PluginManifest>();

export function registerManifest(manifest: PluginManifest): void {
  registry.set(manifest.id, manifest);
}

export function getManifest(pluginId: string): PluginManifest | undefined {
  return registry.get(pluginId);
}

export function listManifests(category?: string): PluginManifest[] {
  const all = Array.from(registry.values());
  if (category) return all.filter((m) => m.category === category);
  return all;
}

export function setPluginEnabled(pluginId: string, enabled: boolean): void {
  const m = registry.get(pluginId);
  if (m) m.enabled = enabled;
}

export function setPluginInstalled(pluginId: string, installed: boolean, installStatus?: "installing" | "installed" | "failed"): void {
  const m = registry.get(pluginId);
  if (m) {
    m.installed = installed;
    if (installStatus) m.installStatus = installStatus;
  }
}

export function getManifestStatus() {
  const all = Array.from(registry.values());
  return {
    total: all.length,
    installed: all.filter((m) => m.installed).length,
    enabled: all.filter((m) => m.enabled).length,
    byCategory: all.reduce((acc, m) => {
      acc[m.category] = (acc[m.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };
}