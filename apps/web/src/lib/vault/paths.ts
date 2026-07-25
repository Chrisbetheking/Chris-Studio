import { mkdirSync } from "node:fs";
import path from "node:path";

export const vaultDir = path.join(process.cwd(), ".tokenfence");
export const providerConfigPath = path.join(vaultDir, "provider-config.json");
export const archivePath = path.join(vaultDir, "archive.jsonl");
export const redactionVaultPath = path.join(vaultDir, "redaction-vault.jsonl");

export function ensureVault() {
  mkdirSync(vaultDir, { recursive: true });
}
