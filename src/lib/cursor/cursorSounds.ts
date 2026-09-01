import type { SpeedRegion, TrimRegion } from "@/components/video-editor/types";

const DRAG_DISTANCE_THRESHOLD = 0.004;
const MIN_SEGMENT_DURATION_MS = 0.1;

export type CursorSoundKind = "click" | "drag-start" | "drag-end";

export interface CursorSoundSample {
	timeMs: number;
	cx: number;
	cy: number;
	interactionType?: "move" | "click" | "double-click" | "right-click" | "middle-click" | "mouseup";
}

export interface SourceCursorSoundEvent {
	kind: CursorSoundKind;
	sourceTimeMs: number;
	pairId?: number;
}

export interface ExportCursorSoundEvent {
	kind: CursorSoundKind;
	timeMs: number;
}

interface CursorSoundPreviewWindowOptions {
	includeStart?: boolean;
	trimRegions?: TrimRegion[];
}

interface ExportTimelineSegment {
	startMs: number;
	endMs: number;
	speed: number;
	outputStartMs: number;
}

function isPress(type: CursorSoundSample["interactionType"]) {
	return (
		type === "click" || type === "double-click" || type === "right-click" || type === "middle-click"
	);
}

function distanceFromPress(
	press: Pick<CursorSoundSample, "cx" | "cy">,
	sample: Pick<CursorSoundSample, "cx" | "cy">,
) {
	return Math.hypot(sample.cx - press.cx, sample.cy - press.cy);
}

/**
 * Converts cursor button telemetry into semantic sound events. A press/release
 * pair that travels at least 0.4% of the normalized screen diagonal is treated
 * as a drag; smaller pointer jitter remains a normal click.
 */
export function deriveCursorSoundEvents(
	samples: CursorSoundSample[] | undefined,
): SourceCursorSoundEvent[] {
	if (!samples?.length) return [];

	const ordered = samples
		.filter(
			(sample) =>
				Number.isFinite(sample.timeMs) && Number.isFinite(sample.cx) && Number.isFinite(sample.cy),
		)
		.map((sample, index) => ({ sample, index }))
		.sort((a, b) => a.sample.timeMs - b.sample.timeMs || a.index - b.index)
		.map(({ sample }) => sample);

	const events: SourceCursorSoundEvent[] = [];
	let pairId = 0;
	let activePress:
		| {
				sample: CursorSoundSample;
				maxDistance: number;
		  }
		| undefined;

	const finishAsClick = () => {
		if (!activePress) return;
		events.push({ kind: "click", sourceTimeMs: activePress.sample.timeMs });
		activePress = undefined;
	};

	for (const sample of ordered) {
		if (isPress(sample.interactionType)) {
			// A missing mouse-up should not swallow the preceding click.
			finishAsClick();
			activePress = { sample, maxDistance: 0 };
			continue;
		}

		if (!activePress) continue;
		activePress.maxDistance = Math.max(
			activePress.maxDistance,
			distanceFromPress(activePress.sample, sample),
		);

		if (sample.interactionType !== "mouseup") continue;

		if (activePress.maxDistance >= DRAG_DISTANCE_THRESHOLD) {
			pairId += 1;
			events.push(
				{ kind: "drag-start", sourceTimeMs: activePress.sample.timeMs, pairId },
				{ kind: "drag-end", sourceTimeMs: sample.timeMs, pairId },
			);
		} else {
			events.push({ kind: "click", sourceTimeMs: activePress.sample.timeMs });
		}
		activePress = undefined;
	}

	finishAsClick();
	return events.sort((a, b) => a.sourceTimeMs - b.sourceTimeMs);
}

/**
 * Selects source-timeline effects crossed by one preview playback update.
 * Trimmed effects stay silent, matching the exported result.
 */
export function selectCursorSoundPreviewEvents(
	events: SourceCursorSoundEvent[],
	startMs: number,
	endMs: number,
	options: CursorSoundPreviewWindowOptions = {},
) {
	if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return [];

	const { includeStart = false, trimRegions = [] } = options;
	return events.filter((event) => {
		const startsInWindow = includeStart
			? event.sourceTimeMs >= startMs
			: event.sourceTimeMs > startMs;
		if (!startsInWindow || event.sourceTimeMs > endMs) return false;
		return !trimRegions.some(
			(region) => event.sourceTimeMs >= region.startMs && event.sourceTimeMs < region.endMs,
		);
	});
}

function computeKeptSegments(durationMs: number, trimRegions?: TrimRegion[]) {
	if (!trimRegions?.length) return [{ startMs: 0, endMs: durationMs }];

	const sorted = [...trimRegions].sort((a, b) => a.startMs - b.startMs);
	const segments: Array<{ startMs: number; endMs: number }> = [];
	let cursor = 0;

	for (const trim of sorted) {
		const trimStart = Math.max(0, Math.min(durationMs, trim.startMs));
		const trimEnd = Math.max(trimStart, Math.min(durationMs, trim.endMs));
		if (cursor < trimStart) segments.push({ startMs: cursor, endMs: trimStart });
		cursor = Math.max(cursor, trimEnd);
	}

	if (cursor < durationMs) segments.push({ startMs: cursor, endMs: durationMs });
	return segments;
}

export function buildExportTimelineSegments(
	durationMs: number,
	trimRegions?: TrimRegion[],
	speedRegions?: SpeedRegion[],
): ExportTimelineSegment[] {
	const keptSegments = computeKeptSegments(Math.max(0, durationMs), trimRegions);
	const splitSegments: Array<Omit<ExportTimelineSegment, "outputStartMs">> = [];

	for (const kept of keptSegments) {
		const overlapping = (speedRegions ?? [])
			.filter((region) => region.startMs < kept.endMs && region.endMs > kept.startMs)
			.sort((a, b) => a.startMs - b.startMs);

		let cursor = kept.startMs;
		for (const region of overlapping) {
			const startMs = Math.max(cursor, kept.startMs, region.startMs);
			const endMs = Math.min(kept.endMs, region.endMs);
			if (cursor < startMs) splitSegments.push({ startMs: cursor, endMs: startMs, speed: 1 });
			if (endMs - startMs > MIN_SEGMENT_DURATION_MS) {
				splitSegments.push({
					startMs,
					endMs,
					speed: Number.isFinite(region.speed) && region.speed > 0 ? region.speed : 1,
				});
				cursor = Math.max(cursor, endMs);
			}
		}
		if (cursor < kept.endMs) splitSegments.push({ startMs: cursor, endMs: kept.endMs, speed: 1 });
	}

	let outputStartMs = 0;
	return splitSegments
		.filter((segment) => segment.endMs - segment.startMs > MIN_SEGMENT_DURATION_MS)
		.map((segment) => {
			const result = { ...segment, outputStartMs };
			outputStartMs += (segment.endMs - segment.startMs) / segment.speed;
			return result;
		});
}

export function mapSourceTimeToExportTime(
	sourceTimeMs: number,
	segments: ExportTimelineSegment[],
): number | null {
	const segment = segments.find(
		(candidate) => sourceTimeMs >= candidate.startMs && sourceTimeMs < candidate.endMs,
	);
	if (!segment) return null;
	return segment.outputStartMs + (sourceTimeMs - segment.startMs) / segment.speed;
}

/** Maps sound events through trim and speed edits, omitting incomplete drag pairs. */
export function mapCursorSoundEventsToExport(
	events: SourceCursorSoundEvent[],
	durationMs: number,
	trimRegions?: TrimRegion[],
	speedRegions?: SpeedRegion[],
): ExportCursorSoundEvent[] {
	const segments = buildExportTimelineSegments(durationMs, trimRegions, speedRegions);
	const mapped = events.map((event) => ({
		event,
		timeMs: mapSourceTimeToExportTime(event.sourceTimeMs, segments),
	}));
	const completePairs = new Set<number>();
	const pairCounts = new Map<number, number>();

	for (const item of mapped) {
		if (item.event.pairId === undefined || item.timeMs === null) continue;
		pairCounts.set(item.event.pairId, (pairCounts.get(item.event.pairId) ?? 0) + 1);
	}
	for (const [id, count] of pairCounts) {
		if (count === 2) completePairs.add(id);
	}

	return mapped
		.filter(
			(item) =>
				item.timeMs !== null &&
				(item.event.pairId === undefined || completePairs.has(item.event.pairId)),
		)
		.map((item) => ({ kind: item.event.kind, timeMs: item.timeMs as number }))
		.sort((a, b) => a.timeMs - b.timeMs);
}

export function getExportTimelineDurationMs(segments: ExportTimelineSegment[]) {
	const last = segments.at(-1);
	return last ? last.outputStartMs + (last.endMs - last.startMs) / last.speed : 0;
}
