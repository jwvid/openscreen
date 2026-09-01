import { describe, expect, it } from "vitest";
import { getExactStreamChunkBuffer, getExportVideoMuxerCodec } from "./muxer";

describe("getExportVideoMuxerCodec", () => {
	it("routes HEVC WebCodecs strings to the HEVC MP4 packet source", () => {
		expect(getExportVideoMuxerCodec("hvc1.1.6.H156.B0")).toBe("hevc");
		expect(getExportVideoMuxerCodec("hev1.1.6.L123.B0")).toBe("hevc");
	});

	it("keeps AVC and unspecified codecs on the AVC packet source", () => {
		expect(getExportVideoMuxerCodec("avc1.640034")).toBe("avc");
		expect(getExportVideoMuxerCodec()).toBe("avc");
	});
});

describe("getExactStreamChunkBuffer", () => {
	it("copies only the visible bytes of a subarray", () => {
		const backing = new Uint8Array([10, 20, 30, 40, 50]);
		const chunk = backing.subarray(1, 4) as Uint8Array<ArrayBuffer>;

		expect(Array.from(new Uint8Array(getExactStreamChunkBuffer(chunk)))).toEqual([20, 30, 40]);
	});

	it("reuses an already exact ArrayBuffer", () => {
		const chunk = new Uint8Array([1, 2, 3]) as Uint8Array<ArrayBuffer>;
		expect(getExactStreamChunkBuffer(chunk)).toBe(chunk.buffer);
	});
});
