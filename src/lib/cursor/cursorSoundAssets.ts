import { getAssetPath } from "@/lib/assetPath";
import type { CursorSoundKind } from "./cursorSounds";

export const CURSOR_SOUND_ASSET_PATHS: Record<CursorSoundKind, string> = {
	click: "sounds/cursor/click.mp3",
	"drag-start": "sounds/cursor/drag_1.mp3",
	"drag-end": "sounds/cursor/drag_2.mp3",
};

export async function readCursorSoundAsset(kind: CursorSoundKind): Promise<ArrayBuffer> {
	const relativePath = CURSOR_SOUND_ASSET_PATHS[kind];
	if (window.electronAPI?.readBundledAsset) {
		const result = await window.electronAPI.readBundledAsset(relativePath);
		if (!result.success || !result.data) {
			throw new Error(result.message || result.error || `Failed to read ${relativePath}`);
		}
		return result.data;
	}

	const url = getAssetPath(relativePath);
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Failed to load cursor sound: ${relativePath}`);
	return response.arrayBuffer();
}
