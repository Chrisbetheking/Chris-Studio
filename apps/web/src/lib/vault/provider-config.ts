import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import type { SavedProvider } from "../types";
import { ensureVault, providerConfigPath } from "./paths";

export function readProviderConfig(): SavedProvider[] {
  ensureVault();
  if (!existsSync(providerConfigPath)) return [];

  try {
    return JSON.parse(readFileSync(providerConfigPath, "utf8"));
  } catch {
    return [];
  }
}

export function findSavedProvider(providerId: string): SavedProvider | undefined {
  return readProviderConfig().find((item) => item.providerId === providerId);
}

export function saveProviderConfig(next: SavedProvider) {
  ensureVault();
  const current = readProviderConfig();
  const index = current.findIndex((item) => item.providerId === next.providerId);
  const item = { ...next, updatedAt: new Date().toISOString() };

  if (index >= 0) current[index] = { ...current[index], ...item };
  else current.push(item);

  writeFileSync(providerConfigPath, JSON.stringify(current, null, 2));
  try { chmodSync(providerConfigPath, 0o600); } catch {}
  return item;
}

export function publicProviderConfig() {
  return readProviderConfig().map((item) => ({
    providerId: item.providerId,
    model: item.model,
    baseUrl: item.baseUrl,
    enabled: item.enabled,
    hasKey: Boolean(item.apiKey),
    updatedAt: item.updatedAt
  }));
}
