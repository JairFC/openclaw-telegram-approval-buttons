# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
