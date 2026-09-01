import { describe, expect, it } from "vitest";
import type { DecodedCursorSoundLibrary } from "./cursorSoundEncoder";
import { mixCursorSoundsIntoPlanarFrame } from "./cursorSoundEncoder";

describe("mixCursorSoundsIntoPlanarFrame", () => {
	it("places and duplicates a mono click in a stereo planar frame", () => {
		const click = { sampleRate: 1000, channels: [new Float32Array([0.5, -0.5])] };
		const library = {
			click,
			"drag-start": click,
			"drag-end": click,
		} satisfies DecodedCursorSoundLibrary;
		const output = new Float32Array(20);

		mixCursorSoundsIntoPlanarFrame(output, 10, 2, 1000, 0, [{ kind: "click", timeMs: 4 }], library);

		expect(output[4]).toBeCloseTo(0.41);
		expect(output[5]).toBeCloseTo(-0.41);
		expect(output[14]).toBeCloseTo(0.41);
		expect(output[15]).toBeCloseTo(-0.41);
	});

	it("continues a sound across the next encoded frame", () => {
		const clip = {
			sampleRate: 1000,
			channels: [new Float32Array([0.1, 0.2, 0.3, 0.4])],
		};
		const library = {
			click: clip,
			"drag-start": clip,
			"drag-end": clip,
		} satisfies DecodedCursorSoundLibrary;
		const output = new Float32Array(4);

		mixCursorSoundsIntoPlanarFrame(
			output,
			4,
			1,
			1000,
			4000,
			[{ kind: "click", timeMs: 2 }],
			library,
		);

		expect(Array.from(output.slice(0, 2))).toEqual([
			expect.closeTo(0.3 * 0.82),
			expect.closeTo(0.4 * 0.82),
		]);
	});
});
