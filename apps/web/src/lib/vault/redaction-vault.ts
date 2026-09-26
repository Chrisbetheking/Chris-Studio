import { appendFileSync } from "node:fs";
import { ensureVault, redactionVaultPath } from "./paths";

export function saveRedactionMap(mapping: Record<string, string>, meta: Record<string, string>) {
  const keys = Object.keys(mapping);
  if (!keys.length) return;

  ensureVault();
  appendFileSync(redactionVaultPath, `${JSON.stringify({ createdAt: new Date().toISOString(), meta, mapping })}\n`);
}
