# Verification

Carapace reports deterministic activity and proof boundaries. The product verifier decides which scenarios to run, which interactions to perform, and which evidence closes each claim.

## Wait for quiescence

Read `window.__carapace.snapshot()` through the browser bridge. A snapshot is quiet when:

- the current store generation has zero active operations;
- every product-named pending counter is zero; and
- the same generation, revision, and counter state remains stable for the verifier's bounded settle interval.

Do not replace this join with a fixed sleep. Logical fixture duration does not determine when the browser, product state, or adapter work is ready.

Quiescence excludes violation counters by design. A verifier must separately reject every violation relevant to its claim, including blocked network calls, unexpected requests, unused required script steps, malformed transport values, leaked subscriptions, page errors, and console errors.

## Assert product behavior

A quiet probe does not prove the interface is correct. After the join:

1. Assert the expected route and semantic content.
2. Perform the scenario's product action.
3. Join quiescence again.
4. Assert the resulting product state and relevant accessibility or layout conditions.
5. Capture bounded diagnostics or visual evidence when the claim needs them.

The package does not choose a browser driver or visual-comparison policy. Keep those decisions in the product verifier.

## Report coverage without promotion

Report each catalog entry against the scenarios and direct gates actually exercised:

- `verified`: every declared fixture scenario ran and passed, or all named halves of a mixed claim passed.
- `partial`: some declared evidence passed, but required scenarios or direct gates remain.
- `not-exercised`: the run produced no evidence for the claim.
- `direct-required`: the claim cannot be closed by this deterministic run.

Never report a fixture scenario as proof of the adapter, service, host, browser assembly, operating system, or device it replaced.

## Scan production output

Build the production entry independently, then scan emitted JavaScript, source maps, HTML, CSS, native bundles, executables, or packaged assets as appropriate. Each product owns marker policy. Include the package name, wire schemas, reserved query keys, fixture identifiers, bridge globals, and product workbench markers. When a bundler removes import specifiers, inspect source-map module paths as structural evidence too.

Fail when no expected executable and source-map files were scanned, and positively require stable markers for the intended production entry. An empty, metadata-only, or unrelated clean bundle is not evidence.

## Preserve bounded evidence

Record the scenario identifier, activation hash, route, final probe, semantic assertions, violations, console and page errors, and artifact paths. Keep generated evidence out of source control unless the repository explicitly treats a fixture or baseline as reviewed source.

Carapace does not include browser-worker reuse, screenshot deduplication, video capture, scene detection, or storyboard generation. A product may add those mechanisms without changing the probe and coverage contracts.

## Verify React Native exclusion

An Expo web export may intentionally contain Carapace while iOS and Android production exports must not. Build each platform through its real Metro entry resolution with external source maps. Require native product and adapter markers, reject Carapace or web-composition modules from the maps, scan emitted contents as defense in depth, and positively require Carapace markers from the web export. Keep native platform, module, layout, and device claims `direct` even when the React Native Web composition and both exclusion scans pass.
