# link-registry agent notes

- Zero runtime dependencies: the action runs `bin/link-registry.js` on the runner's Node with no install. Keep it that way.
- Tests: `pnpm test` (node --test). `test/fixture-build.test.js` runs a real Antora build; set `LINK_REGISTRY_SKIP_BUILD=1` to skip.
- Changelog lives in `docs/modules/ROOT/pages/changelog.adoc` (+ `changelog-details/`). release.yml extracts notes from the `=== vX.Y.Z` heading.
- Release: bump package.json, changelog, push tag `vX.Y.Z`; release.yml moves `v0`.
- Docs must pass `pnpm links:check` (registry in `docs/antora.yml`).
