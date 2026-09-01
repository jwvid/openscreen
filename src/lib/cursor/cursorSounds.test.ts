import { describe, expect, it } from "vitest";
import {
	buildExportTimelineSegments,
	deriveCursorSoundEvents,
	getExportTimelineDurationMs,
	mapCursorSoundEventsToExport,
	selectCursorSoundPreviewEvents,
} from "./cursorSounds";

describe("deriveCursorSoundEvents", () => {
	it("creates one click sound for a press/release with only pointer jitter", () => {
		const events = deriveCursorSoundEvents([
			{ timeMs: 100, cx: 0.5, cy: 0.5, interactionType: "click" },
			{ timeMs: 130, cx: 0.501, cy: 0.501, interactionType: "move" },
			{ timeMs: 160, cx: 0.502, cy: 0.501, interactionType: "mouseup" },
		]);

		expect(events).toEqual([{ kind: "click", sourceTimeMs: 100 }]);
	});

	it("uses separate drag start and drag end sounds after meaningful movement", () => {
		const events = deriveCursorSoundEvents([
			{ timeMs: 100, cx: 0.25, cy: 0.25, interactionType: "click" },
			{ timeMs: 180, cx: 0.35, cy: 0.3, interactionType: "move" },
			{ timeMs: 500, cx: 0.5, cy: 0.4, interactionType: "mouseup" },
		]);

		expect(events).toEqual([
			{ kind: "drag-start", sourceTimeMs: 100, pairId: 1 },
			{ kind: "drag-end", sourceTimeMs: 500, pairId: 1 },
		]);
	});

	it("keeps an unpaired press as a normal click", () => {
		expect(
			deriveCursorSoundEvents([
				{ timeMs: 40, cx: 0.2, cy: 0.2, interactionType: "click" },
				{ timeMs: 80, cx: 0.4, cy: 0.4, interactionType: "move" },
			]),
		).toEqual([{ kind: "click", sourceTimeMs: 40 }]);
	});
});

describe("cursor sound export timeline", () => {
	it("maps clicks through trims and playback speeds", () => {
		const events = mapCursorSoundEventsToExport(
			[
				{ kind: "click", sourceTimeMs: 250 },
				{ kind: "click", sourceTimeMs: 1250 },
				{ kind: "click", sourceTimeMs: 2250 },
			],
			3000,
			[{ id: "trim-1", startMs: 1000, endMs: 1500 }],
			[{ id: "speed-1", startMs: 2000, endMs: 3000, speed: 2 }],
		);

		expect(events).toEqual([
			{ kind: "click", timeMs: 250 },
			{ kind: "click", timeMs: 1625 },
		]);
		const segments = buildExportTimelineSegments(
			3000,
			[{ id: "trim-1", startMs: 1000, endMs: 1500 }],
			[{ id: "speed-1", startMs: 2000, endMs: 3000, speed: 2 }],
		);
		expect(getExportTimelineDurationMs(segments)).toBe(2000);
	});

	it("omits both drag sounds when a trim removes one end of the drag", () => {
		const events = mapCursorSoundEventsToExport(
			[
				{ kind: "drag-start", sourceTimeMs: 900, pairId: 7 },
				{ kind: "drag-end", sourceTimeMs: 1200, pairId: 7 },
			],
			2000,
			[{ id: "trim", startMs: 1000, endMs: 1300 }],
		);

		expect(events).toEqual([]);
	});
});

describe("cursor sound preview timeline", () => {
	const events = [
		{ kind: "click" as const, sourceTimeMs: 100 },
		{ kind: "drag-start" as const, sourceTimeMs: 200, pairId: 1 },
		{ kind: "drag-end" as const, sourceTimeMs: 400, pairId: 1 },
	];

	it("plays each event once as playback crosses it", () => {
		expect(selectCursorSoundPreviewEvents(events, 100, 250)).toEqual([events[1]]);
		expect(selectCursorSoundPreviewEvents(events, 99, 100)).toEqual([events[0]]);
	});

	it("can include the starting boundary when playback first begins", () => {
		expect(selectCursorSoundPreviewEvents(events, 100, 100, { includeStart: true })).toEqual([
			events[0],
		]);
	});

	it("keeps effects inside trimmed regions silent", () => {
		expect(
			selectCursorSoundPreviewEvents(events, 0, 500, {
				trimRegions: [{ id: "trim-1", startMs: 150, endMs: 350 }],
			}),
		).toEqual([events[0], events[2]]);
	});
});
