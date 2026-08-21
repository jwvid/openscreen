import { describe, expect, it } from "vitest";
import {
	getCursorBrightnessTint,
	getCursorClickBrightness,
	getCursorImageFilter,
} from "./clickVisuals";

describe("cursor click visuals", () => {
	it("darkens at click start and fades back to the original brightness", () => {
		expect(getCursorClickBrightness(0.2, 1)).toBeCloseTo(0.8);
		expect(getCursorClickBrightness(0.2, 0.5)).toBeCloseTo(0.9);
		expect(getCursorClickBrightness(0.2, 0)).toBe(1);
	});

	it("clamps invalid intensity and progress inputs", () => {
		expect(getCursorClickBrightness(2, 2)).toBe(0);
		expect(getCursorClickBrightness(-1, 1)).toBe(1);
		expect(getCursorClickBrightness(1, -1)).toBe(1);
	});

	it("creates a neutral Pixi tint at full brightness", () => {
		expect(getCursorBrightnessTint(1)).toBe(0xffffff);
		expect(getCursorBrightnessTint(0.5)).toBe(0x808080);
	});

	it("composes filters for DOM and Canvas renderers", () => {
		expect(getCursorImageFilter({})).toBe("none");
		expect(
			getCursorImageFilter({
				brightness: 0.8,
				blurPx: 1.25,
				dropShadow: "drop-shadow(0 2px 3px #0005)",
			}),
		).toBe("drop-shadow(0 2px 3px #0005) brightness(0.800) blur(1.25px)");
	});
});
