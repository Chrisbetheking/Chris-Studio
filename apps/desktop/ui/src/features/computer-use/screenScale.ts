/**
 * Reconcile screenshot pixels with the logical points macOS clicks use.
 *
 * A Retina capture is written at physical resolution (for example 2940×1912)
 * while `System Events ... click at {x, y}` addresses logical points (for the
 * same display, 1470×956). A model that reads a coordinate off the screenshot
 * therefore lands at twice the intended position — the click silently hits the
 * wrong target instead of failing, which is the worst possible outcome for an
 * approved desktop action.
 *
 * The helpers below measure the real ratio from the captured image and convert
 * the model's pixel coordinate into the point the runtime actually clicks.
 */

export interface PixelSize {
  width: number;
  height: number;
}

/** Widest ratio a supported display may report (5K/2x plus headroom). */
export const MAX_SCREEN_SCALE = 4;

/**
 * Read the pixel dimensions from a PNG data URL.
 *
 * Only the IHDR header is inspected (bytes 16..24 of the file), so no image
 * decoding is required and the helper works in Node as well as the browser.
 */
export function pngPixelSize(dataUrl: string | undefined): PixelSize | undefined {
  if (typeof dataUrl !== 'string') return undefined;
  const marker = 'base64,';
  const index = dataUrl.indexOf(marker);
  if (index < 0) return undefined;
  const base64 = dataUrl.slice(index + marker.length).replace(/\s+/g, '');
  // A PNG signature plus IHDR header needs 24 bytes; base64 uses 4 chars per 3.
  if (base64.length < 32) return undefined;
  let buffer: Uint8Array;
  try {
    if (typeof Buffer !== 'undefined') {
      buffer = new Uint8Array(Buffer.from(base64.slice(0, 64), 'base64'));
    } else if (typeof atob === 'function') {
      const decoded = atob(base64.slice(0, 64));
      buffer = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    } else {
      return undefined;
    }
  } catch {
    return undefined;
  }
  // 0x89 P N G \r \n 0x1a \n then an 8-byte chunk header, then the IHDR payload.
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < signature.length; i += 1) {
    if (buffer[i] !== signature[i]) return undefined;
  }
  const view = (offset: number) => ((buffer[offset] << 24) | (buffer[offset + 1] << 16) | (buffer[offset + 2] << 8) | buffer[offset + 3]) >>> 0;
  const width = view(16);
  const height = view(20);
  if (!width || !height) return undefined;
  return { width, height };
}

/**
 * Compute the pixel-to-point ratio for one capture.
 *
 * The ratio is derived from the captured image and the logical display size, so
 * a 1x display reports 1 and a Retina display reports 2 without any assumption
 * about the hardware. Unusable inputs fall back to 1 (no conversion), which is
 * the safe choice: converting with a guessed ratio would move every click.
 */
export function resolveScreenshotScale(pixel: PixelSize | undefined, logical: PixelSize | undefined): number {
  if (!pixel || !logical) return 1;
  const ratioX = Number(pixel.width) / Number(logical.width);
  const ratioY = Number(pixel.height) / Number(logical.height);
  if (!Number.isFinite(ratioX) || !Number.isFinite(ratioY)) return 1;
  if (ratioX <= 0 || ratioY <= 0) return 1;
  // A mismatch between axes means the logical size is not the matching display;
  // refusing to convert avoids a wrong click.
  if (Math.abs(ratioX - ratioY) > 0.05) return 1;
  const rounded = Math.round(ratioX);
  if (rounded < 1 || rounded > MAX_SCREEN_SCALE) return 1;
  // Only an integral ratio is a display scaling factor; anything else is noise.
  if (Math.abs(ratioX - rounded) > 0.05) return 1;
  return rounded;
}

/**
 * Convert a screenshot pixel coordinate into the logical point to click.
 *
 * The result is clamped into the display bounds so a coordinate that falls on
 * the last pixel of the capture can never address a point outside the screen.
 */
export function toLogicalPoint(value: number, scale: number, logicalExtent: number): number {
  const ratio = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const point = Math.round(Number(value) / ratio);
  if (!Number.isFinite(point)) return 0;
  const extent = Number.isFinite(logicalExtent) && logicalExtent > 0 ? Math.floor(logicalExtent) : point;
  return Math.min(Math.max(0, point), Math.max(0, extent));
}
