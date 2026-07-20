# Architecture

Carapace changes the development composition below the behavior under review. The real interface, feature state, reducers, parsing, and navigation remain. Deterministic adapters replace the external boundary that makes a state slow, unavailable, or nondeterministic.

## Own the semantic port in the product

Define a port in product vocabulary above a provider protocol:

```text
interface and feature state
            |
    product-owned port
       /           \
production         deterministic
adapter            adapter
```

Use the lowest port that preserves the behavior under review. A task interface should depend on a task repository, not a simulated database client. A desktop renderer should depend on a renderer-safe runtime transport, not a simulated native message protocol. The product owns request, response, event, and failure meanings.

Carapace owns product-neutral mechanics:

- strict JSON values, world parsing, canonical fixtures, and activation;
- serializable logical time and deterministic operation identifiers;
- generation-fenced stores, atomic transactions, activity accounting, and effects;
- scenario and fixture/mixed/direct coverage catalogs;
- deterministic sessions, probes, and exact scripted transports;
- optional React store bindings; and
- an optional browser bridge and fail-closed application-fetch firewall.

## Treat the world as a seed

Define one bounded, strict, versioned JSON world. Parse it from `unknown`, reject unknown fields, and return owned values. A scenario selects a world, route, and logical-runtime snapshot.

The shared store retains the immutable scenario seed and activity ledger. A product adapter may create mutable repositories, event streams, or projections from that seed. Do not turn the world store into a generic replay database for every product mutation.

## Keep production exclusion structural

Use distinct entries and compositions:

```text
production entry                 Carapace entry
      |                                |
production adapters + UI      deterministic adapters + UI
      |                                |
browser/service/platform       @cclrte/carapace
```

Do not conditionally import fixtures from a query string, build flag, or runtime environment variable inside the production entry. Put Carapace in `devDependencies`, compile it from a separate entry, and scan emitted production assets for package, wire, query, fixture, and workbench markers.

A clean marker scan is narrow evidence: the scanned files did not contain the configured markers. It does not prove native linkage, runtime loading, service behavior, or operating-system behavior.

## Keep optional surfaces isolated

The default and `/core` exports do not import React or browser globals. React bindings live under `/react`, session and scripted test utilities under `/testing`, and browser globals under `/web`.

The fetch firewall intercepts application calls to the `fetch` function in its JavaScript realm. It does not intercept WebSockets, EventSource, navigation, asset loading, native calls, or traffic in another realm. Install it only in a Carapace browser entry.
