import { describe, expect, it } from "vitest";
import { calculateHudOverlaySize } from "./hudOverlayLayout";

describe("calculateHudOverlaySize", () => {
	it("sizes the window around bottom-anchored HUD content", () => {
		expect(calculateHudOverlaySize({ topFromBottom: 68, halfWidth: 250 })).toEqual({
			width: 524,
			height: 92,
		});
	});

	it("adds fixed locale prompt height above the HUD so actions stay visible", () => {
		expect(
			calculateHudOverlaySize({
				topFromBottom: 68,
				halfWidth: 250,
				topNotice: { width: 520, height: 112 },
			}),
		).toEqual({
			width: 544,
			height: 216,
		});
	});

	it("ignores an unmeasured notice", () => {
		expect(
			calculateHudOverlaySize({
				topFromBottom: 68,
				halfWidth: 80,
				topNotice: { width: 0, height: 0 },
			}),
		).toEqual({ width: 220, height: 92 });
	});
});
