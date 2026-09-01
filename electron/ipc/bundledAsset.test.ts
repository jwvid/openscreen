import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBundledAssetPath } from "./bundledAsset";

describe("resolveBundledAssetPath", () => {
	const root = path.join(path.sep, "Applications", "Openscreen.app", "Contents", "Resources");

	it("allows the three packaged mouse sound files", () => {
		expect(resolveBundledAssetPath(root, "sounds/cursor/click.mp3")).toBe(
			path.join(root, "sounds", "cursor", "click.mp3"),
		);
		expect(resolveBundledAssetPath(root, "sounds/cursor/drag_1.mp3")).toBe(
			path.join(root, "sounds", "cursor", "drag_1.mp3"),
		);
		expect(resolveBundledAssetPath(root, "sounds\\cursor\\drag_2.mp3")).toBe(
			path.join(root, "sounds", "cursor", "drag_2.mp3"),
		);
	});

	it("rejects traversal, arbitrary MP3 files, and non-string values", () => {
		expect(resolveBundledAssetPath(root, "../click.mp3")).toBeNull();
		expect(resolveBundledAssetPath(root, "sounds/cursor/other.mp3")).toBeNull();
		expect(resolveBundledAssetPath(root, "/etc/passwd")).toBeNull();
		expect(resolveBundledAssetPath(root, null)).toBeNull();
	});
});
