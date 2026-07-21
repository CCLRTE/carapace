# Carapace

Carapace is a TypeScript kernel for running a product's real interface and state machinery against deterministic implementations of product-owned ports. It supplies strict scenario activation, JSON-safe fixtures, logical time, generation-safe stores, probes, exact scripts, and opt-in React and browser bindings.

<!-- article:carapace-a-harness-for-your-frontend:start -->
## [Carapace tests the real frontend against deterministic state](<https://prmte.com/articles/carapace-a-harness-for-your-frontend>)

> Carapace replaces slow external systems at a product-owned boundary so agents can inspect the real interface. It does not test the systems it replaces.

Frontend checks slow down when every run must reach the right account state, seed records, wait for services, and collect evidence.

Carapace is an open-source frontend testing harness for checks that can run against a modeled product state. It keeps the real interface and state machinery above a deterministic adapter, which returns the same modeled responses and transitions for the same inputs. Its TypeScript kernel manages deterministic sessions and logical time and exposes a probe that reports active and pending work; a product-owned runner chooses the browser driver and evidence. Direct tests still cover the replaced system, full browser assembly, and operating system.

### Keep product behavior above a deterministic port

A conventional end-to-end test assembles a production-shaped system. Carapace changes only the composition below the behavior under review. The real interface, product state transitions, data refreshes, and navigation remain. A product-owned port, which is a small interface between product behavior and an external system, supplies the replaceable boundary.

A minimal product-specific layout makes that boundary visible:

**Conceptual Carapace layout**

```text
product/
├── src/
│   ├── app/                         # real interface and state machinery
│   ├── runtime-port.ts              # product-owned external boundary
│   └── production-runtime.ts        # live implementation of that boundary
└── carapace/
    ├── worlds.ts                    # named deterministic product states
    ├── deterministic-runtime.ts     # test implementation of the same boundary
    ├── scenarios.ts                 # actions and assertions in product terms
    └── evidence.ts                  # screenshots, video, and diagnostics
```

The filenames are illustrative. The ownership rule is fixed: production and deterministic runtimes implement the same product-owned port, the real interface stays above both, and worlds, scenarios, and evidence stay outside production code.

The [public Todo example](<https://github.com/CCLRTE/carapace/tree/main/examples/todos>) shows that boundary in code. The real `TodoApp` knows only the product's `TodoPort`. The production entry supplies browser storage. The Carapace workbench supplies a deterministic port created by its session:

**todo-port.ts composition (illustrative excerpt)**

```typescript
export interface TodoItem {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
}

export interface TodoPort {
  readonly readTodos: () => Promise<readonly TodoItem[]>;
  readonly setCompleted: (
    id: string,
    completed: boolean,
  ) => Promise<readonly TodoItem[]>;
}

// Production entry
<TodoApp port={createLocalStorageTodoPort(globalThis.localStorage)} />

// Carapace workbench
<TodoApp port={props.harness.port} />
```

The interface speaks in product terms: todos and completion. It contains no storage calls or Carapace types. Behind the port, the deterministic runtime can use a world and a logical clock without changing the component under review.

The deterministic side starts with one strict, versioned JSON world. A product adapter validates that immutable seed, initializes adapter-local state, and returns the response shapes and transitions the interface expects. Reads return cloned snapshots and writes update adapter-local state. Above the port, the frontend handles each response through its normal state-update path. Unknown requests fail instead of falling through to a live service. The fixture becomes a small executable model of product state.

A web runner may mount that composition in an embedded page served from the same origin. The runner can control the page's viewport and replace `fetch` without changing production code. Other products can use separate development entries and deterministic implementations of backend or native-host ports. In each case, production and Carapace meet at an owned boundary above the external system that makes verification slow or nondeterministic.

### Reuse the browser; reset the world

[Playwright’s browser-context isolation](<https://playwright.dev/docs/browser-contexts>) gives each end-to-end test clean cookies, storage, and pages, which stops cases from leaking state into one another. That clean start costs time when every case must navigate, authenticate, seed a backend, wait for data, and rebuild the application. A Carapace runner can keep a compatible browser worker and application bundle warm while it resets the deterministic world at the fixture boundary.

The kernel provides activation, reset, and activity tracking. Each reset gives the store a new generation number. Transactions and tracked operations created under an earlier number become stale and cannot update or settle the new store; product code must still cancel untracked promises and external side effects. A product runner can reset the modeled world, browser storage, application caches, and rendered page between scenarios. Browser reuse is a runner choice, not a kernel guarantee.

Logical time removes another delay. Carapace can advance product delays faster than wall-clock time when a scenario tests state transitions. Its runtime snapshot records the logical time, next operation number, and acceleration so a fixture can restore the same clock state. Browser motion still uses wall-clock time and needs a separate motion check.

### Quiescence replaces sleeps

A fixed delay waits for a duration. Quiescence means that the current scenario has reached its declared readiness conditions. Carapace first requires no active operations and all product-named pending counters at zero. A state revision is the number that changes when store state changes. The verifier checks that the reset generation, revision, and counter values remain unchanged for a short, bounded interval. It can also wait for loaded fonts, nearby images, and DOM stability before capture.

The probe reports violation counters and remaining scripted work outside that quiescence gate. A verifier must separately reject an unhandled request, unused required script step, console error, runtime error, leaked work token, or stale generation when that signal matters to the claim. [Types and property tests in an agent-operated codebase](<https://prmte.com/articles/the-ai-codebase-types-and-property-tests>) help at this boundary. Strict parsers reject malformed worlds, while generated tests challenge reset, cancellation, serialization, and ordering laws across many inputs.

The browser-driver helper remains product-owned. In this illustrative Playwright example, `waitForQuiescence` reads the probe until those readiness conditions remain stable. It then rejects relevant violations and required remaining work:

**todo.browser.test.ts (illustrative)**

```typescript
test("completes a populated todo", async ({ page }) => {
  await page.goto(
    "/carapace/?__carapace_scenario=todos.populated",
  );
  await waitForQuiescence(page);

  const todo = page.getByRole("checkbox", {
    name: "Write the public guide",
  });
  await todo.check();
  await waitForQuiescence(page);

  await expect(todo).toBeChecked();
});
```

The check needs no login, seed request, CSS selector, or fixed sleep. The named scenario supplies the starting world, the port carries the interaction through real frontend state, and the second `waitForQuiescence` call waits for that state to settle.

Quiescence does not prove that the rendered result is correct. It proves only that the readiness conditions held. The verifier must reject relevant violations and remaining work separately; semantic assertions, visual review, and direct integration tests still decide whether the result supports the claim.

### Use Carapace when setup hides frontend state

Carapace fits when tests spend more effort arranging external state than exercising the interface, and production and deterministic adapters can implement the same product-owned port without copying the behavior under review. Keep the real components, state machinery, and navigation above the port. Put named deterministic worlds below it, wait for explicit quiescence, and tie each piece of evidence to its scenario.

Keep direct integration and end-to-end tests when the backend, native host, browser assembly, or operating system is the behavior under review. If a deterministic adapter would have to reimplement behavior that the claim depends on, it would imitate rather than test that behavior. Carapace narrows the claim to frontend behavior above the port backed by that adapter; the runner may capture screenshots or video, but the kernel does not judge them.
<!-- article:carapace-a-harness-for-your-frontend:end -->

## Install

Pin the public repository to an immutable version tag:

```json
{
  "devDependencies": {
    "@cclrte/carapace": "github:CCLRTE/carapace#v0.2.0"
  }
}
```

Then install with Bun:

```sh
bun install
```

Keep Carapace in `devDependencies`. A production entry must not import Carapace, its fixture worlds, or its workbench.

## Define a deterministic surface

Start with a product-owned port. Production and Carapace implement the same contract; the interface depends only on that contract.

```text
real interface and state
          |
   product-owned port
      /          \
production     Carapace
adapter        adapter
```

Define one strict, versioned JSON world, stable scenarios, and explicit coverage claims:

```ts
import { defineCarapace, type JsonValue } from "@cclrte/carapace";

type World = {
  readonly [key: string]: JsonValue;
  readonly version: 1;
  readonly greeting: string;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
  const prototype = Object.getPrototypeOf(input);
  return prototype === Object.prototype || prototype === null;
}

function parseWorld(input: unknown): World {
  if (
    !isRecord(input)
    || Object.keys(input).sort().join(",") !== "greeting,version"
    || input.version !== 1
    || typeof input.greeting !== "string"
  ) {
    throw new Error("World must be an exact version 1 greeting object");
  }
  return Object.freeze({ version: 1, greeting: input.greeting });
}

const definition = defineCarapace<World, "/">({
  parseWorld,
  defaultScenario: "greeting.ready",
  scenarios: [{
    id: "greeting.ready",
    title: "Ready greeting",
    route: "/",
    world: { version: 1, greeting: "Hello" },
  }],
  coverage: [{
    key: "greeting.render",
    mode: "fixture",
    claim: "The real greeting view renders a deterministic greeting.",
    route: "/",
    scenarios: ["greeting.ready"],
  }],
});

if (!definition.ok) throw new Error(definition.error.message);
```

Use `createCarapaceSession` from `@cclrte/carapace/testing` to activate the definition, create product adapters, account for asynchronous work, expose a probe, and dispose the composition as one unit. The [todo example](https://github.com/CCLRTE/carapace/tree/main/examples/todos) shows the complete path.

For React Native, use the same React, testing, and web surfaces from a platform-resolved Expo composition. The [React Native example](https://github.com/CCLRTE/carapace/tree/main/examples/react-native) renders one real screen through a native production port on iOS and Android and a deterministic Carapace port on web. It exports all three graphs with paired source maps and scans their platform selections without requiring a simulator.

## Package surfaces

| Import | Purpose | Runtime boundary |
| --- | --- | --- |
| `@cclrte/carapace` | Definitions, scenarios, fixtures, logical time, stores, effects, resources, and coverage | Framework-free |
| `@cclrte/carapace/core` | Explicit alias of the default core surface | Framework-free |
| `@cclrte/carapace/react` | Typed context, provider, and external-store hooks for React DOM or React Native | Optional React peer |
| `@cclrte/carapace/testing` | Sessions, activity scopes, probes, and exact scripted transports | Development and verification |
| `@cclrte/carapace/web` | Browser automation bridge and application-fetch firewall | Browser only |

## Activate scenarios

The browser query boundary reserves:

- `__carapace_scenario=<id>` for a named catalog scenario.
- `__carapace_fixture=<encoded-json>` for a portable `carapace.fixture/v1` envelope.

Malformed encoding, duplicate activation, unknown reserved keys, unknown scenarios, route mismatches, invalid worlds, and oversized input fail closed. An empty activation selects the definition's validated default scenario.

## Keep evidence honest

Coverage entries have one proof mode:

| Mode | Meaning |
| --- | --- |
| `fixture` | The real interface and product logic ran through deterministic ports. Replaced adapters and platforms were not exercised. |
| `mixed` | Fixture evidence is paired with named direct adapter or service evidence. Neither half is sufficient alone. |
| `direct` | The claim requires the real host, service, runtime, filesystem, operating system, or device. |

A quiet probe means the declared deterministic work settled. It does not prove that the rendered result is correct. Pair quiescence with semantic assertions, visual inspection where relevant, and direct tests for every replaced boundary named by the coverage catalog.

## Repository scope

This repository contains the deterministic kernel, browser bridge, production-exclusion pattern, agent skills, a small React example, and an Expo/React Native reference app. It does not contain a browser driver, browser-worker pool, screenshot deduplication, video recording, PySceneDetect integration, or storyboard generation. Use the browser tooling that fits your product and treat recorded media as evidence, not as the definition of correctness.

## Develop

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
bun run example:test
bun run example:typecheck
bun run example:verify
bun run example:build
bun run example:check-boundary
bun run example:build:carapace
bun run example:react-native:test
bun run example:react-native:typecheck
bun run example:react-native:verify
```

Run the production app with `bun run example:dev`. Run the deterministic workbench with `bun run example:carapace`, then select `empty`, `populated`, or `write failure` from its scenario navigation.

Run the Expo workbench with `bun run example:react-native`. Its verification command exports iOS and Android production bundles plus the deterministic React Native Web composition with paired source maps, proves the expected shared and platform-specific modules were selected, and rejects native/web cross-contamination. It does not replace browser-driven semantic assertions or direct device evidence.

See [Architecture](./docs/architecture.md), [Adoption](./docs/adoption.md), [Verification](./docs/verification.md), and [Wire formats](./docs/wire-formats.md) for durable contracts.

## Contribute and report vulnerabilities

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Report suspected vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

Carapace is available under the [MIT License](./LICENSE).
