# Changelog

All notable changes to Simple Job Capture are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-05-04

Initial public release.

### Highlights

- One-click capture of job postings from any website
- Local tracker with inline editing, CSV export/import, and a daily docket view
- Extension makes zero network requests of its own — all data stays on the user's device
- MIT-licensed; full source code is public

### Privacy and security

- The extension stores job data in the browser's local extension storage; nothing is transmitted.
- Honor-system paywall: free for the first 20 captures, then a one-time $4.99 unlock via Gumroad. Clicking "Buy" opens Gumroad in a new tab; the extension itself never communicates with Gumroad. Clicking "I already paid" sets a local `unlocked` flag — no license key, no server verification.
- The 🔍 Lookup button next to each Company Address field opens a Google search in a new tab when the user clicks it. This is the only feature that involves a third-party service besides Gumroad. Disclosed in `PRIVACY.md`.
- Permissions: `activeTab`, `storage`, and `scripting`. No `<all_urls>` or other broad host permissions.
- The `requirements` field is HTML-escaped on render, preventing markup injection via CSV import.

[1.1.0]: https://github.com/tamarhayrikyan-tech/simple-job-capture/releases/tag/v1.1.0
