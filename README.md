# Carapace

Carapace is a TypeScript kernel for running a product's real interface and state machinery against deterministic implementations of product-owned ports. It supplies strict scenario activation, JSON-safe fixtures, logical time, generation-safe stores, probes, exact scripts, and opt-in React and browser bindings.

Read [Carapace: a harness for your frontend](https://prmte.com/articles/carapace-a-harness-for-your-frontend) for the method and motivation.

## Install

Pin the public repository to an immutable version tag:

```json
{
  "devDependencies": {
    "@cclrte/carapace": "github:CCLRTE/carapace#v0.1.0"
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

## Package surfaces

| Import | Purpose | Runtime boundary |
| --- | --- | --- |
| `@cclrte/carapace` | Definitions, scenarios, fixtures, logical time, stores, effects, resources, and coverage | Framework-free |
| `@cclrte/carapace/core` | Explicit alias of the default core surface | Framework-free |
| `@cclrte/carapace/react` | Typed context, provider, and external-store hooks | Optional React peer |
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

This repository contains the deterministic kernel, browser bridge, production-exclusion pattern, agent skills, and a small runnable example. It does not contain a browser driver, browser-worker pool, screenshot deduplication, video recording, PySceneDetect integration, or storyboard generation. Use the browser tooling that fits your product and treat recorded media as evidence, not as the definition of correctness.

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
```

Run the production app with `bun run example:dev`. Run the deterministic workbench with `bun run example:carapace`, then select `empty`, `populated`, or `write failure` from its scenario navigation.

See [Architecture](./docs/architecture.md), [Adoption](./docs/adoption.md), [Verification](./docs/verification.md), and [Wire formats](./docs/wire-formats.md) for durable contracts.

## Contribute and report vulnerabilities

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request. Report suspected vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).

Carapace is available under the [MIT License](./LICENSE).
