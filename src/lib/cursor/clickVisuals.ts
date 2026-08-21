export interface CursorImageFilterOptions {
	brightness?: number;
	blurPx?: number;
	dropShadow?: string;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

/**
 * Returns the cursor brightness for an active click animation.
 *
 * `clickDarken` and `clickProgress` both use the normalized 0..1 range. A click
 * starts at full progress and fades back to the original brightness as progress
 * approaches zero.
 */
export function getCursorClickBrightness(clickDarken: number, clickProgress: number) {
	const darkness = clamp(clickDarken, 0, 1);
	const progress = clamp(clickProgress, 0, 1);
	return 1 - darkness * progress;
}

/** Converts a brightness multiplier to a Pixi-compatible RGB multiply tint. */
export function getCursorBrightnessTint(brightness: number) {
	const channel = Math.round(clamp(brightness, 0, 1) * 255);
	return (channel << 16) | (channel << 8) | channel;
}

/**
 * Builds one filter string shared by DOM and Canvas cursor renderers.
 * Returns `none` when no visual filter is active.
 */
export function getCursorImageFilter({
	brightness = 1,
	blurPx = 0,
	dropShadow,
}: CursorImageFilterOptions) {
	const filters: string[] = [];
	if (dropShadow) {
		filters.push(dropShadow);
	}
	if (brightness < 0.9995) {
		filters.push(`brightness(${clamp(brightness, 0, 1).toFixed(3)})`);
	}
	if (blurPx > 0) {
		filters.push(`blur(${blurPx.toFixed(2)}px)`);
	}
	return filters.join(" ") || "none";
}
