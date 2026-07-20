import {
  cloneTodos,
  TodoPortError,
  type TodoItem,
  type TodoPort,
} from "./todo-port";

export const TODO_STORAGE_KEY = "cclrte.todo-example/v1";

const TODO_KEYS = new Set(["id", "title", "completed"]);
const TODO_ID = /^[a-z][a-z0-9-]{0,47}$/u;

function readStoredTodoRecord(input: unknown, index: number): Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TodoPortError("invalid-storage", `Stored todo ${String(index)} must be an object.`);
  }
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TodoPortError("invalid-storage", `Stored todo ${String(index)} has an invalid prototype.`);
  }
  const record: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !TODO_KEYS.has(key)) {
      throw new TodoPortError("invalid-storage", `Stored todo ${String(index)} has an unknown field.`);
    }
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (
      descriptor === undefined
      || !("value" in descriptor)
      || !descriptor.enumerable
    ) {
      throw new TodoPortError("invalid-storage", `Stored todo ${String(index)} must use data fields.`);
    }
    record[key] = descriptor.value;
  }
  return record;
}

export function parseStoredTodos(input: unknown): readonly TodoItem[] {
  if (!Array.isArray(input) || input.length > 100) {
    throw new TodoPortError("invalid-storage", "Stored todos must be an array of at most 100 items.");
  }
  const ids = new Set<string>();
  const todos: TodoItem[] = [];
  for (const [index, candidate] of input.entries()) {
    const record = readStoredTodoRecord(candidate, index);
    if (
      typeof record.id !== "string"
      || !TODO_ID.test(record.id)
      || typeof record.title !== "string"
      || record.title.trim().length === 0
      || record.title.length > 120
      || typeof record.completed !== "boolean"
    ) {
      throw new TodoPortError("invalid-storage", `Stored todo ${String(index)} is invalid.`);
    }
    if (ids.has(record.id)) {
      throw new TodoPortError("invalid-storage", `Stored todo ID is duplicated: ${record.id}`);
    }
    ids.add(record.id);
    todos.push({ id: record.id, title: record.title, completed: record.completed });
  }
  return cloneTodos(todos);
}

export function createLocalStorageTodoPort(storage: Storage): TodoPort {
  const readTodos = (): Promise<readonly TodoItem[]> => Promise.resolve().then(() => {
    const encoded = storage.getItem(TODO_STORAGE_KEY);
    if (encoded === null) return Object.freeze([]);
    return parseStoredTodos(JSON.parse(encoded) as unknown);
  }).catch((reason: unknown) => {
    if (reason instanceof TodoPortError) return Promise.reject(reason);
    return Promise.reject(new TodoPortError(
      "storage-unavailable",
      reason instanceof Error ? reason.message : "Browser storage could not be read.",
    ));
  });

  return Object.freeze({
    readTodos,
    setCompleted: async (id: string, completed: boolean): Promise<readonly TodoItem[]> => {
      const current = await readTodos();
      if (!current.some((todo) => todo.id === id)) {
        throw new TodoPortError("todo-not-found", `Todo does not exist: ${id}`);
      }
      const updated = cloneTodos(current.map((todo) => (
        todo.id === id ? { ...todo, completed } : todo
      )));
      try {
        storage.setItem(TODO_STORAGE_KEY, JSON.stringify(updated));
      } catch (reason) {
        throw new TodoPortError(
          "storage-unavailable",
          reason instanceof Error ? reason.message : "Browser storage could not be written.",
        );
      }
      return updated;
    },
  });
}
