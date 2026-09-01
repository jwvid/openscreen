import { useEffect, useRef, useState } from "react";
import type { TrimRegion } from "@/components/video-editor/types";
import { CURSOR_SOUND_ASSET_PATHS, readCursorSoundAsset } from "@/lib/cursor/cursorSoundAssets";
import {
	type SourceCursorSoundEvent,
	selectCursorSoundPreviewEvents,
} from "@/lib/cursor/cursorSounds";

const PREVIEW_GAIN = 0.82;
const PLAY_START_GRACE_MS = 60;
const MIN_CONTINUOUS_ADVANCE_MS = 120;

type CursorSoundPreviewUrls = Record<SourceCursorSoundEvent["kind"], string>;

interface CursorSoundPreviewOptions {
	enabled: boolean;
	isPlaying: boolean;
	currentTimeMs: number;
	playbackRate: number;
	events: SourceCursorSoundEvent[];
	trimRegions: TrimRegion[];
	sourceKey: string | null;
}

interface PreviousPlaybackState {
	sourceKey: string | null;
	timeMs: number;
	wallTimeMs: number;
	playing: boolean;
	ready: boolean;
}

function stopActiveSounds(activeSounds: Set<HTMLAudioElement>) {
	for (const audio of activeSounds) {
		audio.pause();
		audio.removeAttribute("src");
		audio.load();
	}
	activeSounds.clear();
}

export function useCursorSoundPreview({
	enabled,
	isPlaying,
	currentTimeMs,
	playbackRate,
	events,
	trimRegions,
	sourceKey,
}: CursorSoundPreviewOptions) {
	const shouldLoad = enabled && events.length > 0;
	const [soundUrls, setSoundUrls] = useState<CursorSoundPreviewUrls | null>(null);
	const activeSoundsRef = useRef(new Set<HTMLAudioElement>());
	const previousPlaybackRef = useRef<PreviousPlaybackState | null>(null);
	const reportedPlaybackErrorRef = useRef(false);

	useEffect(() => {
		if (!shouldLoad) {
			setSoundUrls(null);
			return;
		}

		let cancelled = false;
		let loadedUrls: CursorSoundPreviewUrls | null = null;
		const kinds = Object.keys(CURSOR_SOUND_ASSET_PATHS) as SourceCursorSoundEvent["kind"][];

		Promise.all(
			kinds.map(async (kind) => {
				const bytes = await readCursorSoundAsset(kind);
				return [kind, URL.createObjectURL(new Blob([bytes], { type: "audio/mpeg" }))] as const;
			}),
		)
			.then((entries) => {
				loadedUrls = Object.fromEntries(entries) as CursorSoundPreviewUrls;
				if (cancelled) {
					for (const url of Object.values(loadedUrls)) URL.revokeObjectURL(url);
					return;
				}
				setSoundUrls(loadedUrls);
			})
			.catch((error) => {
				if (!cancelled) console.warn("Unable to load mouse sound preview:", error);
			});

		return () => {
			cancelled = true;
			if (loadedUrls) {
				for (const url of Object.values(loadedUrls)) URL.revokeObjectURL(url);
			}
		};
	}, [shouldLoad]);

	useEffect(() => {
		if (enabled && isPlaying) return;
		stopActiveSounds(activeSoundsRef.current);
	}, [enabled, isPlaying]);

	useEffect(() => {
		const now = performance.now();
		const ready = soundUrls !== null;
		const previous = previousPlaybackRef.current;
		if (previous && previous.sourceKey !== sourceKey) {
			stopActiveSounds(activeSoundsRef.current);
		}
		const nextState: PreviousPlaybackState = {
			sourceKey,
			timeMs: currentTimeMs,
			wallTimeMs: now,
			playing: isPlaying,
			ready,
		};

		if (!enabled || !isPlaying || !soundUrls || events.length === 0) {
			previousPlaybackRef.current = nextState;
			return;
		}

		const enteringAudiblePlayback =
			!previous || previous.sourceKey !== sourceKey || !previous.playing || !previous.ready;
		let previewEvents: SourceCursorSoundEvent[] = [];

		if (enteringAudiblePlayback) {
			previewEvents = selectCursorSoundPreviewEvents(
				events,
				currentTimeMs - PLAY_START_GRACE_MS,
				currentTimeMs,
				{ includeStart: true, trimRegions },
			);
		} else {
			const mediaAdvanceMs = currentTimeMs - previous.timeMs;
			const wallAdvanceMs = Math.max(0, now - previous.wallTimeMs);
			const effectiveRate = Math.min(8, Math.max(0.25, playbackRate || 1));
			const maxContinuousAdvanceMs = Math.max(
				MIN_CONTINUOUS_ADVANCE_MS,
				wallAdvanceMs * effectiveRate * 3 + 50,
			);

			// A discontinuity is a seek or a trim jump. Starting a new playback
			// window there prevents sounds from the skipped section from firing.
			if (mediaAdvanceMs >= -1 && mediaAdvanceMs <= maxContinuousAdvanceMs) {
				previewEvents = selectCursorSoundPreviewEvents(events, previous.timeMs, currentTimeMs, {
					trimRegions,
				});
			}
		}

		for (const event of previewEvents) {
			const audio = new Audio(soundUrls[event.kind]);
			audio.preload = "auto";
			audio.volume = PREVIEW_GAIN;
			activeSoundsRef.current.add(audio);
			const cleanup = () => activeSoundsRef.current.delete(audio);
			audio.addEventListener("ended", cleanup, { once: true });
			audio.addEventListener("error", cleanup, { once: true });
			audio.play().catch((error) => {
				cleanup();
				if (!reportedPlaybackErrorRef.current) {
					reportedPlaybackErrorRef.current = true;
					console.warn("Unable to play mouse sound preview:", error);
				}
			});
		}

		previousPlaybackRef.current = nextState;
	}, [currentTimeMs, enabled, events, isPlaying, playbackRate, soundUrls, sourceKey, trimRegions]);

	useEffect(
		() => () => {
			stopActiveSounds(activeSoundsRef.current);
		},
		[],
	);
}
