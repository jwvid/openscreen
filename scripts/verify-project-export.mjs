// Usage: node scripts/verify-project-export.mjs project.openscreen new-output.mp4
// Reads the original project/media without changing them. Uses isolated app data.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectPath = path.resolve(process.argv[2] || "");
const outputPath = path.resolve(process.argv[3] || "");
assert(process.argv[2] && process.argv[3], "Supply a project and a new MP4 output path");
assert(!fs.existsSync(outputPath), "Refusing to overwrite an existing export");
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "openscreen-project-export-"));
const app = await electron.launch({
	args: [path.join(root, "dist-electron/main.js"), `--user-data-dir=${userData}`],
	env: { ...process.env, HEADLESS: "true" },
});
let statusTimer;
try {
	const hud = await app.firstWindow();
	await hud.waitForLoadState("domcontentloaded");
	await app.evaluate(({ ipcMain }, destination) => {
		ipcMain.removeHandler("pick-export-save-path");
		ipcMain.handle("pick-export-save-path", () => ({
			success: true,
			path: destination,
			canceled: false,
		}));
	}, outputPath);
	const loaded = await hud.evaluate(
		(project) => window.electronAPI.loadProjectFileFromPath(project),
		projectPath,
	);
	assert(loaded.success, JSON.stringify(loaded));
	const nextWindow = app.waitForEvent("window");
	await hud
		.evaluate(() => window.electronAPI.switchToEditor())
		.catch(() => {
			/* HUD closes during the transition. */
		});
	const editor = await nextWindow;
	editor.on("console", (message) => {
		if (
			message.type() === "error" ||
			/VideoExporter|StreamingVideoDecoder|AudioProcessor|FrameRenderer/.test(message.text())
		) {
			console.log(`[renderer:${message.type()}] ${message.text()}`);
		}
	});
	editor.on("pageerror", (error) => console.error("[pageerror]", error.message));
	await editor.waitForLoadState("domcontentloaded");
	// Production startup may replace the initial document before showing it.
	await editor.waitForFunction(
		() => typeof VideoEncoder === "function" && typeof VideoDecoder === "function",
	);
	await editor.waitForFunction(
		() => document.querySelector("video")?.readyState >= 2,
		{},
		{ timeout: 60_000 },
	);
	console.log(
		"[source]",
		await editor.evaluate(() => {
			const video = document.querySelector("video");
			return { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
		}),
	);
	await editor.getByTestId("testId-export-panel-button").click();
	await editor.getByTestId("testId-mp4-format-button").click();
	console.log("[export settings]", (await editor.locator("body").innerText()).slice(-3500));
	const started = Date.now();
	statusTimer = setInterval(() => {
		void Promise.all([
			editor.locator("body").innerText(),
			app.evaluate(({ app }) =>
				app.getAppMetrics().map((metric) => ({
					type: metric.type,
					MB: Math.round(metric.memory.workingSetSize / 1024),
				})),
			),
		])
			.then(([body, memory]) =>
				console.log(
					"[progress]",
					Math.round((Date.now() - started) / 1000),
					"seconds",
					body.slice(-1000),
					memory,
				),
			)
			.catch(() => {
				/* Window may have closed during the final status sample. */
			});
	}, 30_000);
	await editor.getByTestId("testId-export-button").click();
	await Promise.race([
		editor
			.getByText("Video exported successfully", { exact: true })
			.waitFor({ state: "visible", timeout: 45 * 60_000 }),
		editor
			.getByText(/export failed/i)
			.first()
			.waitFor({ state: "visible", timeout: 45 * 60_000 })
			.then(async () => {
				throw new Error((await editor.locator("body").innerText()).slice(-4000));
			}),
	]);
	assert(fs.statSync(outputPath).size > 1024, "Output is missing or empty");
	console.log(
		"[SUCCESS]",
		JSON.stringify({
			outputPath,
			bytes: fs.statSync(outputPath).size,
			seconds: (Date.now() - started) / 1000,
		}),
	);
} finally {
	clearInterval(statusTimer);
	await app
		.evaluate(({ app }) => app.exit(0))
		.catch(() => {
			/* Already exited after a crash. */
		});
	await app.close().catch(() => {
		/* Already closed. */
	});
	console.log("[isolated test data]", userData);
}
