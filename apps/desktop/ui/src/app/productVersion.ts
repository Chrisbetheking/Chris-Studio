/**
 * Single source of truth for the product version in the renderer.
 *
 * The version used to be hard-coded in three unrelated places
 * (`updateClient.ts`, `platform/desktopClient.ts` and `UpdatesScreen.tsx`) with
 * a stale `2.1.0` literal, so the update screen reported "Installed: 2.1.0" for
 * a 2.4.0-alpha.2 build. `scripts/sync-product-metadata.cjs` keeps the constant
 * below synchronized with `apps/desktop/ui/package.json`, exactly like the
 * sidebar label and the About fallback.
 */
export const PRODUCT_VERSION = '2.4.0-alpha.2';

/** Sidebar/footer label, e.g. `v2.4.0-alpha.2 · macOS`. */
export function productVersionLabel(): string {
  return `v${PRODUCT_VERSION} · macOS`;
}

/**
 * Leading `v` for the GitHub release tag, e.g. `v2.4.0-alpha.2`.
 *
 * Kept separate from `productVersionLabel()` because the release check compares
 * versions without the platform suffix.
 */
export function productVersionTag(): string {
  return `v${PRODUCT_VERSION}`;
}

/**
 * Version shown by a preview build that is not the packaged desktop app.
 *
 * The suffix makes it explicit that a browser preview cannot report the real
 * installed version, instead of presenting a packaged number that may be wrong.
 */
export function previewVersion(): string {
  return `${PRODUCT_VERSION}-web-preview`;
}
