# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.1.0] - 2026-02-20

### Changed
- **Performance: O(1) approval resolution lookup** — `detectApprovalResult()` now extracts UUIDs via regex and performs a direct `Map.has()` lookup instead of iterating all pending entries. The old O(n) linear scan is replaced with O(1) hash lookup for full UUIDs, with a fallback prefix scan only for truncated IDs.

### Added
- **Gateway denial detection** — New `resolveAction()` function and `RE_GATEWAY_DENIAL` regex detect when the gateway auto-denies an approval due to timeout (`Exec denied.*approval-timeout`). The plugin now immediately cleans up stale Telegram buttons when the gateway reports a timeout, instead of waiting for the stale cleanup timer.
- **Robust short hex matching** — Short approval IDs are now matched via `\b([a-f0-9]{8,})\b` regex with `startsWith()` prefix matching, supporting variable-length truncated IDs instead of the previous hardcoded 8-char `slice()`.

### Fixed
- Synced `openclaw.plugin.json` manifest version with `package.json` (was stuck at 4.0.2)
- Updated header comment in `index.ts` to reflect current version

## [4.0.3] - 2026-02-16

### Fixed
- Auto-detect `botToken` key from `channels.telegram.botToken` in addition to `channels.telegram.token`
- Improved README setup documentation with clearer quick start instructions

## [4.0.2] - 2026-02-15

### Added
- `SECURITY.md` — vulnerability reporting policy and security model documentation
- `.npmignore` — explicit defense-in-depth to prevent accidental file leaks to npm

### Fixed
- README example path changed from personal path to generic `~/Projects/...`

### Security
- Documented plugin's in-process trust model and input validation approach
- Added best practices section for users installing community plugins

## [4.0.1] - 2026-02-15

### Added
- Composite banner image showing the full approval workflow
- `tsconfig.json` for IDE TypeScript support
- `uiHints` in manifest for better config UI labels

### Changed
- Rewritten README with simplified 3-step Quick Start for beginners
- FAQ section with 5 common questions
- Cleaner troubleshooting table with less jargon

### Fixed
- `/approvalstatus` command showing raw HTML `<b>` tags instead of plain text
- Plugin ID mismatch warning on gateway startup (aligned `package.json` name with manifest `id`)

## [4.0.0] - 2026-02-14

### Added
- Initial public release
- One-tap inline keyboard buttons: ✅ Allow Once · 🔏 Always · ❌ Deny
- Auto-resolve: edits message after decision, removes buttons
- Expiry handling: stale approvals auto-cleaned after configurable timeout
- `/approvalstatus` diagnostic command with health check
- Auto-detection of `chatId` and `botToken` from `channels.telegram` config
- Modular architecture: `index.ts` orchestration + 5 lib modules
- Full `configSchema` with JSON Schema validation
- MIT license
