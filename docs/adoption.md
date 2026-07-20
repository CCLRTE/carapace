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

## 6. Add a separate entry

Render the real product interface with deterministic adapters from a distinct Carapace entry. Install `installCarapaceBrowserBridge` and `installCarapaceFetchFirewall` there, never in the production entry.

Expose the validated coverage list through the bridge. Count blocked requests and other relevant failures as violations.

## 7. Verify behavior and exclusion

Test the parser, definition, deterministic adapters, failures, cancellation, cleanup, and exact-script drain behavior. Build both entries. Scan emitted production output for Carapace markers. Drive representative scenario URLs with the browser tool used by the product.

Wait for a stable quiet probe, reject relevant violations and runtime errors, assert behavior in product terms, and retain the evidence needed by each coverage claim.

The [todo example](https://github.com/CCLRTE/carapace/tree/main/examples/todos) implements this sequence without a backend or credentials.
