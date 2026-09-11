import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MediaReadServer } from "./mediaReadServer";

let reader: MediaReadServer;
let directory: string;
let filePath: string;

beforeEach(async () => {
	reader = new MediaReadServer();
	directory = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-media-reader-"));
	filePath = path.join(directory, "sample.mp4");
	await fs.writeFile(filePath, "0123456789");
});
afterEach(async () => {
	await reader.close();
	await fs.rm(directory, { recursive: true, force: true });
});

describe("MediaReadServer", () => {
	it("reports size without reading the body and streams precise byte ranges", async () => {
		const { url } = await reader.open(filePath, 1);
		const head = await fetch(url, { method: "HEAD" });
		expect(head.status).toBe(200);
		expect(head.headers.get("content-length")).toBe("10");
		expect(head.headers.get("accept-ranges")).toBe("bytes");
		expect(await head.text()).toBe("");
		const range = await fetch(url, { headers: { Range: "bytes=2-5" } });
		expect(range.status).toBe(206);
		expect(range.headers.get("content-range")).toBe("bytes 2-5/10");
		expect(await range.text()).toBe("2345");
	});
	it.each([
		["bytes=8-", "89"],
		["bytes=-3", "789"],
		["bytes=7-99", "789"],
	])("handles %s", async (range, body) => {
		const { url } = await reader.open(filePath, 1);
		const response = await fetch(url, { headers: { Range: range } });
		expect(response.status).toBe(206);
		expect(await response.text()).toBe(body);
	});
	it.each([
		"bytes=10-20",
		"bytes=3-1",
		"bytes=-0",
		"bytes=",
		"bytes=0-1,4-5",
		"bytes=9007199254740992-",
	])("rejects invalid range %s", async (range) => {
		const { url } = await reader.open(filePath, 1);
		expect((await fetch(url, { headers: { Range: range } })).status).toBe(416);
	});
	it("does not expose paths, accept writes, or allow another owner to revoke a reader", async () => {
		const { url, id } = await reader.open(filePath, 1);
		expect((await fetch(new URL("/sample.mp4", url))).status).toBe(404);
		expect((await fetch(url, { method: "POST" })).status).toBe(405);
		reader.release(id, 2);
		expect((await fetch(url, { method: "HEAD" })).status).toBe(200);
		reader.releaseOwner(1);
		expect((await fetch(url)).status).toBe(404);
	});
	it("reads a tiny range from beyond 4 GiB without loading the whole file", async () => {
		const handle = await fs.open(filePath, "r+");
		await handle.truncate(5 * 1024 ** 3);
		await handle.close();
		const { url } = await reader.open(filePath, 1);
		const head = await fetch(url, { method: "HEAD" });
		expect(head.headers.get("content-length")).toBe(String(5 * 1024 ** 3));
		const range = await fetch(url, { headers: { Range: "bytes=4294967296-4294967311" } });
		expect(range.status).toBe(206);
		expect(new Uint8Array(await range.arrayBuffer())).toEqual(new Uint8Array(16));
	});
});
