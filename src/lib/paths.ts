import { base } from '$app/paths';

/**
 * Resolve a runtime URL for a static asset under the configured deployment base
 * path.
 *
 * OpenRide is deployed to GitHub Pages at `https://<user>.github.io/openride/`,
 * so a literal `/worlds/stelvio/manifest.json` would resolve to the wrong host
 * path. Every world, texture, audio and model fetch must go through this helper
 * (or `$app/paths` directly). See AGENTS.md §3 and OPENRIDE-BLUEPRINT.md §30.
 *
 * @param path Asset path relative to the deployment root, with or without a
 *   leading slash (e.g. `worlds/stelvio/manifest.json`).
 */
export function asset(path: string): string {
	return `${base}/${path.replace(/^\/+/, '')}`;
}
