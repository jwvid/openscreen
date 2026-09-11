import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/** Seekable worker-side media reads, without copying the file through Electron IPC.
 * The IPC layer registers only approved paths; HTTP accepts unguessable tokens,
 * never filesystem paths. Responses stream from disk with backpressure.
 */
export class MediaReadServer {
	private server: Server | null = null;
	private ready: Promise<number> | null = null;
	private sources = new Map<string, { path: string; owner: number }>();

	async open(filePath: string, owner: number): Promise<{ id: string; url: string }> {
		if (this.sources.size >= 128) throw new Error("Too many media readers are open");
		if (!(await fs.stat(filePath)).isFile()) throw new Error("Media source is not a file");
		const port = await this.start();
		const id = randomUUID();
		this.sources.set(id, { path: filePath, owner });
		return { id, url: `http://127.0.0.1:${port}/${id}` };
	}

	release(id: string, owner: number) {
		if (this.sources.get(id)?.owner === owner) this.sources.delete(id);
	}

	releaseOwner(owner: number) {
		for (const [id, source] of this.sources) {
			if (source.owner === owner) this.sources.delete(id);
		}
	}

	async close() {
		this.sources.clear();
		const server = this.server;
		this.server = null;
		this.ready = null;
		if (!server) return;
		await new Promise<void>((resolve, reject) => {
			server.close((error) => (error ? reject(error) : resolve()));
			server.closeAllConnections();
		});
	}

	private start(): Promise<number> {
		if (this.ready) return this.ready;
		const server = createServer((request, response) => {
			void this.respond(request, response).catch(() => {
				if (!response.headersSent) response.writeHead(404);
				response.end();
			});
		});
		this.server = server;
		this.ready = new Promise<number>((resolve, reject) => {
			server.once("error", reject);
			server.listen(0, "127.0.0.1", () => {
				const address = server.address();
				if (!address || typeof address === "string")
					return reject(new Error("No media reader port"));
				server.unref();
				resolve(address.port);
			});
		});
		return this.ready;
	}

	private async respond(request: IncomingMessage, response: ServerResponse) {
		const address = this.server?.address();
		if (
			!address ||
			typeof address === "string" ||
			request.headers.host !== `127.0.0.1:${address.port}`
		) {
			response.writeHead(403).end();
			return;
		}
		const source = this.sources.get((request.url || "").slice(1));
		if (!source) {
			response.writeHead(404).end();
			return;
		}
		// file:// and dev origins can read only with the private capability URL.
		response.setHeader("Access-Control-Allow-Origin", "*");
		response.setHeader(
			"Access-Control-Expose-Headers",
			"Content-Length, Content-Range, Accept-Ranges",
		);
		response.setHeader("Cache-Control", "no-store");
		if (request.method === "OPTIONS") {
			response.setHeader("Access-Control-Allow-Methods", "GET, HEAD");
			response.setHeader("Access-Control-Allow-Headers", "Range");
			response.writeHead(204).end();
			return;
		}
		if (request.method !== "GET" && request.method !== "HEAD") {
			response.writeHead(405, { Allow: "GET, HEAD" }).end();
			return;
		}
		const { size } = await fs.stat(source.path);
		response.setHeader("Accept-Ranges", "bytes");
		response.setHeader("Content-Type", "application/octet-stream");
		if (request.method === "HEAD") {
			response.writeHead(200, { "Content-Length": size }).end();
			return;
		}
		let start = 0;
		let end = size - 1;
		const range = request.headers.range;
		if (range) {
			const match = /^bytes=(\d*)-(\d*)$/.exec(range);
			if (match && (match[1] || match[2])) {
				start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
				end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
			}
			if (
				!match ||
				(!match[1] && !match[2]) ||
				!Number.isSafeInteger(start) ||
				!Number.isSafeInteger(end) ||
				start > end ||
				start >= size
			) {
				response.writeHead(416, { "Content-Range": `bytes */${size}` }).end();
				return;
			}
			response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
		}
		response.writeHead(range ? 206 : 200, { "Content-Length": Math.max(0, end - start + 1) });
		if (size === 0) {
			response.end();
			return;
		}
		const stream = createReadStream(source.path, { start, end, highWaterMark: 64 * 1024 });
		stream.on("error", () => response.destroy());
		response.on("close", () => stream.destroy());
		stream.pipe(response);
	}
}
