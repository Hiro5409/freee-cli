import { describe, expect, test } from "bun:test";
import { Writable } from "node:stream";

import { writeOutput } from "./write.ts";

class DelayedWritable extends Writable {
  readonly chunks: Buffer[] = [];
  #flush: (() => void) | undefined;

  override _write(
    chunk: Buffer,
    _encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(chunk);
    this.#flush = callback;
  }

  flush(): void {
    this.#flush?.();
  }
}

describe("writeOutput", () => {
  test("waits until a large stdout write is flushed", async () => {
    const output = JSON.stringify(
      Array.from({ length: 100 }, (_, id) => ({ id, description: "x".repeat(1_000) })),
      null,
      2,
    );
    const stdout = new DelayedWritable({ highWaterMark: 16 });
    let completed = false;

    const writing = writeOutput(output, stdout).then(() => {
      completed = true;
    });
    await Promise.resolve();

    expect(completed).toBe(false);
    stdout.flush();
    await writing;
    expect(Buffer.concat(stdout.chunks).toString()).toBe(`${output}\n`);
  });

  test("reports stdout write failures", async () => {
    const stdout = {
      write(_chunk: string, callback: (error?: Error | null) => void) {
        callback(new Error("stdout unavailable"));
        return false;
      },
    };

    await expect(writeOutput("result", stdout)).rejects.toThrow("stdout unavailable");
  });
});
