# Privacy Policy for Simple Job Capture

**Last Updated:** May 2026
**Version:** 1.1
**Effective Date:** May 2026

## Overview

Simple Job Capture is a browser extension designed around a single privacy principle: your data stays on your device. Everything you capture is stored locally in your browser's extension storage. The extension itself does not contact any server, does not transmit any data, and does not require an account.

This policy covers both the Chrome build and the Firefox build of Simple Job Capture. The two builds behave identically from a privacy standpoint.

## What the extension stores

Simple Job Capture stores the following data **locally on your device only**:

**Job posting information you choose to save:**
- Job title
- Company name
- Job posting URL
- Location
- Company address
- Salary information
- Application requirements
- Deadline dates
- Date posted
- Date applied
- Follow-up date
- Result
- Personal notes

**Internal state:**

The extension keeps a small amount of internal state in your browser's local storage so its features work correctly across sessions. None of these values are transmitted anywhere.

- `captureCount` — a number that increments each time you save a job, up to the free tier limit. Used to enforce the 20-capture free tier.
- `unlocked` — a boolean that flips to `true` when you click "I already paid" after purchasing. Used to bypass the paywall for users who have unlocked.
- `todaysDocket` — a list of job indices you've pinned to today's working set in the tracker. Used to remember your docket between sessions.
- `lastExportDate` — the date of your most recent CSV export. Used to display the "it's been a while since you backed up" reminder.
- `reminderDismissed` — a boolean that flips to `true` when you dismiss the backup reminder banner. Used so the banner doesn't reappear immediately after you dismiss it.

The capture count is not a quota check against any server; it's just a number in your own browser that you could reset yourself via DevTools if you wanted to. The same is true for every other key in this list.

**The extension does NOT collect or transmit:**
- Your browsing history
- Personal information (name, email, etc.)
- Your search queries
- Analytics or usage statistics
- Cookies or tracking data
- Any telemetry of any kind

## How data is stored

Data lives in your browser's built-in extension storage (`chrome.storage.local` on Chromium-based browsers, or the equivalent on Firefox). It never leaves your device. The developer does not operate any servers for Simple Job Capture.

No cloud backup or syncing happens automatically. If you want a backup, use the CSV export feature in the tracker — the resulting file is saved to your own computer.

## How the extension behaves when you click "Capture"

1. The extension reads **only the currently active tab**
2. It extracts job details from that specific page
3. It stores the result locally
4. **Nothing is sent anywhere**

## The paywall and Gumroad

Simple Job Capture uses an honor-system paywall: the first 20 captures are free, and a one-time $4.99 unlock (early adopter price) gives unlimited captures.

**How the paywall works technically:**
- When you click "Buy", the extension opens Gumroad in a new browser tab — the same as if you typed the URL yourself. The extension does not communicate with Gumroad.
- You pay on Gumroad's site. Gumroad collects your payment information and sends you a receipt. This transaction is governed by Gumroad's own privacy policy: https://gumroad.com/privacy
- When you return to the extension and click "I already paid", the extension flips the local `unlocked` flag. There is no license key, no server verification, and no tracking.

**Why the honor system:** verifying payments would require the extension to call a server, which would compromise the "no network presence" design. The honor-system approach is a deliberate trade-off: we rely on trust rather than technical enforcement so that the extension can make a stronger privacy promise.

**If you prefer not to use Gumroad at all:** the source code is MIT-licensed and publicly available. You can clone it, remove the paywall checks, and build your own unlimited version. This is explicitly allowed.

## Third-party access

Simple Job Capture does NOT:
- Share data with third parties
- Sell data
- Use data for advertising
- Track behavior
- Send data to analytics services

The extension involves third-party services in only two narrow, user-initiated cases: the Gumroad checkout (described above) and the optional address-lookup feature (described below). Both require an explicit click from you, and both work by opening a new browser tab — the extension itself never communicates with these services.

## Optional address lookup

The tracker has a 🔍 Lookup button next to each empty Company Address field. Clicking this button does the following:

1. A confirmation dialog appears, explaining what will happen
2. If you click OK, the extension opens a new browser tab with a Google search for *"{Company Name} headquarters address"*
3. You read the results, copy the address, and paste it back into the tracker

**What this means for your privacy:**
- The search query sent to Google contains the company name. If you are signed in to your Google account, this query is associated with your Google identity, the same as any other search you perform while signed in.
- The extension itself does not communicate with Google. It uses `window.open()` to launch a new browser tab, the same as if you clicked any other link. Whatever your browser normally sends to google.com (cookies, IP address, user agent) is what gets sent — nothing more, and nothing controlled by the extension.
- Nothing else from the extension — no other captured job data, no list of companies, no usage information — is sent or attached to this search.

**To avoid using this feature:** simply do not click the 🔍 Lookup button. The extension never triggers an address lookup automatically; it only happens on a deliberate click and only after you confirm the dialog. You can fill in company addresses manually instead, or use a search engine of your choice in a separate window.

## Permissions explained

Simple Job Capture requests the minimum permissions necessary. Permission names may differ slightly between browsers, but the behavior is the same.

**`activeTab`** — access to the currently active tab
- **Why:** to read job posting information from the page you're viewing when you click the extension icon
- **What it does:** gives the extension temporary access to the active tab **only when you click the extension icon**
- **What it doesn't do:** does not allow background tracking or access to other tabs

**`storage`** — local extension storage
- **Why:** to save captured jobs on your device
- **What it does:** stores your job data using the browser's local extension storage
- **What it doesn't do:** does not send data to external servers

**`scripting`** (or equivalent page-scripting permission on Firefox) — page content extraction
- **Why:** to extract job details from web pages
- **What it does:** runs extraction code on the current page **only when you click "Capture"**
- **What it doesn't do:** does not run in the background, does not track across pages

The extension does **not** request `<all_urls>` or any broad host permissions.

## Data security

- Data is stored using your browser's extension storage API
- Data is only accessible to Simple Job Capture on your device
- No passwords or sensitive personal information is collected
- If you uninstall the extension, the browser removes all locally stored extension data

## Your rights

You have complete control over your data.

- **Access** — view all your data anytime in the tracker interface
- **Export** — export all data to CSV via the "Export" button
- **Delete** — remove individual jobs, or remove everything by uninstalling the extension
- **Modify** — edit any field inline in the tracker; changes save instantly to local storage

## Data retention

- Data is retained indefinitely on your device until you delete it
- Uninstalling the extension removes locally stored data
- The developer retains no data (it is never received)

## Open source

Simple Job Capture is released under the MIT License. The full source code is public and can be read, audited, forked, or modified by anyone.

This is the strongest privacy guarantee we can offer: rather than asking you to trust a statement about what the extension does, you (or someone you trust) can read the code and verify it directly.

## Children's privacy

Simple Job Capture does not knowingly collect information from children under 13. The extension is designed for job seekers, typically adults seeking employment.

## Changes to this policy

This privacy policy may be updated from time to time. Changes will be reflected in the "Last Updated" date above. Material changes will be noted in the extension's changelog and on the listing page where you installed it.

## International users

Simple Job Capture is available worldwide. Since all data is stored locally on your device, no international data transfer occurs.

## GDPR (EU users)

**Legal basis for processing:** consent. You explicitly choose what data to capture, and you can delete or export it at any time.

**Your GDPR rights:**
- Right to access — view your data in the tracker
- Right to rectification — edit any field inline
- Right to erasure — delete jobs or uninstall the extension
- Right to data portability — export to CSV
- Right to object — don't use the extension
- Right to withdraw consent — uninstall the extension

## CCPA (California users)

**We do not:**
- Sell personal information
- Share personal information with third parties
- Track you across websites
- Create consumer profiles

**Your CCPA rights:**
- Right to know — this policy explains everything the extension handles
- Right to delete — uninstall the extension or delete individual jobs
- Right to opt-out of sale — not applicable (no data is sold)

## Contact

Simple Job Capture is a local-first, open-source tool with no backend servers.

- **Privacy concerns or security reports:** open a GitHub issue on the project's repository
- **General questions:** use the feedback link in the extension or open a GitHub issue

## Data flow summary

1. You visit a job posting → no data collected
2. You click "Capture" → extension reads the current page only
3. You review and save → data stored in local extension storage
4. You view the tracker → extension reads from local storage
5. You export CSV → data formatted and downloaded to your computer
6. You uninstall → browser removes all locally stored extension data

**At no point does data leave your device.**

## Summary

Simple Job Capture doesn't collect your data because it never receives your data. Everything stays on your computer. The code is open source, so you can verify this yourself.

---

By installing and using Simple Job Capture, you acknowledge that you have read and understood this privacy policy.
