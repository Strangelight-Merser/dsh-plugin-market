# Changelog

All notable changes are documented here. The project follows Semantic
Versioning after its first public release.

## [Unreleased]

### Added

- Functional categories with compact filtering and per-category counts.
- Automatic category inference for GitHub discoveries from names,
  descriptions, and repository topics.

### Changed

- Removed verification labels from the market UI; catalog admission remains a
  structural filter rather than a security or continuous runtime guarantee.
- Made online catalog refresh status explicit in the market header.

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
