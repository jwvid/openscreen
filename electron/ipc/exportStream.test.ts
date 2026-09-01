import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ExportStreamRegistry } from "./exportStream";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

async function createTargetPath() {
	const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-export-stream-"));
	tempDirs.push(dir);
	return path.join(dir, "output.mp4");
}

describe("ExportStreamRegistry", () => {
	it("writes positioned chunks and closes the completed file", async () => {
		const registry = new ExportStreamRegistry();
		const target = await createTargetPath();
		const id = await registry.open(target);

		await registry.write(id, Uint8Array.from([5, 6]).buffer, 2);
		await registry.write(id, Uint8Array.from([1, 2]).buffer, 0);
		await expect(registry.close(id)).resolves.toBe(target);
		await expect(fs.readFile(target)).resolves.toEqual(Buffer.from([1, 2, 5, 6]));
	});

	it("removes a partial export when discarded", async () => {
		const registry = new ExportStreamRegistry();
		const target = await createTargetPath();
		await fs.writeFile(target, "existing export");
		const id = await registry.open(target);

		await registry.write(id, Uint8Array.from([1, 2, 3]).buffer, 0);
		await expect(fs.readFile(target, "utf8")).resolves.toBe("existing export");
		await registry.close(id, true);
		await expect(fs.readFile(target, "utf8")).resolves.toBe("existing export");
		await expect(fs.readdir(path.dirname(target))).resolves.toEqual([path.basename(target)]);
	});
});
