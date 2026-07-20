# Contributing

Issues and focused pull requests are welcome in the public repository.

The repository is generated from a canonical workspace. A maintainer ports an accepted public change into that workspace before the next snapshot. The sync job stops when a public commit is not represented in the generated tree, so it cannot silently overwrite a contribution.

Run the standalone gate before opening a pull request:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run check
```

Keep core changes product-, framework-, and platform-neutral. Add readable example tests for concrete behavior. Add a property test for parsers, round trips, ordering, reset behavior, cancellation, and other laws over arbitrary input.

Changes to a wire schema or reserved activation key require a versioned migration and compatibility tests. Changes to the todo example must preserve separate production and Carapace entries and pass the emitted production-boundary scan.
