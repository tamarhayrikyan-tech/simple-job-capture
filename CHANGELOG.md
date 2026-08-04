# Changelog

All notable changes to Simple Job Capture are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-08-04

### Changed

- **Simple Job Capture is now free with no capture limit.** Every feature works for every user, with no counter or gate of any kind.
- **Added an optional donation banner.** A small, dismissible banner appears after your 3rd capture asking if you'd like to support development. A slightly fuller version appears at 20 captures. Both can be snoozed for 14 days; neither affects any functionality.

### Removed

- The 20-capture limit and unlock prompt
- Early-adopter pricing language

## [1.1.0] - 2026-05-07

Initial public release.

### Highlights

- One-click capture of job postings from any website
- Local tracker with inline editing, CSV export/import, and a daily docket view
- Extension makes zero network requests of its own — all data stays on the user's device
- MIT-licensed; full source code is public

### Privacy and security

- The extension stores job data in the browser's local extension storage; nothing is transmitted.
- Honor-system paywall: free for the first 20 captures, then a one-time $4.99 unlock via Gumroad. Clicking "Buy" opens Gumroad in a new tab; the extension itself never communicates with Gumroad. Clicking "I already paid" sets a local `unlocked` flag — no license key, no server verification.
- The 🔍 Lookup button next to each Company Address field opens a Google search in a new tab when the user clicks it. This is the only feature that involves a third-party service besides Gumroad. Disclosed in `PRIVACY.md` and the README.
- Permissions: `activeTab`, `storage`, and `scripting`. No `<all_urls>` or other broad host permissions.
- CSV import/export hardening: rendered job titles are only made into clickable links when the URL uses `http://` or `https://` (defends against `javascript:`, `data:`, and other dangerous schemes from poisoned imports). CSV exports prepend a single quote to any cell starting with `=`, `+`, `-`, `@`, or tab/CR (defends against spreadsheet formula injection). The `requirements` field is HTML-escaped on render.
- Storage transparency: every key the extension writes to local storage is documented in `PRIVACY.md` (`captureCount`, `unlocked`, `todaysDocket`, `lastExportDate`, `reminderDismissed`).

[1.1.0]: https://github.com/tamarhayrikyan-tech/simple-job-capture/releases/tag/v1.1.0
