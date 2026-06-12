import type { RuntimeEnvironment, RuntimeStatus } from "./types";

const healthStatus = new Map<string, { healthy: boolean; lastCheck: number }>();

export function checkHealth(env: RuntimeEnvironment): boolean {
  const now = Date.now();
  const healthy = env.healthy;
  healthStatus.set(env.pluginId, { healthy, lastCheck: now });
  env.lastCheck = now;
  return healthy;
}

export function markUnhealthy(pluginId: string, reason: string): void {
  healthStatus.set(pluginId, { healthy: false, lastCheck: Date.now() });
}

export function getRuntimeStatus(runtimes: RuntimeEnvironment[]): RuntimeStatus {
  let healthyCount = 0;
  let unhealthyCount = 0;
  for (const rt of runtimes) {
    const h = healthStatus.get(rt.pluginId);
    if (h?.healthy) healthyCount++;
    else unhealthyCount++;
  }
  return {
    totalPlugins: runtimes.length,
    installedPlugins: runtimes.length,
    enabledPlugins: runtimes.length,
    healthyRuntimes: healthyCount,
    unhealthyRuntimes: unhealthyCount,
    pendingApprovals: 0,
  };
}