# Simple Job Capture

A browser extension that captures job postings in one click and keeps them organized in a local tracker.

**Open source. MIT licensed. Your data stays on your computer.**

Available for Chrome today, with a Firefox build planned.

---

## What it does

- **One-click capture** — click the extension icon on any job posting and it auto-fills title, company, location, salary, requirements, deadline, and more
- **Local tracker** — view all saved jobs in a clean table, edit any field inline
- **Today's docket** — pull jobs into a daily working set so you don't lose track of what you're applying to
- **CSV export/import** — take your data anywhere
- **Smart dates** — handles "Jan 25", "1/25/2026", or "tomorrow", and figures out whether a date is a past posting or future deadline
- **Company address lookup** — helpful if you need HQ addresses for unemployment certifications. Clicking the 🔍 Lookup button opens a Google search in a new tab; you copy the address back manually. The extension itself never communicates with Google.
- **No accounts, no cloud, no tracking** — all data lives in your browser's local storage

Works on LinkedIn, Indeed, Idealist, and most job boards and company career sites.

---

## Pricing

Free for your first 20 captures. After that, a one-time **$4.99 early adopter unlock** gives you unlimited captures via [Gumroad](https://tamarhayri.gumroad.com/l/znqaf).

The unlock is **honor-system**: there's no license-key verification or server call. You click "I already paid" inside the extension and it flips a local `unlocked` flag in browser storage. The checkout itself happens on Gumroad, which sends you a receipt.

This is a deliberate design trade-off. Verifying payments would require the extension to talk to a server, which would compromise the privacy promise that the extension never makes network requests. We chose privacy over enforcement.

**If you'd rather not pay:** the source is MIT-licensed. Clone the repo, remove the paywall checks, and build your own unlimited version. This is allowed and explicitly fine. Paying supports continued development.

---

## Install from source

The extension isn't on the Chrome Web Store yet. To use it today, load it as an unpacked extension:

1. **Download the code**
   - Clone: `git clone <repo-url>` **or** download the ZIP from GitHub and extract it
2. **Open Chrome's extensions page**
   - Go to `chrome://extensions/`
3. **Enable Developer mode** (toggle in the top-right corner)
4. **Load unpacked**
   - Click "Load unpacked"
   - Select the folder containing `manifest.json`
5. **Pin the extension** (optional)
   - Click the puzzle-piece icon in the toolbar, then pin "Simple Job Capture"

The extension keeps working across browser restarts. Chrome may occasionally nag about developer-mode extensions — that's normal for unpacked installs.

A Firefox build will be added in a future release.

---

## How to use

**Capture a job**
1. Open any job posting in a tab
2. Click the Simple Job Capture icon
3. Review the auto-extracted fields, edit anything that looks wrong, add notes if you want
4. Click "Save Job"

**View your tracker**
- Click the extension icon, then "View Tracker"

**Manage jobs**
- Click any field (title, company, requirements, notes, dates) to edit inline; press Enter or click away to save
- **Export CSV** — downloads everything as a spreadsheet
- **Import CSV** — restores from a backup
- **Delete** — removes a single job
- **Open** — reopens the original posting

**Back up regularly.** All data lives in your browser's local storage. Uninstalling the extension deletes it, so export a CSV every so often.

---

## Privacy

Simple Job Capture does not collect, transmit, or share any data. Everything you capture stays in your browser's local storage on your device.

- No analytics
- No external API calls (the extension doesn't contact any servers)
- No account required
- The Gumroad checkout opens in a separate browser tab when you click "Buy" — the extension never communicates with Gumroad directly

See [PRIVACY.md](PRIVACY.md) for the full policy.

---

## Open source

Simple Job Capture is released under the [MIT License](LICENSE). You can read, modify, fork, and redistribute the code freely — including for commercial use — as long as you keep the copyright notice.

Because it's open source, you can:
- Inspect every line of code before installing
- Modify it for your own workflow
- Package your own build if you don't want to use the version distributed through browser stores
- Remove the paywall if you want — it's a trust-based system, not a technical lock

This is closer to old-school shareware than modern SaaS. The extension works fully without payment for the first 20 captures, the source is fully open, and the paywall relies on goodwill rather than enforcement.

---

## Support

- **Bugs / feature requests:** open a GitHub issue
- **General questions:** leave a review or use the feedback link in the extension
- **Privacy concerns:** see [PRIVACY.md](PRIVACY.md)

---

## Author

Built by Tamar Hayrikyan after six months of personal job searching and one too many abandoned spreadsheets.

## Acknowledgments

Simple Job Capture was built with substantial assistance from [Claude](https://claude.ai), Anthropic's AI assistant. Claude generated most of the initial code, helped with refactoring and debugging, and contributed to the documentation. All decisions about features, design, and what to ship were made by the maintainer, who reviewed the generated code before it was committed.

## License

MIT — see [LICENSE](LICENSE).
