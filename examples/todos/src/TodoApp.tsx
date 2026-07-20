import { useEffect, useState } from "react";

import { TodoPortError, type TodoItem, type TodoPort } from "./todo-port";

export interface TodoAppProps {
  readonly port: TodoPort;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof TodoPortError) return reason.message;
  if (reason instanceof Error) return reason.message;
  return "Todos could not be loaded.";
}

export function TodoApp({ port }: TodoAppProps) {
  const [todos, setTodos] = useState<readonly TodoItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFailure(null);
    void port.readTodos().then(
      (next) => {
        if (!active) return;
        setTodos(next);
        setLoading(false);
      },
      (reason: unknown) => {
        if (!active) return;
        setFailure(errorMessage(reason));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [port, reload]);

  const setCompleted = async (todo: TodoItem): Promise<void> => {
    setBusyId(todo.id);
    setFailure(null);
    try {
      setTodos(await port.setCompleted(todo.id, !todo.completed));
    } catch (reason) {
      setFailure(errorMessage(reason));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <main className="todo-shell" aria-busy={loading || busyId !== null}>
      <header className="todo-header">
        <p>Todo example</p>
        <h1>Today</h1>
        <span>{todos.filter((todo) => !todo.completed).length} remaining</span>
      </header>

      {failure === null ? null : (
        <div className="todo-error" role="alert">
          <p>{failure}</p>
          {todos.length === 0 ? (
            <button type="button" onClick={() => setReload((value) => value + 1)}>Retry loading</button>
          ) : null}
        </div>
      )}

      {loading ? <p className="todo-state">Loading todos…</p> : null}
      {!loading && todos.length === 0 && failure === null ? (
        <p className="todo-state">No tasks in this list.</p>
      ) : null}
      {todos.length > 0 ? (
        <ul className="todo-list">
          {todos.map((todo) => (
            <li key={todo.id}>
              <label>
                <input
                  checked={todo.completed}
                  disabled={busyId !== null}
                  onChange={() => void setCompleted(todo)}
                  type="checkbox"
                />
                <span>{todo.title}</span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
