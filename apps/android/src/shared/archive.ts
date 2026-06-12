import type { ArchiveEntry, GuardResult } from './types';

const MAX_ENTRIES = 200;

export function createArchiveEntry(
  guardResult: GuardResult,
  taskType: string,
  storeSanitizedOnly: boolean
): ArchiveEntry {
  return {
    id: Date.now().toString(),
    guardResult: storeSanitizedOnly
      ? { ...guardResult, original: '' }
      : guardResult,
    taskType: taskType as ArchiveEntry['taskType'],
    savedAt: Date.now(),
  };
}

export function filterArchive(
  entries: ArchiveEntry[],
  maxEntries: number = MAX_ENTRIES
): ArchiveEntry[] {
  return entries.slice(0, maxEntries);
}

export type { ArchiveEntry, GuardResult };
