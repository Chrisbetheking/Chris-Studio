import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ArchiveEntry } from '@shared/types';

const ARCHIVE_KEY = 'tf_archive';

export async function loadArchive(): Promise<ArchiveEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(ARCHIVE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

export async function saveEntry(entry: ArchiveEntry): Promise<void> {
  const archive = await loadArchive();
  archive.unshift(entry);
  await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive.slice(0, 200)));
}

export async function clearArchive(): Promise<void> {
  await AsyncStorage.removeItem(ARCHIVE_KEY);
}

export async function deleteEntry(id: string): Promise<void> {
  const archive = await loadArchive();
  await AsyncStorage.setItem(ARCHIVE_KEY, JSON.stringify(archive.filter((e: ArchiveEntry) => e.id !== id)));
}
