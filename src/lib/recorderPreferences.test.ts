import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRecorderPreferences, saveRecorderPreferences } from "./recorderPreferences";

afterEach(() => vi.unstubAllGlobals());
describe("recorder preferences", () => {
	it("restores device and audio choices across launches", () => {
		const memory = new Map<string, string>();
		vi.stubGlobal("localStorage", {
			getItem: (key: string) => memory.get(key),
			setItem: (key: string, value: string) => memory.set(key, value),
		});
		const settings = {
			microphoneEnabled: true,
			systemAudioEnabled: false,
			webcamEnabled: true,
			microphoneDeviceId: "mic-2",
			microphoneDeviceName: "USB Mic",
			webcamDeviceId: "cam-2",
			webcamDeviceName: "USB Camera",
			cursorCaptureMode: "system" as const,
		};
		saveRecorderPreferences(settings);
		expect(loadRecorderPreferences()).toEqual(settings);
	});
	it.each(["{broken", "null", "3", "[]"])("uses safe defaults for %s", (value) => {
		vi.stubGlobal("localStorage", { getItem: () => value });
		expect(loadRecorderPreferences().microphoneEnabled).toBe(false);
		expect(loadRecorderPreferences().cursorCaptureMode).toBe("editable-overlay");
	});
	it("survives unavailable storage", () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("unavailable");
			},
			setItem: () => {
				throw new Error("unavailable");
			},
		});
		expect(() => saveRecorderPreferences(loadRecorderPreferences())).not.toThrow();
	});
});
