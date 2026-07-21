# Adopt Carapace in a product

Add Carapace after identifying the product behavior and external boundary under review. Do not begin by designing fixtures around a provider SDK.

## 1. Define the product port

Put a semantic interface beside the product feature. Move provider, storage, native-module, or service imports into a production adapter. Compose that adapter from the production entry.

The interface and feature code must not import Carapace.

## 2. Define the world

Create a development-only Carapace directory. Define one JSON-safe world with a literal version and bounded product data. Parse from `unknown`; reject extra fields, invalid identifiers, duplicate records, unbounded strings, unsupported versions, and non-JSON values.

Add example tests for useful worlds and rejected regressions. Add property tests when the parser has meaningful arbitrary-input or round-trip laws.

## 3. Define scenarios and coverage

Call `defineCarapace` once with the world parser, one validated default, stable scenario identifiers, and explicit coverage entries.

- Use `fixture` when deterministic ports support the full claim.
- Use `mixed` when the fixture claim requires named direct adapter or service evidence.
- Use `direct` when the real external system is the claim.

Do not attach scenarios to a direct claim. Do not leave a fixture claim without a scenario.

## 4. Implement deterministic adapters

Implement the same product ports as production. Seed adapters from the active world. Use logical time for product delays, activity scopes for asynchronous work, and exact scripts when request or event order is part of the claim.

Unknown requests and unmapped operations must fail. Keep remaining scripted work and product-specific leaked activity visible to the probe.

## 5. Create one session

Use `createCarapaceSession` from `@cclrte/carapace/testing` to activate the query, create the store, clock, activity scope, product adapters, observation counters, cancellation signal, and cleanup stack.

Register cleanup while constructing the product. Dispose subscriptions, timers, scripts, repositories, and event sources when the session ends.

## 6. Add a separate composition boundary

Render the real product interface with deterministic adapters from a distinct Carapace graph. A web or desktop product may use a separate entry. An Expo product may keep a shared entry and route tree while an extensionless import resolves to nested `.native` and `.web` composition modules. In either shape, production modules cannot reach the Carapace graph.

Install `installCarapaceBrowserBridge` and `installCarapaceFetchFirewall` only in the Carapace browser composition, never in a production entry or native platform variant.

Expose the validated coverage list through the bridge. Count blocked requests and other relevant failures as violations.

## 7. Verify behavior and exclusion

Test the parser, definition, deterministic adapters, failures, cancellation, cleanup, and exact-script drain behavior. Build the production and Carapace graphs independently. Scan emitted production output for Carapace markers. Drive representative scenario URLs with the browser tool used by the product.

Wait for a stable quiet probe, reject relevant violations and runtime errors, assert behavior in product terms, and retain the evidence needed by each coverage claim.

The [todo example](https://github.com/CCLRTE/carapace/tree/main/examples/todos) implements this sequence without a backend or credentials.

## React Native and Expo

Use platform resolution rather than a runtime flag. A small app can split `root.native.tsx` from `root.web.tsx`. With Expo Router or a shared navigation entry, put the split lower in the graph:

1. Keep the Expo Router entry, route modules, layouts, shared screens, reducers, and feature state common.
2. Import a narrow composition or navigation-provider module without an extension.
3. Implement its `.native.tsx` variant with production adapters and native navigation providers.
4. Implement its `.web.tsx` variant with the Carapace world, session, deterministic ports, workbench, browser bridge, and fetch firewall.
5. Pass the same product-owned ports and shared state into the same screens from both variants.

Do not copy route behavior or feature state into the web variant. If native-only navigation chrome cannot render on web, provide the smallest substitute needed to reach the shared screens and label its proof boundary explicitly.

This `.web` fixture pattern assumes web is not also a production target. When the product ships a real web app, keep its web variants production-only and give Carapace a distinct development entry or app graph.

| Evidence | Supports | Does not support |
| --- | --- | --- |
| Carapace web behavior | Shared screen semantics, shared feature state, deterministic port interactions, and a literally shared navigation reducer | Substituted stacks, tabs, headers, safe areas, gestures, transitions, native back handling, deep links, or OS integration |
| Native source-map selection | The emitted graph selected the claimed shared modules, `.native` composition, and production adapters while excluding the web fixture graph | Correct runtime behavior, layout, module responses, or device behavior |
| Web source-map selection | The emitted graph selected the claimed shared modules, `.web` composition, and Carapace provider | Native navigator or platform behavior |

Export iOS and Android independently with external source maps. Require at least one executable with a paired map for each platform. In every native map, positively match stable normalized path suffixes for the expected shared route, screen, and state modules, the `.native` composition, and the production adapter. Reject `.web` composition, workbench, fixture, bridge, and Carapace package paths. For the web export, positively require the shared behavior modules and the `.web` Carapace composition. Keep content-marker scans as defense in depth; a clean map that never selected the intended product graph must fail.

These gates prove structural selection and exclusion. Native layout, modules, platform values, navigation chrome, operating-system behavior, and physical-device behavior remain direct evidence. Split coverage entries when the shared feature and the platform shell require different proof modes.

The [React Native example](https://github.com/CCLRTE/carapace/tree/main/examples/react-native) is a minimal Expo implementation of this split.
