import type { StoragePaths } from './types';

const DEFAULT_PATHS: StoragePaths = {
  workspacePath: '',
  archivePath: '',
  exportPath: '',
  contextPacksPath: '',
};

export function getDefaultStoragePaths(): StoragePaths {
  return { ...DEFAULT_PATHS };
}

export function resolveStoragePath(
  basePath: string,
  subDir: string
): string {
  if (!basePath) return subDir;
  const normalized = basePath.replace(/\\/g, '/').replace(/\/$/, '');
  return `${normalized}/${subDir}`;
}

export function validatePath(path: string): boolean {
  if (!path) return false;
  const invalidChars = /[<>:"|?*\x00-\x1f]/;
  return !invalidChars.test(path.replace(':', ''));
}

export { type StoragePaths };
