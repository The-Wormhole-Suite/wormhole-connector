# Changelog

All notable user-facing changes to Wormhole Connector are documented here.

## Unreleased

### Added

- AdGuard Home 0.107.58+ as a second backend for global protection, domain rules, persistent-client scopes, and recoverable temporary actions.
- Mixed Pi-hole/AdGuard Home connector sets with common scope resolution.
- Conflict-checked AdGuard custom-rule updates that preserve unrelated and complex rules.
- Explicit mixed-state reporting and rollback details for multiple Pi-hole instances.
- Versioned, validated local settings export and import with backend descriptors and a mandatory preview.
- Optional per-category browser synchronization for non-secret settings.
- Spanish, French, Brazilian Portuguese, Polish, Italian, and Dutch locale bundles in addition to English and German.
- Reverse-proxy-aware Pi-hole API URL handling.
- Build, security, release, backup-format, attribution, and Mozilla-review documentation.

### Changed

- Renamed the extension to Wormhole Connector as part of The Wormhole Suite.
- API sessions are deduplicated, held only in session storage, and explicitly closed when connection settings are replaced.
- Multi-connector domain, scope, and global protection actions now use preflight checks, operation locks, and best-effort rollback.
- Pi-hole v6 update detection now uses the current v6 response structure.
- Vue is bundled as runtime-only code and CSS is extracted into static files for store review.

### Fixed

- Preserved valid spaces in Pi-hole passwords.
- Prevented older connection checks from overwriting newer results.
- Preserved failed legacy recovery records instead of silently discarding them.
- Replaced destructive version migration with targeted, non-secret session invalidation.
- Made repeated timer preset values safe in Vue lists.
- Removed the inherited third-party uninstall survey.

Earlier prerelease notes remain available in Git history.
