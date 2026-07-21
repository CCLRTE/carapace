# Contents

- `src/` – the real React Native screen, product-owned device-status port, production adapter, and platform-resolved roots.
- `carapace/` – strict worlds, definition, deterministic adapter, session, React Native Web workbench, tests, and native-output scanner.
- `app.json`, `index.ts`, and `metro.config.cjs` – minimal Expo application and monorepo/public-repository resolution.
- `verify.ts` – isolated iOS, Android, and web exports plus native production-boundary scans.
- `guide.md` – commands, structure, scenarios, and proof limits; exported publicly as `README.md`.

# Guidelines

- Keep `src/DeviceStatusApp.tsx` and `src/device-status-port.ts` free of Carapace imports and vocabulary.
- Keep `root.native.tsx` production-only and `root.web.tsx` Carapace-only; do not choose the deterministic composition with a runtime flag.
- Keep React Native imports in the example. The Carapace package runtime remains independent of React Native and Expo.
- Keep the deterministic port network-silent, abortable, activity-accounted, and seeded only from the active strict world.
- Export both native platform bundles with source maps; require the native product/adapter entries and reject Carapace or web-composition modules structurally. This remains exclusion evidence, not device-behavior evidence.
- Treat browser rendering as fixture evidence; React Native platform detection, native layout, appearance, and device execution remain direct.
