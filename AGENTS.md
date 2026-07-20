# Contents

- `src/core/` – product-neutral scenario, fixture, logical-time, store, effect, resource, and coverage contracts.
- `src/testing/` – deterministic session, activity, probe, and exact scripted-transport utilities.
- `src/react.ts` – opt-in React bindings for a Carapace store.
- `src/web/` – opt-in browser bridge and fail-closed application-fetch firewall.
- `docs/` – architecture, adoption, verification, and wire-format reference.
- `examples/todos/` – runnable React example with separate production and Carapace entries.
- `skills/` – agent workflows for adding and verifying a Carapace composition.
- `README.md` – installation, quick start, scope, and command index.

# Guidelines

- Use Bun 1.3.14 for repository commands. Keep the published ESM runtime portable to modern Node.js and browsers according to each export's documented boundary.
- Keep core code product-, platform-, and framework-neutral. Put React, browser globals, and Node-only tooling behind explicit subpaths.
- Keep `.js` extensions on relative TypeScript import and export specifiers; the published source type surface must compile under both Bundler and NodeNext resolution.
- Let each product own its semantic ports, strict versioned JSON world, deterministic adapters, scenarios, coverage claims, and workbench.
- Keep Carapace development-only. Production entries and emitted production assets must not import the package, fixture worlds, scenario catalogs, workbench code, or browser bridge.
- Parse foreign input from `unknown`, reject unknown reserved keys and object fields, and preserve atomic store, generation-fencing, cancellation, and exact-script invariants.
- Pair concrete behavior tests with property tests for parsers, round trips, ordering, resets, and cancellation.
- State proof limits precisely. Fixture evidence does not prove the live adapter, service, host, operating system, or device behavior that the composition replaces.
- Run `bun run check` before handing off a change. Run the todo example's production build and marker scan when changing the example or package boundaries.
