export interface TodoItem {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export type TodoPortErrorCode =
  | "invalid-storage"
  | "storage-unavailable"
  | "todo-not-found"
  | "write-failed";

export class TodoPortError extends Error {
  readonly code: TodoPortErrorCode;

  constructor(code: TodoPortErrorCode, message: string) {
    super(message);
    this.name = "TodoPortError";
    this.code = code;
  }
}

export interface TodoPort {
  readonly readTodos: () => Promise<readonly TodoItem[]>;
  readonly setCompleted: (id: string, completed: boolean) => Promise<readonly TodoItem[]>;
}

export function cloneTodo(item: TodoItem): TodoItem {
  return Object.freeze({ id: item.id, title: item.title, completed: item.completed });
}

export function cloneTodos(items: readonly TodoItem[]): readonly TodoItem[] {
  return Object.freeze(items.map(cloneTodo));
}
