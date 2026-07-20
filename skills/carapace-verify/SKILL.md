---
name: carapace-verify
description: Verify an existing Carapace composition, including strict activation, deterministic settlement, semantic scenario behavior, coverage truthfulness, cleanup, and exclusion from production output. Use when asked to test, audit, validate, review, or report the proof boundary of a Carapace workbench or frontend verification run.
---

# Carapace verification

## Discover the declared contract

1. Read applicable `AGENTS.md` files, package scripts, Carapace definition, world parser, deterministic adapters, browser entry, verifier, and production-boundary policy.
2. List every scenario and coverage entry before running commands.
3. Map each `fixture`, `mixed`, and `direct` claim to the evidence required to close it.
4. Identify the production adapter, service, host, operating system, or device behavior replaced by each deterministic port.
5. Inspect each command before treating it as evidence. A script named `verify` may build and scan boundaries without driving a browser.

Do not infer a stronger proof mode from a passing screenshot or fixture interaction.

## Run deterministic checks

Run the repository's narrow Carapace typecheck, unit tests, property tests, and Carapace build when those commands exist. Report a missing property suite or browser verifier as `not present`; do not synthesize evidence. Prefer an existing isolated verifier or temporary output directory so builds do not dirty the source tree.

Verify that tests cover malformed worlds, explicit activation failures, adapter failures, cancellation, cleanup, and exact-script drain behavior when applicable.

When a browser verifier exists, drive stable scenario URLs and interact in product terms. Read the canonical `window.__carapace` bridge and parse its probe and coverage values. Do not trust ad hoc globals when the canonical bridge is available.

## Join the probe

Wait until the same generation, revision, activity totals, and pending counters remain quiet for the verifier's bounded settle interval. A quiet probe requires zero current activity and zero pending counters.

After each interaction:

1. Join quiescence again.
2. Reject relevant nonzero violation counters.
3. Reject page errors, unexpected console errors, unmapped or failed network calls, malformed transport values, leaked activity, and required script steps left unused.
4. Assert the route, visible semantics, accessibility state, and product result required by the scenario.

Never replace the probe join with a fixed sleep. Treat remaining work as a diagnostic unless the declared claim requires it to drain.

Definition activation, parser tests, and adapter unit tests do not close a claim about the real rendered interface. Such a claim requires the declared semantic and accessibility assertions against that interface.

## Verify production exclusion

Build the real production entry independently. Run its emitted-marker scanner across every declared production surface. Require at least one scanned file and reject package names, wire schemas, reserved query keys, fixtures, workbench strings, and browser bridge globals.

Remember that a clean marker scan proves only absence of those markers in those files. It does not prove native linkage, service behavior, or runtime loading.

## Classify the evidence

Report every coverage entry as one of:

- `verified` when every declared scenario ran through the real behavior named by the claim and passed its claim-specific semantic assertions, or every named half of a mixed claim passed;
- `partial` when some required evidence passed;
- `not-exercised` when the run produced no evidence for the claim; or
- `direct-required` when deterministic evidence cannot close the claim.

Keep a direct claim `direct-required` until every named host behavior is exercised, even when unit tests provide supporting evidence. Note that support separately.

Include `HEAD` plus dirty or clean working-tree status, commands, scenario results, final probes, production surfaces scanned, retained artifacts, and exact failures. Report absent property tests, browser probes, or artifacts as `not present` or `not observed`. State skipped direct gates once. Do not use credentials, contact live services, or expand into device testing unless the user placed those systems in scope.
