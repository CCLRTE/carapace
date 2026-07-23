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

interface InjectedStorageFailure {
  readonly reason: unknown;
}

function throwStorageReason(reason: unknown): never {
  throw reason;
}

class FailingStorage extends MemoryStorage {
  private readonly readFailure: InjectedStorageFailure | null;
  private readonly writeFailure: InjectedStorageFailure | null;

  constructor(
    readFailure: InjectedStorageFailure | null,
    writeFailure: InjectedStorageFailure | null,
  ) {
    super();
    this.readFailure = readFailure;
    this.writeFailure = writeFailure;
  }

  override getItem(key: string): string | null {
    if (this.readFailure !== null) throwStorageReason(this.readFailure.reason);
    return super.getItem(key);
  }

  override setItem(key: string, value: string): void {
    if (this.writeFailure !== null) throwStorageReason(this.writeFailure.reason);
    super.setItem(key, value);
  }

  seed(key: string, value: string): void {
    super.setItem(key, value);
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

  test("rejects hostile arrays and records through controlled storage errors", () => {
    let arrayGetterWasRead = false;
    const array: unknown[] = [];
    Object.defineProperty(array, "0", {
      enumerable: true,
      get: () => {
        arrayGetterWasRead = true;
        return { id: "one", title: "One", completed: false };
      },
    });
    expect(() => parseStoredTodos(array)).toThrow("dense data entries");
    expect(arrayGetterWasRead).toBeFalse();

    const hostileRecord = new Proxy({}, {
      getPrototypeOf: () => { throw new Error("prototype trap"); },
    });
    expect(() => parseStoredTodos([hostileRecord])).toThrow("could not be inspected");

    const { proxy, revoke } = Proxy.revocable([], {});
    revoke();
    expect(() => parseStoredTodos(proxy)).toThrow("could not be inspected");
  });

  test("classifies malformed JSON as invalid storage", () => {
    const storage = new MemoryStorage();
    storage.setItem(TODO_STORAGE_KEY, "{not-json");
    const port = createLocalStorageTodoPort(storage);

    expect(port.readTodos()).rejects.toMatchObject({
      code: "invalid-storage",
      message: "Stored todos are not valid JSON.",
    });
  });

  test("keeps storage access failures distinct from malformed stored data", () => {
    const readFailure = createLocalStorageTodoPort(new FailingStorage(
      { reason: new Error("read denied") },
      null,
    ));
    expect(readFailure.readTodos()).rejects.toMatchObject({
      code: "storage-unavailable",
      message: "read denied",
    });

    const storage = new FailingStorage(null, { reason: new Error("write denied") });
    storage.seed(TODO_STORAGE_KEY, JSON.stringify([
      { id: "one", title: "One", completed: false },
    ]));
    const writeFailure = createLocalStorageTodoPort(storage);
    expect(writeFailure.setCompleted("one", true)).rejects.toMatchObject({
      code: "storage-unavailable",
      message: "write denied",
    });
  });

  test("contains hostile thrown storage reasons behind typed fallback errors", () => {
    const hostileReason = new Proxy({}, {
      get: () => { throw new Error("message trap escaped"); },
      getPrototypeOf: () => { throw new Error("prototype trap escaped"); },
    });
    const readFailure = createLocalStorageTodoPort(new FailingStorage({ reason: hostileReason }, null));
    expect(readFailure.readTodos()).rejects.toMatchObject({
      code: "storage-unavailable",
      message: "Browser storage could not be read.",
    });

    const storage = new FailingStorage(null, { reason: hostileReason });
    storage.seed(TODO_STORAGE_KEY, JSON.stringify([
      { id: "one", title: "One", completed: false },
    ]));
    const writeFailure = createLocalStorageTodoPort(storage);
    expect(writeFailure.setCompleted("one", true)).rejects.toMatchObject({
      code: "storage-unavailable",
      message: "Browser storage could not be written.",
    });
  });
});
