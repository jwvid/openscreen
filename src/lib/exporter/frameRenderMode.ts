import type { CropRegion } from "@/components/video-editor/types";

export interface DirectRenderEligibilityConfig {
	width: number;
	height: number;
	videoWidth: number;
	videoHeight: number;
	cropRegion: CropRegion;
	padding?: number;
	borderRadius?: number;
	webcamSize?: { width: number; height: number } | null;
	zoomRegions?: Array<{ startMs: number; endMs: number }>;
	annotationRegions?: Array<{ startMs: number; endMs: number }>;
}

const DIRECT_RENDER_EPSILON = 0.0001;

function hasActiveRegions(regions?: Array<{ startMs: number; endMs: number }>) {
	return Boolean(regions?.some((region) => region.endMs - region.startMs > DIRECT_RENDER_EPSILON));
}

export function isDirectCursorRenderEligible(config: DirectRenderEligibilityConfig): boolean {
	const crop = config.cropRegion;
	const isDefaultCrop =
		Math.abs(crop.x) <= DIRECT_RENDER_EPSILON &&
		Math.abs(crop.y) <= DIRECT_RENDER_EPSILON &&
		Math.abs(crop.width - 1) <= DIRECT_RENDER_EPSILON &&
		Math.abs(crop.height - 1) <= DIRECT_RENDER_EPSILON;

	return (
		config.width === config.videoWidth &&
		config.height === config.videoHeight &&
		isDefaultCrop &&
		Math.abs(config.padding ?? 0) <= DIRECT_RENDER_EPSILON &&
		Math.abs(config.borderRadius ?? 0) <= DIRECT_RENDER_EPSILON &&
		!config.webcamSize &&
		!hasActiveRegions(config.zoomRegions) &&
		!hasActiveRegions(config.annotationRegions)
	);
}
