import {
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacket,
	EncodedVideoPacketSource,
	Mp4OutputFormat,
	Output,
	StreamTarget,
	type StreamTargetChunk,
} from "mediabunny";
import type { ExportConfig } from "./types";

export type ExportAudioMuxerCodec = "aac" | "opus";
export type ExportAudioTrackId = "source" | "cursor-sounds";

export interface ExportAudioTrackConfig {
	id: ExportAudioTrackId;
	codec: ExportAudioMuxerCodec;
	name: string;
	isDefault: boolean;
}

export type ExportVideoMuxerCodec = "avc" | "hevc";

export function getExportVideoMuxerCodec(codec?: string): ExportVideoMuxerCodec {
	if (codec && /^(?:hvc1|hev1)(?:\.|$)/i.test(codec)) {
		return "hevc";
	}
	return "avc";
}

export function getExactStreamChunkBuffer(data: Uint8Array<ArrayBuffer>): ArrayBuffer {
	if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
		return data.buffer;
	}
	return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

export class VideoMuxer {
	private output: Output | null = null;
	private videoSource: EncodedVideoPacketSource | null = null;
	private audioSources = new Map<ExportAudioTrackId, EncodedAudioPacketSource>();
	private target: BufferTarget | StreamTarget | null = null;
	private bufferTarget: BufferTarget | null = null;
	private config: ExportConfig;
	private audioTracks: ExportAudioTrackConfig[];
	private outputPath: string | undefined;
	private exportStreamId: string | null = null;

	constructor(
		config: ExportConfig,
		audioTracks: ExportAudioTrackConfig[] = [],
		outputPath?: string,
	) {
		this.config = config;
		this.audioTracks = audioTracks;
		this.outputPath = outputPath;
	}

	async initialize(): Promise<void> {
		if (this.outputPath && window.electronAPI?.startExportWrite) {
			const startResult = await window.electronAPI.startExportWrite(this.outputPath);
			if (!startResult.success || !startResult.id) {
				throw new Error(startResult.message || startResult.error || "Failed to start MP4 output");
			}

			this.exportStreamId = startResult.id;
			const writable = new WritableStream<StreamTargetChunk>({
				write: async (chunk) => {
					if (!this.exportStreamId) {
						throw new Error("MP4 output stream was closed unexpectedly");
					}
					const result = await window.electronAPI.writeExportChunk(
						this.exportStreamId,
						getExactStreamChunkBuffer(chunk.data),
						chunk.position,
					);
					if (!result.success) {
						throw new Error(result.message || result.error || "Failed to write MP4 output");
					}
				},
			});
			this.target = new StreamTarget(writable, {
				chunked: true,
				chunkSize: 16 * 1024 * 1024,
			});
		} else {
			this.bufferTarget = new BufferTarget();
			this.target = this.bufferTarget;
		}

		try {
			this.output = new Output({
				format: new Mp4OutputFormat({
					fastStart: "in-memory",
				}),
				target: this.target,
			});

			this.videoSource = new EncodedVideoPacketSource(getExportVideoMuxerCodec(this.config.codec));
			this.output.addVideoTrack(this.videoSource, {
				frameRate: this.config.frameRate,
			});

			for (const track of this.audioTracks) {
				const source = new EncodedAudioPacketSource(track.codec);
				this.audioSources.set(track.id, source);
				this.output.addAudioTrack(source, {
					name: track.name,
					disposition: {
						default: track.isDefault,
						original: track.id === "source",
					},
				});
			}

			await this.output.start();
		} catch (error) {
			await this.finishStream(true);
			throw error;
		}
	}

	async addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Promise<void> {
		if (!this.videoSource) {
			throw new Error("Muxer not initialized");
		}

		const packet = EncodedPacket.fromEncodedChunk(chunk);

		await this.videoSource.add(packet, meta);
	}

	async addAudioChunk(
		trackId: ExportAudioTrackId,
		chunk: EncodedAudioChunk,
		meta?: EncodedAudioChunkMetadata,
	): Promise<void> {
		const source = this.audioSources.get(trackId);
		if (!source) {
			throw new Error(`Audio track is not configured for this muxer: ${trackId}`);
		}

		const packet = EncodedPacket.fromEncodedChunk(chunk);

		await source.add(packet, meta);
	}

	async finalize(): Promise<Blob | null> {
		if (!this.output || !this.target) {
			throw new Error("Muxer not initialized");
		}

		try {
			await this.output.finalize();
			if (this.exportStreamId) {
				await this.finishStream(false);
				return null;
			}
		} catch (error) {
			await this.finishStream(true);
			throw error;
		}

		const buffer = this.bufferTarget?.buffer;

		if (!buffer) {
			throw new Error("Failed to finalize output");
		}

		return new Blob([buffer], { type: "video/mp4" });
	}

	async cancel(): Promise<void> {
		try {
			if (this.output && this.output.state !== "finalized" && this.output.state !== "canceled") {
				await this.output.cancel();
			}
		} finally {
			await this.finishStream(true);
		}
	}

	private async finishStream(discard: boolean): Promise<void> {
		const id = this.exportStreamId;
		if (!id) return;
		this.exportStreamId = null;
		const result = await window.electronAPI.finishExportWrite(id, discard);
		if (!result.success && !discard) {
			throw new Error(result.message || result.error || "Failed to finish MP4 output");
		}
	}
}
