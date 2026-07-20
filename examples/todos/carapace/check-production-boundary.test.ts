import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { scanTodoProductionOutput } from "./check-production-boundary";

describe("todo production boundary", () => {
  test("reports forbidden markers in emitted text and binary files", async () => {
    const directory = await mkdtemp(join(tmpdir(), "todo-production-boundary-"));
    try {
      await mkdir(join(directory, "assets"));
      await writeFile(join(directory, "index.html"), "<main>Todo example</main>");
      await writeFile(join(directory, "assets", "app.js"), Buffer.from("prefix\0__carapace\0suffix"));
      const result = await scanTodoProductionOutput(directory, ["__carapace"]);
      expect(result.scanned).toHaveLength(2);
      expect(result.violations).toEqual([{
        file: join(directory, "assets", "app.js"),
        markers: ["__carapace"],
      }]);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("rejects a vacuous scan", async () => {
    const directory = await mkdtemp(join(tmpdir(), "todo-production-empty-"));
    try {
      let rejection: unknown;
      try {
        await scanTodoProductionOutput(directory);
      } catch (reason) {
        rejection = reason;
      }
      expect(rejection).toBeInstanceOf(Error);
      if (!(rejection instanceof Error)) throw new Error("Expected the empty scan to reject.");
      expect(rejection.message).toContain("did not scan");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
