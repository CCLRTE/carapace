import { describe, expect, test } from "bun:test";

import {
  createLocalStorageTodoPort,
  parseStoredTodos,
  TODO_STORAGE_KEY,
} from "./local-storage-todo-port";

class MemoryStorage implements Storage {
  readonly #records = new Map<string, string>();

  get length(): number {
    return this.#records.size;
  }

  clear(): void {
    this.#records.clear();
  }

  getItem(key: string): string | null {
    return this.#records.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.#records.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#records.delete(key);
  }

  setItem(key: string, value: string): void {
    this.#records.set(key, value);
  }
}

describe("local-storage todo port", () => {
  test("reads and writes owned todo values", async () => {
    const storage = new MemoryStorage();
    storage.setItem(TODO_STORAGE_KEY, JSON.stringify([
      { id: "write-docs", title: "Write docs", completed: false },
    ]));
    const port = createLocalStorageTodoPort(storage);

    expect(await port.readTodos()).toEqual([
      { id: "write-docs", title: "Write docs", completed: false },
    ]);
    expect(await port.setCompleted("write-docs", true)).toEqual([
      { id: "write-docs", title: "Write docs", completed: true },
    ]);
  });

  test("rejects unknown fields and duplicate IDs", () => {
    expect(() => parseStoredTodos([
      { id: "one", title: "One", completed: false, extra: true },
    ])).toThrow("unknown field");
    expect(() => parseStoredTodos([
      { id: "one", title: "One", completed: false },
      { id: "one", title: "Again", completed: true },
    ])).toThrow("duplicated");
  });

  test("rejects accessors without invoking them", () => {
    let getterWasRead = false;
    const input: Record<string, unknown> = { id: "one", title: "One" };
    Object.defineProperty(input, "completed", {
      enumerable: true,
      get: () => {
        getterWasRead = true;
        return false;
      },
    });

    expect(() => parseStoredTodos([input])).toThrow("data fields");
    expect(getterWasRead).toBeFalse();
  });
});
