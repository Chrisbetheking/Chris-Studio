/* MP4 Media Import Plugin — stub for local agent runtime */

export interface MediaFile {
  id: string;
  name: string;
  path: string;
  sizeBytes: number;
  durationSec?: number;
  importedAt: number;
}

export interface FrameExtract {
  mediaId: string;
  timestampSec: number;
  dataUrl?: string;
  description?: string;
}

const mediaDb = new Map<string, MediaFile>();

export function importMediaFile(name: string, path: string, sizeBytes: number): MediaFile {
  const file: MediaFile = { id: `media-${Date.now()}`, name, path, sizeBytes, importedAt: Date.now() };
  mediaDb.set(file.id, file);
  return file;
}

export function listMediaFiles(): MediaFile[] {
  return Array.from(mediaDb.values()).sort((a, b) => b.importedAt - a.importedAt);
}

export function removeMedia(id: string): boolean {
  return mediaDb.delete(id);
}

/* Frame extraction requires a local agent / ffmpeg. Stub returns placeholder. */
export function extractFrames(mediaId: string, _timestamps: number[]): FrameExtract[] {
  const media = mediaDb.get(mediaId);
  if (!media) return [];
  return _timestamps.map((t) => ({
    mediaId,
    timestampSec: t,
    description: `[Placeholder] Frame at ${t}s from ${media.name}`,
  }));
}