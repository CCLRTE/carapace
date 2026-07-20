# Todo example

This example runs one React interface against two implementations of a product-owned `TodoPort`:

```text
TodoApp
   |
TodoPort
  /   \
local  deterministic
storage world + logical time
```

The production entry under `src/` uses browser local storage and contains no Carapace import. The separate entry under `carapace/` uses a strict JSON world, `defineCarapace`, `createCarapaceSession`, an in-memory adapter, the browser bridge, and the fail-closed fetch firewall.

## Run it

From the repository root:

```sh
bun run example:dev
bun run example:carapace
```

The workbench provides three stable scenarios:

- `todos.empty` renders the real empty state.
- `todos.populated` loads two tasks and permits deterministic completion changes.
- `todos.write-failure` loads the same interface and reports a declared persistence failure when a task is changed.

## Verify it

```sh
bun run example:test
bun run example:typecheck
bun run example:verify
```

`example:verify` builds production and Carapace into an isolated temporary directory, scans every emitted production file for forbidden markers, and removes the directory even when verification fails. The individual build commands are useful while iterating:

```sh
bun run example:build
bun run example:check-boundary
bun run example:build:carapace
```

The boundary command scans emitted production output for package names, query keys, wire schemas, browser globals, and workbench markers. It fails if no files were scanned.

The fixture claims cover interface behavior through the deterministic port. The coverage catalog keeps local-storage serialization as a direct claim because the in-memory adapter does not exercise browser storage behavior.
