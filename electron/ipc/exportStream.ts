import { randomUUID } from "node:crypto";
import fs, { type FileHandle } from "node:fs/promises";
import path from "node:path";

type OpenExportStream = {
	handle: FileHandle;
	targetPath: string;
	temporaryPath: string;
};

export class ExportStreamRegistry {
	private streams = new Map<string, OpenExportStream>();

	async open(filePath: string): Promise<string> {
		const id = randomUUID();
		const temporaryPath = path.join(
			path.dirname(filePath),
			`.${path.basename(filePath)}.${id}.partial`,
		);
		const handle = await fs.open(temporaryPath, "wx");
		this.streams.set(id, { handle, targetPath: filePath, temporaryPath });
		return id;
	}

	async write(id: string, data: ArrayBuffer, position: number): Promise<void> {
		const stream = this.streams.get(id);
		if (!stream) {
			throw new Error("Export stream is not open");
		}
		if (!(data instanceof ArrayBuffer) || !Number.isSafeInteger(position) || position < 0) {
			throw new Error("Invalid export stream write");
		}

		const buffer = Buffer.from(data);
		let offset = 0;
		while (offset < buffer.byteLength) {
			const { bytesWritten } = await stream.handle.write(
				buffer,
				offset,
				buffer.byteLength - offset,
				position + offset,
			);
			if (bytesWritten <= 0) {
				throw new Error("Export stream write made no progress");
			}
			offset += bytesWritten;
		}
	}

	async close(id: string, discard = false): Promise<string | null> {
		const stream = this.streams.get(id);
		if (!stream) {
			return null;
		}

		this.streams.delete(id);
		await stream.handle.close();
		if (discard) {
			await fs.unlink(stream.temporaryPath).catch(() => undefined);
			return null;
		}

		await fs.rename(stream.temporaryPath, stream.targetPath);
		return stream.targetPath;
	}
}
