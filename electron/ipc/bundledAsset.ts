import path from "node:path";

const ALLOWED_BUNDLED_ASSETS = new Set([
	"sounds/cursor/click.mp3",
	"sounds/cursor/drag_1.mp3",
	"sounds/cursor/drag_2.mp3",
]);

/** Resolves only explicitly shipped, read-only renderer assets. */
export function resolveBundledAssetPath(assetRoot: string, relativePath: unknown): string | null {
	if (typeof relativePath !== "string" || relativePath.includes("\0")) return null;

	const canonicalRelativePath = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
	if (!ALLOWED_BUNDLED_ASSETS.has(canonicalRelativePath)) return null;

	const resolvedRoot = path.resolve(assetRoot);
	const resolvedAsset = path.resolve(resolvedRoot, ...canonicalRelativePath.split("/"));
	if (!resolvedAsset.startsWith(`${resolvedRoot}${path.sep}`)) return null;
	return resolvedAsset;
}
