---
name: carapace-setup
description: Add or revise a Carapace deterministic development composition around product-owned ports, strict JSON worlds, scenarios, coverage claims, probes, and separate production-safe entries. Use when asked to adopt Carapace, build a deterministic UI workbench, replace slow frontend dependencies with fixtures, or repair a Carapace setup that leaks into production.
---

# Carapace setup

## Inspect the product boundary

1. Read every applicable `AGENTS.md`, the package manifest, build configuration, production entry, feature state, and existing tests.
2. Trace the external dependency that makes the target state slow or nondeterministic.
3. Choose the lowest product-owned semantic port above that dependency and below the behavior under review.
4. State which adapter, service, host, platform, or device behavior the deterministic composition will replace and therefore cannot prove.

Do not simulate a provider SDK or wire protocol when the product can own a smaller domain port. Do not fork product UI or reducers into fixture-only copies.

## Separate production first

1. Define the port in production-safe product code.
2. Move provider, native-module, storage, or service imports into a production adapter.
3. Compose production from a production-only entry.
4. Add Carapace as a development dependency and create a distinct Carapace entry and output directory.

Reject a design that conditionally imports fixtures from a query string, build flag, or runtime environment variable inside the production entry.

## Define the deterministic surface

1. Define one bounded JSON world with a literal version.
2. Parse it from `unknown`; reject unknown keys, unsupported versions, duplicate identifiers, inconsistent states, and exceeded bounds.
3. Call `defineCarapace` with a validated default, stable scenario IDs, and exact `fixture`, `mixed`, or `direct` coverage entries.
4. Implement deterministic adapters for the same product ports. Use logical time for product delays and activity scopes for asynchronous work.
5. Use exact scripts only when request or event order is part of the claim. Keep arbitrary valid interactive behavior stateful in the product adapter.
6. Call `createCarapaceSession` to own activation, store, clock, activity, product construction, probe observation, cancellation, and reverse-order cleanup.

Treat the shared world store as a scenario seed and activity ledger. Let product adapters own mutable repositories or event streams after construction.

## Add the development entry

Render the real product interface with deterministic adapters. Install the browser bridge and fail-closed application-fetch firewall only in a browser Carapace entry. Expose the validated coverage list and count blocked requests, unexpected calls, leaked work, and malformed scripts as named violations.

Display activation failures. Never fall back from malformed explicit activation to a nearby valid scenario.

## Prove behavior and exclusion

Add focused tests for:

- accepted and rejected worlds;
- scenario and coverage drift;
- deterministic adapter success, declared failure, cancellation, and cleanup;
- exact-script consumption and remaining work when scripts are used; and
- emitted production output containing a forbidden marker.

Build production and Carapace separately. Scan emitted production assets for package names, wire schemas, reserved query keys, fixture and workbench markers, and browser globals. Fail a scan that inspects no files.

Update the nearest `AGENTS.md`, package README, and command documentation. Run the narrow tests while iterating, then the repository's complete in-scope gate.

## Report the result

Name the selected port, deterministic scenarios, proof modes, commands run, production surfaces scanned, and direct evidence that still remains. Do not describe fixture evidence as proof of a replaced external system.
