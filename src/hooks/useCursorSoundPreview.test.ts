import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCursorSoundPreview } from "./useCursorSoundPreview";

describe("useCursorSoundPreview", () => {
	const originalElectronApi = window.electronAPI;
	const readBundledAsset = vi.fn().mockResolvedValue({
		success: true,
		data: new ArrayBuffer(8),
	});
	let playSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		readBundledAsset.mockClear();
		window.electronAPI = { readBundledAsset } as unknown as ElectronAPI;
		let nextUrl = 0;
		vi.stubGlobal("URL", {
			...URL,
			createObjectURL: vi.fn(() => {
				nextUrl += 1;
				return `blob:cursor-sound-${nextUrl}`;
			}),
			revokeObjectURL: vi.fn(),
		});
		playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
		vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
		vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => undefined);
	});

	afterEach(() => {
		cleanup();
		window.electronAPI = originalElectronApi;
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("plays a click once when preview playback crosses its source time", async () => {
		const state = {
			enabled: true,
			isPlaying: false,
			currentTimeMs: 0,
			playbackRate: 1,
			events: [{ kind: "click" as const, sourceTimeMs: 100 }],
			trimRegions: [],
			sourceKey: "/recordings/example.webm",
		};
		const { rerender } = renderHook(() => useCursorSoundPreview(state));

		await waitFor(() => expect(readBundledAsset).toHaveBeenCalledTimes(3));
		await act(async () => {
			state.isPlaying = true;
			rerender();
			state.currentTimeMs = 110;
			rerender();
		});

		expect(playSpy).toHaveBeenCalledTimes(1);

		act(() => {
			state.currentTimeMs = 125;
			rerender();
		});
		expect(playSpy).toHaveBeenCalledTimes(1);
	});

	it("does not emit skipped sounds after a seek discontinuity", async () => {
		const state = {
			enabled: true,
			isPlaying: false,
			currentTimeMs: 0,
			playbackRate: 1,
			events: [{ kind: "click" as const, sourceTimeMs: 1_000 }],
			trimRegions: [],
			sourceKey: "/recordings/example.webm",
		};
		const { rerender } = renderHook(() => useCursorSoundPreview(state));

		await waitFor(() => expect(readBundledAsset).toHaveBeenCalledTimes(3));
		await act(async () => {
			state.isPlaying = true;
			rerender();
			state.currentTimeMs = 2_000;
			rerender();
		});

		expect(playSpy).not.toHaveBeenCalled();
	});
});
