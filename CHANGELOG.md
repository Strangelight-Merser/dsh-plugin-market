# Changelog

All notable changes are documented here. The project follows Semantic
Versioning after its first public release.

## [Unreleased]

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
