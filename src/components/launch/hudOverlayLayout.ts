const HUD_SIDE_MARGIN = 24;
const HUD_TOP_MARGIN = 24;
const HUD_MIN_WIDTH = 220;
const HUD_TOP_NOTICE_GAP = 12;

export interface HudTopNoticeSize {
	width: number;
	height: number;
}

export interface HudOverlaySizeInput {
	topFromBottom: number;
	halfWidth: number;
	topNotice?: HudTopNoticeSize | null;
}

/**
 * Resolves the transparent HUD BrowserWindow size from its bottom-anchored content.
 * A fixed top notice needs additive height so it cannot overlap the HUD or be clipped.
 */
export function calculateHudOverlaySize({
	topFromBottom,
	halfWidth,
	topNotice,
}: HudOverlaySizeInput) {
	let requiredTopFromBottom = Math.max(0, topFromBottom);
	let requiredHalfWidth = Math.max(0, halfWidth);

	if (topNotice && (topNotice.width > 0 || topNotice.height > 0)) {
		requiredTopFromBottom += Math.max(0, topNotice.height) + HUD_TOP_NOTICE_GAP;
		requiredHalfWidth = Math.max(requiredHalfWidth, Math.max(0, topNotice.width) / 2);
	}

	return {
		width: Math.max(HUD_MIN_WIDTH, Math.ceil(requiredHalfWidth * 2) + HUD_SIDE_MARGIN),
		height: Math.ceil(requiredTopFromBottom) + HUD_TOP_MARGIN,
	};
}
