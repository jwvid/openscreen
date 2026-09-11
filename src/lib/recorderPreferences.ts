import type { CursorCaptureMode } from "./recordingSession";

export interface RecorderPreferences {
	microphoneEnabled: boolean;
	systemAudioEnabled: boolean;
	webcamEnabled: boolean;
	microphoneDeviceId?: string;
	microphoneDeviceName?: string;
	webcamDeviceId?: string;
	webcamDeviceName?: string;
	cursorCaptureMode: CursorCaptureMode;
}

const KEY = "openscreen_recorder_preferences";
export function loadRecorderPreferences(): RecorderPreferences {
	let raw: Partial<RecorderPreferences> = {};
	try {
		raw = JSON.parse(localStorage.getItem(KEY) || "{}") ?? {};
	} catch {
		/* Use defaults if storage is unavailable or damaged. */
	}
	return {
		microphoneEnabled: raw.microphoneEnabled === true,
		systemAudioEnabled: raw.systemAudioEnabled === true,
		webcamEnabled: raw.webcamEnabled === true,
		microphoneDeviceId:
			typeof raw.microphoneDeviceId === "string" ? raw.microphoneDeviceId : undefined,
		microphoneDeviceName:
			typeof raw.microphoneDeviceName === "string" ? raw.microphoneDeviceName : undefined,
		webcamDeviceId: typeof raw.webcamDeviceId === "string" ? raw.webcamDeviceId : undefined,
		webcamDeviceName: typeof raw.webcamDeviceName === "string" ? raw.webcamDeviceName : undefined,
		cursorCaptureMode: raw.cursorCaptureMode === "system" ? "system" : "editable-overlay",
	};
}

export function saveRecorderPreferences(preferences: RecorderPreferences) {
	try {
		localStorage.setItem(KEY, JSON.stringify(preferences));
	} catch {
		/* Storage is optional. */
	}
}
