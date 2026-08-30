# Recipe import fixtures

These synthetic fixtures are original project test data and may be used, modified, and redistributed with this repository. They contain no copied recipe prose or third-party images.

- HTML cases test parsing after the safe-fetch boundary.
- `.expected.json` files are partial-result assertions governed by `docs/technical/RECIPE-IMPORT-CONTRACT.md`.
- `url-policy-cases.json` uses injected DNS and redirect outcomes and must never make a real network request.
- `manifest.json` is the complete fixture index.

For deterministic tests, compute `contentSha256` from the exact decoded fixture bytes in the test harness. Evidence hashes should likewise be computed by the implementation; expected files assert stable locators and values instead of duplicating hashes.
