import { describe, expect, it } from "vitest";
import {
	type DirectRenderEligibilityConfig,
	isDirectCursorRenderEligible,
} from "./frameRenderMode";
import { drawWebcamFrameImage } from "./webcamFrameDrawing";

type DrawCall =
	| ["drawImage", unknown, number, number, number, number, number, number, number, number]
	| ["restore"]
	| ["save"]
	| ["scale", number, number]
	| ["translate", number, number];

function createMockCanvasContext() {
	const calls: DrawCall[] = [];
	const ctx = {
		drawImage: (
			image: CanvasImageSource,
			sx: number,
			sy: number,
			sw: number,
			sh: number,
			dx: number,
			dy: number,
			dw: number,
			dh: number,
		) => calls.push(["drawImage", image, sx, sy, sw, sh, dx, dy, dw, dh]),
		restore: () => calls.push(["restore"]),
		save: () => calls.push(["save"]),
		scale: (x: number, y: number) => calls.push(["scale", x, y]),
		translate: (x: number, y: number) => calls.push(["translate", x, y]),
	};

	return { calls, ctx };
}

describe("drawWebcamFrameImage", () => {
	it("draws the webcam frame into the layout rect by default", () => {
		const { calls, ctx } = createMockCanvasContext();
		const frame = {} as CanvasImageSource;

		drawWebcamFrameImage(
			ctx,
			frame,
			{ x: 12, y: 8, width: 640, height: 360 },
			{ x: 100, y: 50, width: 320, height: 180 },
		);

		expect(calls).toEqual([["drawImage", frame, 12, 8, 640, 360, 100, 50, 320, 180]]);
	});

	it("mirrors around the webcam rect without changing the crop", () => {
		const { calls, ctx } = createMockCanvasContext();
		const frame = {} as CanvasImageSource;

		drawWebcamFrameImage(
			ctx,
			frame,
			{ x: 12, y: 8, width: 640, height: 360 },
			{ x: 100, y: 50, width: 320, height: 180 },
			true,
		);

		expect(calls).toEqual([
			["save"],
			["translate", 420, 50],
			["scale", -1, 1],
			["drawImage", frame, 12, 8, 640, 360, 0, 0, 320, 180],
			["restore"],
		]);
	});

	it("restores the canvas context if mirrored drawing fails", () => {
		const { calls, ctx } = createMockCanvasContext();
		const frame = {} as CanvasImageSource;
		const error = new Error("draw failed");
		ctx.drawImage = () => {
			calls.push(["drawImage", frame, 12, 8, 640, 360, 0, 0, 320, 180]);
			throw error;
		};

		expect(() =>
			drawWebcamFrameImage(
				ctx,
				frame,
				{ x: 12, y: 8, width: 640, height: 360 },
				{ x: 100, y: 50, width: 320, height: 180 },
				true,
			),
		).toThrow(error);

		expect(calls).toEqual([
			["save"],
			["translate", 420, 50],
			["scale", -1, 1],
			["drawImage", frame, 12, 8, 640, 360, 0, 0, 320, 180],
			["restore"],
		]);
	});
});

function createConfig(
	overrides: Partial<DirectRenderEligibilityConfig> = {},
): DirectRenderEligibilityConfig {
	return {
		width: 5120,
		height: 2880,
		videoWidth: 5120,
		videoHeight: 2880,
		zoomRegions: [],
		cropRegion: { x: 0, y: 0, width: 1, height: 1 },
		...overrides,
	};
}

describe("isDirectCursorRenderEligible", () => {
	it("uses one-pass rendering for full-resolution cursor-only exports", () => {
		expect(isDirectCursorRenderEligible(createConfig())).toBe(true);
	});

	it.each([
		["scaled output", { width: 4096 }],
		["crop", { cropRegion: { x: 0.1, y: 0, width: 0.9, height: 1 } }],
		["padding", { padding: 8 }],
		["rounded corners", { borderRadius: 12 }],
		["webcam", { webcamSize: { width: 1280, height: 720 } }],
		["zoom", { zoomRegions: [{ id: "z", startMs: 0, endMs: 1000 }] }],
		["annotation", { annotationRegions: [{ id: "a", startMs: 0, endMs: 1000 }] }],
	] as const)("keeps the composited renderer for %s", (_name, override) => {
		expect(
			isDirectCursorRenderEligible(
				createConfig(override as Partial<DirectRenderEligibilityConfig>),
			),
		).toBe(false);
	});
});
