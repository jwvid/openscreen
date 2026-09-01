import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron, expect, test } from "@playwright/test";
import { BufferSource, Input, Mp4InputFormat } from "mediabunny";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const MAIN_JS = path.join(ROOT, "dist-electron/main.js");
const TEST_VIDEO = process.env.OPENSCREEN_E2E_VIDEO
	? path.resolve(process.env.OPENSCREEN_E2E_VIDEO)
	: path.join(__dirname, "../fixtures/sample.webm");

async function exportFromLoadedVideo(format: "gif" | "mp4"): Promise<Buffer> {
	const testUserDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-e2e-user-data-"));
	const preservedOutputPath = process.env.OPENSCREEN_E2E_OUTPUT
		? path.resolve(process.env.OPENSCREEN_E2E_OUTPUT)
		: null;
	const outputPath =
		preservedOutputPath ?? path.join(os.tmpdir(), `test-${format}-export-${Date.now()}.${format}`);
	let testVideoInRecordings = "";
	let testCursorDataPath = "";
	let testSessionDataPath = "";

	const app = await electron.launch({
		args: [
			MAIN_JS,
			`--user-data-dir=${testUserDataDir}`,
			// Required in CI sandbox environments (GitHub Actions, Docker, etc.)
			"--no-sandbox",
			// Force software WebGL in headless CI to avoid GPU framebuffer errors.
			"--enable-unsafe-swiftshader",
		],
		env: {
			...process.env,
			// Set HEADLESS=false to show windows while debugging.
			HEADLESS: process.env["HEADLESS"] ?? "true",
		},
	});
	const electronProcess = app.process();

	app.process().stdout?.on("data", (d) => process.stdout.write(`[electron] ${d}`));
	app.process().stderr?.on("data", (d) => process.stderr.write(`[electron] ${d}`));

	try {
		const hudWindow = await app.firstWindow({ timeout: 60_000 });
		await hudWindow.waitForLoadState("domcontentloaded");

		await app.evaluate(({ ipcMain }, targetPath: string) => {
			ipcMain.removeHandler("pick-export-save-path");
			ipcMain.removeHandler("write-export-to-path");
			ipcMain.handle("pick-export-save-path", () => ({
				success: true,
				path: targetPath,
				canceled: false,
			}));
			ipcMain.handle(
				"write-export-to-path",
				(_event: Electron.IpcMainInvokeEvent, buffer: ArrayBuffer, filePath: string) => {
					if (filePath !== targetPath) {
						return {
							success: false,
							error: `Unexpected export path: ${filePath}`,
						};
					}
					(globalThis as Record<string, unknown>)["__testExportData"] =
						Buffer.from(buffer).toString("base64");
					return { success: true, path: filePath };
				},
			);
		}, outputPath);

		const userDataDir = await app.evaluate(({ app: electronApp }) => {
			return electronApp.getPath("userData");
		});
		const recordingsDir = path.join(userDataDir, "recordings");
		testVideoInRecordings = path.join(recordingsDir, `test-sample${path.extname(TEST_VIDEO)}`);
		fs.mkdirSync(recordingsDir, { recursive: true });
		fs.copyFileSync(TEST_VIDEO, testVideoInRecordings);
		testCursorDataPath = `${testVideoInRecordings}.cursor.json`;
		fs.writeFileSync(
			testCursorDataPath,
			JSON.stringify({
				version: 2,
				provider: "native",
				assets: [
					{
						id: "test-arrow",
						platform: "darwin",
						imageDataUrl:
							"data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PHBhdGggZmlsbD0id2hpdGUiIHN0cm9rZT0iYmxhY2siIGQ9Ik0zIDJ2MTdsNS01IDQgOCAzLTItNC03IDctMXoiLz48L3N2Zz4=",
						width: 24,
						height: 24,
						hotspotX: 3,
						hotspotY: 2,
						cursorType: "arrow",
					},
				],
				samples: [
					{
						timeMs: 400,
						cx: 0.4,
						cy: 0.4,
						visible: true,
						assetId: "test-arrow",
						interactionType: "click",
					},
					{
						timeMs: 450,
						cx: 0.4,
						cy: 0.4,
						visible: true,
						assetId: "test-arrow",
						interactionType: "mouseup",
					},
					{
						timeMs: 900,
						cx: 0.3,
						cy: 0.4,
						visible: true,
						assetId: "test-arrow",
						interactionType: "click",
					},
					{
						timeMs: 1050,
						cx: 0.6,
						cy: 0.5,
						visible: true,
						assetId: "test-arrow",
						interactionType: "move",
					},
					{
						timeMs: 1200,
						cx: 0.7,
						cy: 0.5,
						visible: true,
						assetId: "test-arrow",
						interactionType: "mouseup",
					},
				],
			}),
		);
		testSessionDataPath = `${testVideoInRecordings}.session.json`;
		fs.writeFileSync(
			testSessionDataPath,
			JSON.stringify({
				screenVideoPath: testVideoInRecordings,
				createdAt: Date.now(),
				cursorCaptureMode: "editable-overlay",
			}),
		);

		await hudWindow.evaluate(
			(videoPath: string) => window.electronAPI.setCurrentVideoPath(videoPath),
			testVideoInRecordings,
		);
		await hudWindow.evaluate((session) => window.electronAPI.setCurrentRecordingSession(session), {
			screenVideoPath: testVideoInRecordings,
			createdAt: Date.now(),
			cursorCaptureMode: "editable-overlay",
		});
		try {
			await hudWindow.evaluate(() => window.electronAPI.switchToEditor());
		} catch (error) {
			if (
				!(error instanceof Error) ||
				!/closed|destroyed|target page|target closed/i.test(error.message)
			) {
				throw error;
			}
		}

		const editorWindow = await app.waitForEvent("window", {
			predicate: (w) => w.url().includes("windowType=editor"),
			timeout: 15_000,
		});
		await editorWindow.addInitScript(() => {
			const originalPlay = HTMLMediaElement.prototype.play;
			(globalThis as Record<string, unknown>)["__cursorPreviewPlayCount"] = 0;
			HTMLMediaElement.prototype.play = function () {
				if (this instanceof HTMLAudioElement && this.src.startsWith("blob:")) {
					const state = globalThis as Record<string, unknown>;
					state["__cursorPreviewPlayCount"] = Number(state["__cursorPreviewPlayCount"] ?? 0) + 1;
				}
				return originalPlay.call(this);
			};
		});
		const requestedPadding = Number(process.env.OPENSCREEN_E2E_PADDING);
		if (Number.isFinite(requestedPadding)) {
			await editorWindow.evaluate((padding: number) => {
				const key = "openscreen_user_preferences";
				const current = JSON.parse(localStorage.getItem(key) || "{}");
				localStorage.setItem(key, JSON.stringify({ ...current, padding }));
			}, requestedPadding);
		}

		// WebCodecs may not be registered in the renderer on first load.
		await editorWindow.reload();
		await editorWindow.waitForLoadState("domcontentloaded");
		await expect(editorWindow.getByText("Loading video...")).not.toBeVisible({
			timeout: 15_000,
		});

		await editorWindow.getByTestId("testId-export-panel-button").click();
		await editorWindow.getByTestId(`testId-${format}-format-button`).click();
		if (format === "mp4") {
			if (process.env.OPENSCREEN_E2E_SOURCE_QUALITY === "1") {
				await editorWindow.getByRole("button", { name: /Original|원본/ }).click();
			}
			const cursorSoundsSwitch = editorWindow.getByTestId("testId-cursor-sounds-switch");
			await expect(cursorSoundsSwitch).toBeEnabled();
			if ((await cursorSoundsSwitch.getAttribute("data-state")) !== "checked") {
				await cursorSoundsSwitch.click();
			}

			await editorWindow.getByTestId("testId-playback-toggle").click();
			await expect
				.poll(
					() =>
						editorWindow.evaluate(() =>
							Number((globalThis as Record<string, unknown>)["__cursorPreviewPlayCount"] ?? 0),
						),
					{ timeout: 10_000 },
				)
				.toBeGreaterThan(0);
			await editorWindow
				.locator("video")
				.first()
				.evaluate((video) => video.pause());
		}
		const exportStartedAt = performance.now();
		await editorWindow.getByTestId("testId-export-button").click();

		if (format === "mp4") {
			await expect
				.poll(() => fs.existsSync(outputPath) && fs.statSync(outputPath).size > 1024, {
					timeout: 90_000,
				})
				.toBe(true);
			// The streaming muxer creates the file before it has finished writing it.
			// Wait for the UI completion signal before validating or closing the app.
			await expect(editorWindow.getByText("Video exported successfully")).toBeVisible({
				timeout: 90_000,
			});
		} else {
			await expect
				.poll(
					() =>
						app.evaluate(() =>
							Boolean((globalThis as Record<string, unknown>)["__testExportData"]),
						),
					{ timeout: 90_000 },
				)
				.toBe(true);

			const base64 = await app.evaluate(
				() => (globalThis as Record<string, unknown>)["__testExportData"] as string,
			);
			fs.writeFileSync(outputPath, Buffer.from(base64, "base64"));
		}

		expect(fs.existsSync(outputPath), `${format.toUpperCase()} not found at ${outputPath}`).toBe(
			true,
		);
		const stats = fs.statSync(outputPath);
		expect(stats.size).toBeGreaterThan(1024);
		console.log(
			`[e2e] ${format.toUpperCase()} export completed in ${Math.round(performance.now() - exportStartedAt)} ms`,
		);
		return fs.readFileSync(outputPath);
	} finally {
		await app
			.evaluate(({ app: electronApp }) => {
				electronApp.exit(0);
			})
			.catch(() => {
				// The process may already be gone after export completes.
			});
		if (electronProcess.pid) {
			if (process.platform === "win32") {
				spawnSync("taskkill", ["/PID", String(electronProcess.pid), "/T", "/F"], {
					stdio: "ignore",
				});
			} else if (!electronProcess.killed) {
				electronProcess.kill("SIGKILL");
			}
		}
		if (!preservedOutputPath && fs.existsSync(outputPath)) {
			fs.unlinkSync(outputPath);
		}
		if (testVideoInRecordings && fs.existsSync(testVideoInRecordings)) {
			fs.unlinkSync(testVideoInRecordings);
		}
		if (testCursorDataPath && fs.existsSync(testCursorDataPath)) {
			fs.unlinkSync(testCursorDataPath);
		}
		if (testSessionDataPath && fs.existsSync(testSessionDataPath)) {
			fs.unlinkSync(testSessionDataPath);
		}
		fs.rmSync(testUserDataDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 100 });
	}
}

test("exports an MP4 from a loaded video", async () => {
	const exported = await exportFromLoadedVideo("mp4");

	expect(exported.subarray(4, 8).toString("ascii")).toBe("ftyp");
	const input = new Input({
		formats: [new Mp4InputFormat()],
		source: new BufferSource(exported),
	});
	const audioTracks = await input.getAudioTracks();
	expect(audioTracks).toHaveLength(1);
	expect(audioTracks[0].name).toBe("Mouse Clicks");
	input.dispose();
});

test("exports a GIF from a loaded video", async () => {
	const exported = await exportFromLoadedVideo("gif");

	expect(exported.subarray(0, 6).toString("ascii")).toMatch(/^GIF8[79]a/);
});
