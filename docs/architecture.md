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
- optional React store bindings that work with React DOM and React Native; and
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

The default and `/core` exports do not import React or browser globals. React bindings live under `/react`, session and scripted test utilities under `/testing`, and browser globals under `/web`. The package runtime does not import React Native or Expo; the React Native example composes these existing surfaces from a platform-resolved web entry.

The fetch firewall intercepts application calls to the `fetch` function in its JavaScript realm. It does not intercept WebSockets, EventSource, navigation, asset loading, native calls, or traffic in another realm. Install it only in a Carapace browser entry.

## Resolve React Native compositions structurally

For a small Expo app, Metro can choose distinct roots:

```text
root.native.tsx                 root.web.tsx
       |                              |
native product adapters       Carapace session + adapters
       |                              |
       +-------- real screen --------+
```

A root split is the simplest shape, not a requirement. Metro applies platform resolution to extensionless imports below the root too. An Expo Router app can keep its shared entry, route tree, layouts, screens, and feature state while moving only the composition seam into `.native` and `.web` variants:

```text
Expo Router entry + shared routes/layouts
                  |
     import "./app-composition"
          /                         \
app-composition.native.tsx   app-composition.web.tsx
native providers, chrome,    Carapace session, deterministic
and production adapters      adapters, and web fixture chrome
          \                         /
             shared screens/state
```

The shared module imports `./app-composition` without a platform suffix. The native variant owns production adapters and native navigation providers. In a native product whose web target is the fixture surface, the web variant owns the Carapace session and deterministic adapters. Route files, screens, reducers, and other feature state stay shared unless platform behavior is itself the subject of a direct test. Do not duplicate feature behavior across the variants or choose a composition with a runtime flag.

If web is also a production target, keep its `.web` composition production-safe. Give Carapace a distinct development entry or app graph instead of replacing the production web composition. Platform suffixes define build graphs; they are not a substitute for a second entry when two compositions target the same platform.

The web variant may substitute browser-renderable chrome for native-only stacks, tabs, headers, safe areas, or gestures. Browser fixture evidence can then support claims about the shared screen, shared feature state, and product-port interactions. It cannot prove the substituted chrome's native layout, transitions, back behavior, deep linking, gesture handling, or operating-system integration. Record those as separate direct or mixed claims instead of treating a visually similar web shell as the native navigator.

Keep the default root production-safe and Carapace in `devDependencies`. Export iOS, Android, and the Carapace web composition separately with source maps. For each native map, positively require the claimed shared route, screen, and state modules plus the `.native` composition and production adapter; reject the `.web` composition and Carapace modules. For the web map, positively require those same shared behavior modules plus the `.web` composition and Carapace provider. An absence-only scan can pass on an unrelated bundle, so it is not sufficient structural evidence.
