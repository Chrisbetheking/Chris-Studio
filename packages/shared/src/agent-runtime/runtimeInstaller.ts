import type { PluginManifest, RuntimeEnvironment, PluginInstallResult } from "./types";

const installedRuntimes = new Map<string, RuntimeEnvironment>();

export function installRuntime(manifest: PluginManifest): PluginInstallResult {
  const existing = installedRuntimes.get(manifest.id);
  if (existing && existing.healthy) {
    return { pluginId: manifest.id, success: true, installedAt: Date.now(), runtimeEnv: existing };
  }

  const env: RuntimeEnvironment = {
    runtimeId: `rt-${manifest.id}-${Date.now()}`,
    pluginId: manifest.id,
    kind: manifest.runtime,
    path: `.tokenfence/runtimes/${manifest.id}/`,
    workspacePath: `.tokenfence/runtimes/${manifest.id}/workspace/`,
    logsPath: `.tokenfence/runtimes/${manifest.id}/logs/`,
    healthy: true,
    lastCheck: Date.now(),
  };
  installedRuntimes.set(manifest.id, env);
  return { pluginId: manifest.id, success: true, installedAt: Date.now(), runtimeEnv: env };
}

export function uninstallRuntime(pluginId: string): boolean {
  return installedRuntimes.delete(pluginId);
}

export function getRuntime(pluginId: string): RuntimeEnvironment | undefined {
  return installedRuntimes.get(pluginId);
}

export function listRuntimes(): RuntimeEnvironment[] {
  return Array.from(installedRuntimes.values());
}