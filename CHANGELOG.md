# Changelog

All notable changes are documented here. The project follows Semantic
Versioning after its first public release.

## [0.7.0] - 2026-09-13

### Added

- Support for DSH 0.1.5-rc.1 and 0.1.5-rc.2, with Cordis 4.0.2 and the
  current client renderer/settings shell dependencies.
- Functional categories with per-category counts and category inference for
  GitHub discoveries, plus explicit online refresh status.
- Batch plugin changes and apply them with one explicit DSH Web restart;
  recover the page after restart while retaining browser authentication.
- Real packed-plugin contract tests for Web boot, authentication, and process
  restart, run against both supported CLIs on Linux and macOS in CI.

### Changed

- Remove the retired client-runtime dependency and replace the old single
  supported-version gate with the two tested DSH versions.
- Preserve the original versions in historical catalog evidence. Older
  evidence cannot authorize installation or earn current runtime credit.
- Retain and revalidate historical plugin locations outside GitHub's capped
  search window; compare scheduled refreshes with the existing automation PR
  as well as main to avoid duplicate timestamp-only commits.
- Keep delisted managed plugins available for disable and uninstall; allow
  transient preview retries and correct refresh polling and state reporting.
- Remove verification labels from the market UI; catalog admission remains a
  structural filter rather than a security or continuous runtime guarantee.

### Security and reliability

- Protect all market HTTP routes with the host Connection's browser login
  and Host/Origin checks, in addition to exact same-origin mutation checks.
- Validate generated snapshots and installed artifacts; reject unsafe paths,
  duplicate IDs, malformed manifests, and inconsistent package identities.
- Abort registry publication on transport failures instead of dropping entries.
- Serialize mutations and restart requests; report restart-launch failures and
  bound subprocess lifetime before rollback.
- Require the exact previewed source and keep dependency scripts disabled on
  installation and removal. Restore metadata after failed artifact validation.
- Publish registry changes through one reusable reviewed PR without weakening
  the normal code-review requirements.

## [0.5.0] - 2026-08-15

### Added

- Fail-closed catalog admission for every npm or GitHub install locator.
- Transparent evidence-based assessment for every catalog entry.
- A manually reviewed recommendation view with explicit use cases and risks.
- Full, wrapping project descriptions and expandable assessment details.
- Public evaluation policy and product roadmap.

### Changed

- GitHub Topic results are no longer listed until a native DSH manifest is
  confirmed at the declared location.
- Runtime and bundled refresh scan up to GitHub Search's ten-page limit.
- Simplified catalog states to `installable`, `verified`, and `blocked`.
- Reworked the README around a minimal, lightweight, easy-to-use product story.

## [0.4.0] - 2026-08-15

### Added

- Side-effect-free install preflight with exact source confirmation.
- Automatic six-hour catalog refresh with bundled offline fallback.
- Star and recent-activity sorting.
- Linux and macOS continuous integration.

### Changed

- Renamed the project to DSH Plugin Market so discovery is not confused with
  verification.
- Reduced the UI to discovery, search, sorting, installation, and lifecycle
  controls.
- Installed plugins are enabled by default and runtime changes clearly require
  a DSH Web restart.

### Security

- Reject non-DSH package manifests before profile mutation.
- Require installation to match the exact source shown during confirmation.
- Keep dependency installation scripts disabled.
