import type { ArchiveEntry, GuardResult, SensitiveFinding } from './types';

const MAX_ENTRIES = 200;

/**
 * Replace the raw matched value on every finding.
 *
 * `SensitiveFinding.match` holds the exact text the guard detected, so removing
 * only `GuardResult.original` still archived live credentials: a redacted
 * receipt looked sanitized while `findings[i].match` kept the mailbox, token or
 * key verbatim. The offsets stay untouched so a redacted receipt can still be
 * correlated with the scan that produced it.
 */
function withoutRawMatches(findings: SensitiveFinding[]): SensitiveFinding[] {
  return findings.map((finding) => ({ ...finding, match: finding.redacted }));
}

/**
 * Build one archive entry from a scan result.
 *
 * With `storeSanitizedOnly` the entry keeps the redacted text plus finding
 * metadata, never the raw payload; otherwise the full scan result is preserved
 * for local inspection.
 */
export function createArchiveEntry(
  guardResult: GuardResult,
  taskType: string,
  storeSanitizedOnly: boolean
): ArchiveEntry {
  return {
    id: Date.now().toString(),
    guardResult: storeSanitizedOnly
      ? {
          ...guardResult,
          original: '',
          findings: withoutRawMatches(guardResult.findings ?? []),
        }
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
