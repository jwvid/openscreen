import { CURSOR_SOUND_ASSET_PATHS, readCursorSoundAsset } from "@/lib/cursor/cursorSoundAssets";
import type { CursorSoundKind, ExportCursorSoundEvent } from "@/lib/cursor/cursorSounds";
import type { ExportAudioCodec } from "./audioEncoder";
import type { ExportAudioTrackId, VideoMuxer } from "./muxer";

const AUDIO_BITRATE = 128_000;
const AUDIO_FRAME_SIZE = 1024;
const SOUND_GAIN = 0.82;

export interface DecodedCursorSound {
	sampleRate: number;
	channels: Float32Array[];
}

export type DecodedCursorSoundLibrary = Record<CursorSoundKind, DecodedCursorSound>;

export async function loadCursorSoundLibrary(
	sampleRate: number,
): Promise<DecodedCursorSoundLibrary> {
	const context = new AudioContext({ sampleRate });
	try {
		const entries = await Promise.all(
			(Object.keys(CURSOR_SOUND_ASSET_PATHS) as CursorSoundKind[]).map(async (kind) => {
				const bytes = await readCursorSoundAsset(kind);
				const audioBuffer = await context.decodeAudioData(bytes.slice(0));
				return [
					kind,
					{
						sampleRate: audioBuffer.sampleRate,
						channels: Array.from({ length: audioBuffer.numberOfChannels }, (_, channel) =>
							audioBuffer.getChannelData(channel).slice(),
						),
					},
				] as const;
			}),
		);
		return Object.fromEntries(entries) as DecodedCursorSoundLibrary;
	} finally {
		await context.close().catch(() => undefined);
	}
}

/** Mixes the effects that overlap one planar float audio frame. */
export function mixCursorSoundsIntoPlanarFrame(
	output: Float32Array,
	numberOfFrames: number,
	numberOfChannels: number,
	sampleRate: number,
	frameStartTimeUs: number,
	events: ExportCursorSoundEvent[],
	library: DecodedCursorSoundLibrary,
) {
	const frameStartSample = Math.round((frameStartTimeUs / 1_000_000) * sampleRate);
	const frameEndSample = frameStartSample + numberOfFrames;

	for (const event of events) {
		const clip = library[event.kind];
		if (!clip?.channels.length || clip.sampleRate !== sampleRate) continue;
		const clipFrames = clip.channels[0].length;
		const eventStartSample = Math.round((event.timeMs / 1000) * sampleRate);
		const eventEndSample = eventStartSample + clipFrames;
		if (eventStartSample >= frameEndSample) break;
		if (eventEndSample <= frameStartSample) continue;

		const targetStart = Math.max(0, eventStartSample - frameStartSample);
		const sourceStart = Math.max(0, frameStartSample - eventStartSample);
		const framesToCopy = Math.min(numberOfFrames - targetStart, clipFrames - sourceStart);

		for (let channel = 0; channel < numberOfChannels; channel++) {
			const sourceChannel = clip.channels[Math.min(channel, clip.channels.length - 1)];
			const outputOffset = channel * numberOfFrames + targetStart;
			for (let frame = 0; frame < framesToCopy; frame++) {
				const index = outputOffset + frame;
				output[index] = Math.max(
					-1,
					Math.min(1, output[index] + sourceChannel[sourceStart + frame] * SOUND_GAIN),
				);
			}
		}
	}
}

export class CursorSoundAudioProcessor {
	private cancelled = false;

	async process(
		muxer: VideoMuxer,
		trackId: ExportAudioTrackId,
		events: ExportCursorSoundEvent[],
		durationSec: number,
		exportCodec: ExportAudioCodec,
	): Promise<void> {
		if (!events.length || durationSec <= 0 || this.cancelled) return;

		const sampleRate = exportCodec.sampleRate || 48_000;
		const numberOfChannels = exportCodec.numberOfChannels || 2;
		const library = await loadCursorSoundLibrary(sampleRate);
		if (this.cancelled) return;

		const encodeConfig: AudioEncoderConfig = {
			codec: exportCodec.encoderCodec,
			sampleRate,
			numberOfChannels,
			bitrate: AUDIO_BITRATE,
		};
		const support = await AudioEncoder.isConfigSupported(encodeConfig);
		if (!support.supported) {
			throw new Error(`${exportCodec.label} encoding is unavailable for mouse sounds`);
		}

		const encodedChunks: Array<{
			chunk: EncodedAudioChunk;
			meta?: EncodedAudioChunkMetadata;
		}> = [];
		const encoder = new AudioEncoder({
			output: (chunk, meta) => encodedChunks.push({ chunk, meta }),
			error: (error) => console.error("[CursorSoundAudioProcessor] Encode error:", error),
		});
		encoder.configure(encodeConfig);

		const totalFrames = Math.ceil(durationSec * sampleRate);
		for (let startFrame = 0; startFrame < totalFrames && !this.cancelled; ) {
			const frameCount = Math.min(AUDIO_FRAME_SIZE, totalFrames - startFrame);
			const timestampUs = Math.round((startFrame / sampleRate) * 1_000_000);
			const data = new Float32Array(frameCount * numberOfChannels);
			mixCursorSoundsIntoPlanarFrame(
				data,
				frameCount,
				numberOfChannels,
				sampleRate,
				timestampUs,
				events,
				library,
			);
			const audioData = new AudioData({
				format: "f32-planar",
				sampleRate,
				numberOfFrames: frameCount,
				numberOfChannels,
				timestamp: timestampUs,
				data: data.buffer,
			});
			encoder.encode(audioData);
			audioData.close();
			startFrame += frameCount;

			while (encoder.encodeQueueSize > 20 && !this.cancelled) {
				await new Promise((resolve) => setTimeout(resolve, 1));
			}
		}

		if (encoder.state === "configured") {
			await encoder.flush();
			encoder.close();
		}

		for (const { chunk, meta } of encodedChunks) {
			if (this.cancelled) break;
			await muxer.addAudioChunk(trackId, chunk, meta);
		}
	}

	cancel() {
		this.cancelled = true;
	}
}
