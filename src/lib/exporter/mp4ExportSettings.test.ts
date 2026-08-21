import { describe, expect, it } from "vitest";
import {
	calculateEffectiveSourceDimensions,
	calculateMp4ExportSettings,
	selectMp4ExportCodec,
} from "./mp4ExportSettings";

describe("calculateMp4ExportSettings", () => {
	it("keeps 4K explicit even when it upscales shorter native captures", () => {
		const aspectRatioValue = 1920 / 1032;

		expect(
			calculateMp4ExportSettings({
				quality: "good",
				sourceWidth: 1920,
				sourceHeight: 1032,
				aspectRatioValue,
			}),
		).toMatchObject({
			width: 4018,
			height: 2160,
			bitrate: 100_000_000,
		});

		expect(
			calculateMp4ExportSettings({
				quality: "source",
				sourceWidth: 1920,
				sourceHeight: 1032,
				aspectRatioValue,
			}),
		).toMatchObject({
			width: 1920,
			height: 1032,
			bitrate: 40_000_000,
		});
	});

	it("keeps lower quality presets below the source size when downscaling is useful", () => {
		expect(
			calculateMp4ExportSettings({
				quality: "medium",
				sourceWidth: 1920,
				sourceHeight: 1032,
				aspectRatioValue: 1920 / 1032,
			}),
		).toMatchObject({
			width: 2008,
			height: 1080,
			bitrate: 35_000_000,
		});
	});

	it("keeps 4K explicit even for 720p source dimensions", () => {
		expect(
			calculateMp4ExportSettings({
				quality: "good",
				sourceWidth: 1280,
				sourceHeight: 720,
				aspectRatioValue: 16 / 9,
			}),
		).toMatchObject({
			width: 3840,
			height: 2160,
			bitrate: 100_000_000,
		});
	});

	it("preserves source-sized High exports when the source is already 1080p or larger", () => {
		expect(
			calculateMp4ExportSettings({
				quality: "source",
				sourceWidth: 1920,
				sourceHeight: 1080,
				aspectRatioValue: 16 / 9,
			}),
		).toMatchObject({
			width: 1920,
			height: 1080,
			bitrate: 40_000_000,
		});

		expect(
			calculateMp4ExportSettings({
				quality: "source",
				sourceWidth: 3840,
				sourceHeight: 2160,
				aspectRatioValue: 16 / 9,
			}),
		).toMatchObject({
			width: 3840,
			height: 2160,
			bitrate: 120_000_000,
		});
	});

	it("keeps portrait presets on the short side", () => {
		expect(
			calculateMp4ExportSettings({
				quality: "good",
				sourceWidth: 1080,
				sourceHeight: 1920,
				aspectRatioValue: 9 / 16,
			}),
		).toMatchObject({
			width: 2160,
			height: 3840,
			bitrate: 100_000_000,
		});
	});

	it("uses the cropped area as the effective source size", () => {
		const effectiveSource = calculateEffectiveSourceDimensions(3840, 2160, {
			width: 854 / 3840,
			height: 480 / 2160,
		});

		expect(effectiveSource).toEqual({
			width: 854,
			height: 480,
		});

		expect(
			calculateMp4ExportSettings({
				quality: "source",
				sourceWidth: effectiveSource.width,
				sourceHeight: effectiveSource.height,
				aspectRatioValue: effectiveSource.width / effectiveSource.height,
			}),
		).toMatchObject({
			width: 854,
			height: 480,
			bitrate: 40_000_000,
		});

		expect(
			calculateMp4ExportSettings({
				quality: "good",
				sourceWidth: effectiveSource.width,
				sourceHeight: effectiveSource.height,
				aspectRatioValue: effectiveSource.width / effectiveSource.height,
			}),
		).toMatchObject({
			width: 3842,
			height: 2160,
			bitrate: 100_000_000,
		});
	});

	it("uses HEVC only when original output exceeds H.264 hardware dimensions", () => {
		expect(selectMp4ExportCodec(3840, 2160)).toBe("avc1.640034");
		expect(selectMp4ExportCodec(4096, 2304)).toBe("avc1.640034");
		expect(selectMp4ExportCodec(5120, 2880)).toBe("hvc1.1.6.H156.B0");
	});
});
