/* Obsidian Knowledge Connector — local vault path mode */
import { storeGet, storeSet } from "../agent-runtime/safeStorage";

export interface ObsidianNote {
  path: string;
  title: string;
  content: string;
  tags: string[];
  modified: number;
}

export interface ObsidianVaultConfig {
  vaultPath: string;
  enabled: boolean;
}

let vaultConfig: ObsidianVaultConfig = { vaultPath: "", enabled: false };

export function setVaultConfig(config: Partial<ObsidianVaultConfig>): void {
  vaultConfig = { ...vaultConfig, ...config };
  try { storeSet("tokenfence.obsidian", JSON.stringify(vaultConfig)); } catch { /* */ }
}

export function getVaultConfig(): ObsidianVaultConfig {
  try {
    const raw = storeGet("tokenfence.obsidian");
    if (raw) vaultConfig = { ...vaultConfig, ...JSON.parse(raw) };
  } catch { /* */ }
  return { ...vaultConfig };
}

const notesDb = new Map<string, ObsidianNote>();

export function writeNote(title: string, content: string, tags: string[] = []): ObsidianNote {
  const path = `${title.replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_")}.md`;
  const note: ObsidianNote = { path, title, content, tags, modified: Date.now() };
  notesDb.set(path, note);
  return note;
}

export function readNote(path: string): ObsidianNote | undefined {
  return notesDb.get(path);
}

export function listNotes(): ObsidianNote[] {
  return Array.from(notesDb.values()).sort((a, b) => b.modified - a.modified);
}

export function searchNotes(query: string): ObsidianNote[] {
  const q = query.toLowerCase();
  return Array.from(notesDb.values()).filter(
    (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.tags.some((t) => t.toLowerCase().includes(q))
  );
}

export function deleteNote(path: string): boolean {
  return notesDb.delete(path);
}