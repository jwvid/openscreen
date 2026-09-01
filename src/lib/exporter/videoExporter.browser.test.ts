import { BlobSource, Input, Mp4InputFormat } from "mediabunny";
import { describe, expect, it, vi } from "vitest";
import sampleVideoUrl from "../../../tests/fixtures/sample.webm?url";
import sampleVideoWithAudioUrl from "../../../tests/fixtures/sample-with-audio.webm?url";
import type { CursorRecordingData } from "../../native/contracts";
import { BackgroundLoadError } from "../wallpaper";
import type { ExportProgress } from "./types";
import { VideoExporter } from "./videoExporter";

describe("VideoExporter (real browser)", () => {
	it("exports a valid MP4 blob from a real video", async () => {
		const progressEvents: ExportProgress[] = [];

		const exporter = new VideoExporter({
			videoUrl: sampleVideoUrl,
			width: 320,
			height: 180,
			frameRate: 15,
			bitrate: 1_000_000,
			wallpaper: "#1a1a2e",
			zoomRegions: [],
			showShadow: false,
			shadowIntensity: 0,
			showBlur: false,
			cropRegion: { x: 0, y: 0, width: 1, height: 1 },
			onProgress: (p) => progressEvents.push(p),
		});

		const result = await exporter.export();

		expect(result.success, result.error).toBe(true);
		expect(result.blob).toBeInstanceOf(Blob);

		const buf = await result.blob!.arrayBuffer();
		const bytes = new Uint8Array(buf);
		const ftyp = new TextDecoder().decode(bytes.slice(4, 8));
		expect(ftyp).toBe("ftyp");

		expect(result.blob!.size).toBeGreaterThan(1024);

		expect(progressEvents.length).toBeGreaterThan(0);

		const finalizing = progressEvents.filter((p) => p.phase === "finalizing");
		expect(finalizing.length).toBeGreaterThan(0);
		expect(finalizing.at(-1)!.percentage).toBe(100);
	});

	it("exports successfully with an image wallpaper (served by Vite dev server)", async () => {
		const exporter = new VideoExporter({
			videoUrl: sampleVideoUrl,
			width: 320,
			height: 180,
			frameRate: 15,
			bitrate: 1_000_000,
			wallpaper: "/wallpapers/wallpaper1.jpg",
			zoomRegions: [],
			showShadow: false,
			shadowIntensity: 0,
			showBlur: false,
			cropRegion: { x: 0, y: 0, width: 1, height: 1 },
		});

		const result = await exporter.export();
		expect(result.success, result.error).toBe(true);
		expect(result.blob!.size).toBeGreaterThan(1024);
	});

	it("uses the direct cursor renderer when the source fills the output", async () => {
		const cursorSvg = encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><path fill="white" stroke="black" d="M3 2v17l5-5 4 8 3-2-4-7 7-1z"/></svg>',
		);
		const cursorRecordingData: CursorRecordingData = {
			version: 2,
			provider: "native",
			assets: [
				{
					id: "direct-arrow",
					platform: "darwin",
					imageDataUrl: `data:image/svg+xml;charset=utf-8,${cursorSvg}`,
					width: 24,
					height: 24,
					hotspotX: 3,
					hotspotY: 2,
					cursorType: "arrow",
				},
			],
			samples: [
				{ timeMs: 0, cx: 0.2, cy: 0.3, visible: true, assetId: "direct-arrow" },
				{
					timeMs: 500,
					cx: 0.5,
					cy: 0.5,
					visible: true,
					assetId: "direct-arrow",
					interactionType: "click",
				},
			],
		};
		const infoSpy = vi.spyOn(console, "info");
		const exporter = new VideoExporter({
			videoUrl: sampleVideoWithAudioUrl,
			width: 640,
			height: 480,
			frameRate: 15,
			bitrate: 1_500_000,
			wallpaper: "#000000",
			zoomRegions: [],
			showShadow: true,
			shadowIntensity: 0.5,
			showBlur: true,
			cropRegion: { x: 0, y: 0, width: 1, height: 1 },
			cursorRecordingData,
			cursorScale: 1.5,
			cursorClickDarken: 0.4,
			includeCursorSounds: true,
		});

		const result = await exporter.export();

		expect(result.success, result.error).toBe(true);
		expect(result.blob!.size).toBeGreaterThan(1024);
		expect(infoSpy).toHaveBeenCalledWith(
			"[VideoExporter] performance",
			expect.objectContaining({ renderMode: "direct-cursor", resolution: "640x480" }),
		);
		infoSpy.mockRestore();
	});

	it("preserves the full effects pipeline while exporting", async () => {
		const cursorSvg = encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="white" stroke="black" stroke-width="1.5" d="M3 2v17l4.6-4.2 3.2 6.2 3-1.5-3.1-6.1 6.3-.8z"/></svg>',
		);
		const cursorRecordingData: CursorRecordingData = {
			version: 2,
			provider: "native",
			assets: [
				{
					id: "test-arrow",
					platform: "darwin",
					imageDataUrl: `data:image/svg+xml;charset=utf-8,${cursorSvg}`,
					width: 24,
					height: 24,
					hotspotX: 3,
					hotspotY: 2,
					cursorType: "arrow",
				},
			],
			samples: [
				{ timeMs: 0, cx: 0.25, cy: 0.3, visible: true, assetId: "test-arrow" },
				{
					timeMs: 700,
					cx: 0.5,
					cy: 0.5,
					visible: true,
					assetId: "test-arrow",
					interactionType: "click",
				},
				{ timeMs: 1200, cx: 0.75, cy: 0.6, visible: true, assetId: "test-arrow" },
			],
		};

		const exporter = new VideoExporter({
			videoUrl: sampleVideoWithAudioUrl,
			width: 640,
			height: 360,
			frameRate: 30,
			bitrate: 2_500_000,
			wallpaper: "/wallpapers/wallpaper1.jpg",
			zoomRegions: [
				{
					id: "effect-regression-zoom",
					startMs: 250,
					endMs: 1600,
					depth: 2,
					focus: { cx: 0.65, cy: 0.45 },
				},
			],
			showShadow: true,
			shadowIntensity: 0.45,
			showBlur: true,
			motionBlurAmount: 0.2,
			borderRadius: 14,
			padding: 8,
			cropRegion: { x: 0, y: 0, width: 1, height: 1 },
			cursorRecordingData,
			cursorScale: 2,
			cursorSmoothing: 0.5,
			cursorMotionBlur: 0.2,
			cursorClickBounce: 2.5,
			cursorClickDarken: 0.2,
			includeCursorSounds: true,
		});

		const result = await exporter.export();

		expect(result.success, result.error).toBe(true);
		expect(result.blob).toBeInstanceOf(Blob);
		expect(result.blob!.size).toBeGreaterThan(1024);
		const bytes = new Uint8Array(await result.blob!.arrayBuffer());
		expect(new TextDecoder().decode(bytes.slice(4, 8))).toBe("ftyp");

		const input = new Input({
			formats: [new Mp4InputFormat()],
			source: new BlobSource(result.blob!),
		});
		const audioTracks = await input.getAudioTracks();
		expect(audioTracks).toHaveLength(2);
		expect(audioTracks.map((track) => track.name)).toEqual(["Original Audio", "Mouse Clicks"]);
		expect(audioTracks[1].numberOfChannels).toBe(2);
		input.dispose();
	});

	it("throws BackgroundLoadError when wallpaper fails to load (no silent black fallback)", async () => {
		const exporter = new VideoExporter({
			videoUrl: sampleVideoUrl,
			width: 320,
			height: 180,
			frameRate: 15,
			bitrate: 1_000_000,
			wallpaper: "/wallpapers/does-not-exist.jpg",
			zoomRegions: [],
			showShadow: false,
			shadowIntensity: 0,
			showBlur: false,
			cropRegion: { x: 0, y: 0, width: 1, height: 1 },
		});

		const rejection = exporter.export();
		await expect(rejection).rejects.toBeInstanceOf(BackgroundLoadError);
		await expect(rejection).rejects.toMatchObject({
			url: expect.stringContaining("does-not-exist"),
		});
	});
});
