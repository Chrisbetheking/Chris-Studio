import { existsSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import type { ArchiveRecord } from "../types";
import { archivePath, ensureVault } from "./paths";

export function addArchive(record: Omit<ArchiveRecord, "id" | "createdAt">) {
  ensureVault();
  const full: ArchiveRecord = {
    ...record,
    id: cryptoId(),
    createdAt: new Date().toISOString()
  };

  appendFileSync(archivePath, `${JSON.stringify(full)}\n`);
  return full;
}

export function listArchive(query = "") {
  ensureVault();
  if (!existsSync(archivePath)) return [] as ArchiveRecord[];

  const needle = query.trim().toLowerCase();
  const records = readFileSync(archivePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ArchiveRecord)
    .reverse();

  if (!needle) return records;
  return records.filter((item) =>
    [item.title, item.providerId, item.model, item.promptBefore, item.response, item.tags.join(" ")]
      .join("\n")
      .toLowerCase()
      .includes(needle)
  );
}

export function deleteArchive(id: string) {
  ensureVault();
  if (!existsSync(archivePath)) return false;

  const kept = readFileSync(archivePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as ArchiveRecord)
    .filter((item) => item.id !== id);

  writeFileSync(archivePath, kept.map((item) => JSON.stringify(item)).join("\n") + (kept.length ? "\n" : ""));
  return true;
}

export function clearArchive() {
  ensureVault();
  writeFileSync(archivePath, "");
  return true;
}

function cryptoId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);
}
