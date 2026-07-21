# Carapace

Carapace is a TypeScript kernel for running a product's real interface and state machinery against deterministic implementations of product-owned ports. It supplies strict scenario activation, JSON-safe fixtures, logical time, generation-safe stores, probes, exact scripts, and opt-in React and browser bindings.

<!-- article:carapace-a-harness-for-your-frontend:start -->
## [Carapace: a harness for your frontend](<https://prmte.com/articles/carapace-a-harness-for-your-frontend>)

> The open-source Carapace kernel keeps the real interface and its state machinery while product-owned runners supply deterministic worlds and evidence.

A coding agent can change a frontend in seconds and still spend minutes proving that the change works. The slow part is often not Chromium. It is reaching the necessary account and records, waiting for services or motion, then turning screenshots into evidence the agent can understand.

Carapace is a frontend testing harness built around that mismatch. Its published kernel runs the real interface and state machinery against a deterministic product world, exposes readiness and browser-automation seams, and leaves capture policy to a product-owned runner. It does not replace direct tests of the backend, browser assembly, or operating system. It makes fixture-expressible interface states cheap to inspect.

### The harness changes the test composition

A conventional end-to-end test assembles the production-shaped system. Carapace changes the composition below the behavior under review. The real shell, components, hooks, reducers, cache invalidation, and navigation remain. External systems are replaced at a product-owned port: an interface between product behavior and a backend, native host, model process, or other service.

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

The filenames are illustrative; the ownership boundary is not. Production and deterministic runtimes implement the same product-owned port, so the real interface remains above both. Worlds, scenarios, and evidence stay outside production code.

The [public Todo example](<https://github.com/CCLRTE/carapace/tree/main/examples/todos>) makes the seam concrete. The real `TodoApp` knows only the product's `TodoPort`. The production entry supplies browser storage; the Carapace workbench supplies a deterministic port created by its session:

**todo-port.ts and entry composition (abridged)**

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

The interface uses product words—todos and completion—not storage calls or Carapace types. Behind the port, the deterministic implementation can use a world, logical clock, and activity scope. Replacing that implementation does not change the component under review.

The deterministic side starts with one strict, versioned JSON world. A product adapter turns that world into the same response shapes and state transitions the interface expects. Reads serialize it; writes mutate it; the real mutation, invalidation, and refetch path converges as it would in production. Unknown requests fail loudly instead of falling through to a live service. The fixture is therefore a small executable model of the product state, not a loose pile of endpoint responses.

One web implementation mounts that composition in a same-origin iframe. The iframe is a separate browsing context, so portals stay inside its document, media queries see its viewport, and dynamic viewport units use its height. Its JavaScript context can replace `fetch` without changing the production application. Other products use separate development entries and deterministic implementations of semantic backend or native-runtime ports. The invariant is the same: production and Carapace meet at an owned boundary above the external system that makes verification slow or nondeterministic.

### Its speed comes from removing setup

[Playwright’s browser-context isolation](<https://playwright.dev/docs/browser-contexts>) is a strong default for end-to-end tests. Each test gets clean cookies, storage, and pages, which prevents failures from leaking between cases. That clean start still has a cost when every case must navigate, authenticate, seed a backend, wait for data, and reconstruct the application. A Carapace composition keeps isolation at the fixture boundary, allowing a product runner to reuse more of the mounted frontend.

The published kernel provides deterministic activation, reset, generation fencing, and quiescence primitives. A product-specific runner can use them to replace the world, storage, query state, and page tree while keeping a compatible browser worker and application bundle warm. Source-digest caching and byte-identical screenshot deduplication are optional runner optimizations, not guarantees of the kernel.

Logical time removes another source of delay. Carapace can advance product time faster than wall-clock time when a scenario is testing state transitions rather than animation fidelity. Motion cases still run at real speed when timing itself is under review. Product time remains explicit in the scenario; wall-clock time is spent only where fidelity requires it.

### Quiescence replaces sleeps

A fixed delay asks the wrong question: it waits for a duration rather than for the interface to become ready. Carapace exposes quiescence, meaning that the current generation has no known work left. A browser probe can check busy markers, in-flight deterministic requests, pending scripted reveals, loaded fonts and nearby images, and the absence of DOM mutations across consecutive frames. A capture begins when those signals agree, not when an arbitrary second has passed.

The same probe reports violations. An unhandled request, unused exact script step, console error, runtime error, leaked activity lease, or stale generation makes the run fail or leaves an explicit diagnostic. This is where [types and property tests in an agent-operated codebase](<https://prmte.com/articles/the-ai-codebase-types-and-property-tests>) matter: strict parsers keep malformed worlds from selecting a nearby valid state, while generated tests challenge reset, cancellation, serialization, and ordering laws that a few hand-written scenarios would miss.

The browser-driver helper remains product-owned. In this Playwright-style example, `waitForQuiescence` reads the browser probe until the same generation, revision, and zero-pending state stays stable, then rejects the violation counters relevant to the claim. Carapace does not require Playwright; the agent-authored check can still stay this small:

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

The check has no login, seed request, CSS selector, or fixed sleep. The named scenario supplies the starting world; the port carries the interaction through real product state; the second join waits for that state to settle.

Quiescence does not prove that the rendered result is correct. It proves that the declared deterministic work settled without a known violation. Semantic assertions, visual review, and direct integration tests still decide whether the result supports the claim.

### A runner can compress motion evidence

Video creates a different agent problem. A WebM preserves motion but is expensive to inspect, while uniform one-frame-per-second sampling can miss a menu that flashes, a transition that clips, or content that appears and disappears between samples. A product-specific runner can keep the full recording and use PySceneDetect, a video shot-detection library, to choose a bounded set of frames that better represents changes in the scene.

[PySceneDetect’s adaptive detector](<https://www.scenedetect.com/docs/latest/api/detectors.html>) compares adjacent-frame content against a rolling local average. A runner can distribute a frame budget across the detected scenes, favor their beginnings, middles, and endings, remove repeated source frames, and assemble the remainder into a storyboard. PySceneDetect’s version 0.7 path uses presentation timestamps so [variable-frame-rate recordings keep accurate timecodes](<https://www.scenedetect.com/docs/latest/cli/backends.html>). The result gives an agent more transition-relevant evidence without filling its context with every frame.

Scene detection is a selector, not an oracle. It can miss a slow layout drift or a defect that does not create a strong visual boundary. A runner that adopts this technique should record when it falls back to uniform FFmpeg sampling, keep the source video, and treat the storyboard as a reading aid. The published Carapace package does not record video, invoke PySceneDetect or FFmpeg, select frames, or judge images. Deterministic assertions and clean runtime evidence remain the gate; a model reviewing selected frames can be advisory without becoming the definition of correctness.

### Carapace is a method, not a framework

Carapace is a way to structure frontend verification, not a package that replaces a product’s stack. It asks each product to keep the real interface, identify an honest boundary that can be made deterministic, describe meaningful product states as named worlds, and run semantic scenarios against that composition. Familiar browser drivers, test runners, and media tools can sit underneath it.

The mapped responsibilities form a contract: deterministic state enters through an explicit boundary, real product code runs above it, the runner waits for product-defined readiness, and the evidence is tied back to a named scenario. The implementation can differ across web, native, and desktop products while preserving that shape.

That structure is what makes Carapace useful for agents. The published kernel lets an agent request a state by name, act in product terms, and wait on explicit readiness; the product runner decides what bounded evidence to capture. Direct tests still cover the systems behind the substituted boundary. Carapace makes the frontend’s own state graph fast, repeatable, and legible enough to inspect on every change.
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

For React Native, use the same React, testing, and web surfaces from a platform-resolved Expo composition. The [React Native example](https://github.com/CCLRTE/carapace/tree/main/examples/react-native) renders one real screen through a native production port on iOS and Android and a deterministic Carapace port on web. It exports and scans both native bundles without requiring a simulator.

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

Run the Expo workbench with `bun run example:react-native`. Its verification command exports iOS and Android production bundles with source maps, proves the expected native entries were selected, rejects Carapace and web-composition modules, and exports the deterministic React Native Web composition into temporary directories. It does not replace browser-driven semantic assertions or direct device evidence.

See [Architecture](./docs/architecture.md), [Adoption](./docs/adoption.md), [Verification](./docs/verification.md), and [Wire formats](./docs/wire-formats.md) for durable contracts.

## Contribute and report vulnerabilities

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Report suspected vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

Carapace is available under the [MIT License](./LICENSE).
