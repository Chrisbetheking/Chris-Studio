/* Safe localStorage wrapper — works in browser, noop in Node/server */

interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const fenceStore: Record<string, string> = {};

function getLs(): MinimalStorage | null {
  try {
    const g = globalThis as Record<string, unknown>;
    const ls = g["localStorage"] as MinimalStorage | undefined;
    if (ls && typeof ls.getItem === "function") return ls;
    return null;
  } catch { return null; }
}

export function storeGet(key: string): string | null {
  const ls = getLs();
  if (ls) return ls.getItem(key);
  return fenceStore[key] ?? null;
}

export function storeSet(key: string, value: string): void {
  const ls = getLs();
  if (ls) { ls.setItem(key, value); return; }
  fenceStore[key] = value;
}

export function storeRemove(key: string): void {
  const ls = getLs();
  if (ls) { ls.removeItem(key); return; }
  delete fenceStore[key];
}