# Contents

- `world.ts` – bounded, strict, versioned JSON world parser and fixtures.
- `definition.ts` – stable empty, populated, and write-failure scenarios plus exact proof catalog.
- `deterministic-todo-port.ts` – in-memory implementation of the product port with logical time and activity accounting.
- `session.ts` – one definition-driven product session and probe observation boundary.
- `workbench.tsx` and `main.tsx` – scenario navigation and the real todo interface.
- `vite.config.ts` and `index.html` – separate Carapace browser entry.
- `check-production-boundary.ts` – emitted production-marker scan.
- `*.test.ts` – parser, definition, adapter, session, and boundary evidence.

# Guidelines

- Keep this directory development-only. Production source and emitted assets must not import or contain it.
- Parse every world value from `unknown`; reject unsupported versions, unknown keys, duplicate IDs, and exceeded bounds.
- Use `defineCarapace` and `createCarapaceSession`; do not hand-roll activation, store, clock, probe, or teardown.
- Install the browser bridge and fetch firewall only in `main.tsx`. Count blocked requests and activity failures as probe violations.
- Treat expected write rejection as product behavior, not a verifier violation.
- Use exported activation constants rather than spelling reserved query keys in TypeScript.
