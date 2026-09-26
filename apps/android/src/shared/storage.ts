import type { StoragePaths } from './types';

const DEFAULT_PATHS: StoragePaths = {
  workspacePath: '',
  archivePath: '',
  exportPath: '',
  contextPacksPath: '',
};

/** Longest path this module will accept, matching common OS limits. */
const MAX_PATH_LENGTH = 4096;

export function getDefaultStoragePaths(): StoragePaths {
  return { ...DEFAULT_PATHS };
}

/**
 * Report whether a storage sub-path is safe to join onto a base directory.
 *
 * A sub-path reaches the filesystem after being concatenated with a project or
 * workspace root, so accepting a traversal segment, an absolute path, a drive
 * letter or a UNC prefix silently escapes that root. The check therefore
 * rejects all of those, plus control characters, the Windows-reserved
 * punctuation (including `:`, which also selects an NTFS alternate data
 * stream), a leading `~` and over-long input.
 *
 * A `.` segment and a name that merely contains dots (`report..v2.md`) stay
 * valid: only the exact `..` segment is a traversal.
 */
export function validatePath(path: string): boolean {
  if (typeof path !== 'string') return false;
  const value = path.trim();
  if (!value || value.length > MAX_PATH_LENGTH) return false;

  // Control characters and Windows-reserved punctuation.
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return false;
  }
  if (/[<>"|?*:]/.test(value)) return false;

  // UNC / network share prefix, in either separator form.
  if (/^[\\/]{2}/.test(value)) return false;
  // Absolute POSIX path: a joined sub-path must stay relative to its base.
  if (/^[\\/]/.test(value)) return false;
  // Windows drive prefix such as `C:\` or `C:/`.
  if (/^[A-Za-z]:[\\/]/.test(value)) return false;
  // Home expansion is not a literal directory name.
  if (value.startsWith('~')) return false;

  const segments = value.replace(/\\/g, '/').split('/');
  if (segments.some((segment) => segment === '..')) return false;
  return true;
}

/**
 * Join a storage base directory with a sub-path.
 *
 * Throws when the sub-path is unsafe, so a caller can never receive a path that
 * escapes its base. Both arguments have their separators normalized and their
 * trailing separators removed; an empty base yields the sub-path alone and an
 * empty sub-path yields the base alone.
 */
export function resolveStoragePath(basePath: string, subDir: string): string {
  const base = String(basePath ?? '').replace(/\\/g, '/').replace(/\/+$/, '');
  const sub = String(subDir ?? '').trim();
  if (!sub) return base;
  if (!validatePath(sub)) {
    throw new Error(`Unsafe storage path rejected: ${JSON.stringify(sub).slice(0, 120)}`);
  }
  const normalizedSub = sub.replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalizedSub || normalizedSub === '.') return base;
  return base ? `${base}/${normalizedSub}` : normalizedSub;
}

export { type StoragePaths };
