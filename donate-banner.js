/**
 * Simple Job Capture - Job Application Tracker
 * Copyright (c) 2026 Tamar Hayrikyan
 * Licensed under the MIT License. See LICENSE for details.
 *
 * Shared logic for the donation reminder banners shown in both the popup
 * and the tracker. Simple Job Capture has no paywall — every feature works
 * regardless of donation status. This is purely an optional, dismissible
 * "support the project" nudge, never a gate on functionality.
 */

// Capture count at which the small persistent banner first appears.
const DONATE_BANNER_MIN_CAPTURES = 3;

// Capture count at which the richer (but still non-blocking) milestone
// banner appears, in addition to the small persistent one.
const DONATE_MILESTONE_CAPTURES = 20;

// How many days a snooze lasts before the banner is eligible to reappear.
const DONATE_SNOOZE_DAYS = 14;

// Gumroad page for an optional donation.
const GUMROAD_URL = 'https://tamarhayri.gumroad.com/l/znqaf';

// Reads totalCaptures, migrating the old captureCount/unlocked keys if
// present (pre-1.2.0 installs). Safe to call repeatedly.
async function getTotalCaptures() {
  const result = await chrome.storage.local.get(['totalCaptures', 'captureCount']);

  if (typeof result.totalCaptures === 'number') {
    return result.totalCaptures;
  }

  // Migrate from the old counter so we don't reset everyone's progress.
  if (typeof result.captureCount === 'number') {
    await chrome.storage.local.set({ totalCaptures: result.captureCount });
    await chrome.storage.local.remove(['captureCount', 'unlocked']);
    return result.captureCount;
  }

  return 0;
}

async function incrementTotalCaptures() {
  const current = await getTotalCaptures();
  const next = current + 1;
  await chrome.storage.local.set({ totalCaptures: next });
  return next;
}

// Returns true if the banner is currently snoozed.
async function isDonateBannerSnoozed() {
  const result = await chrome.storage.local.get(['donateBannerSnoozedUntil']);
  if (!result.donateBannerSnoozedUntil) return false;
  return new Date() < new Date(result.donateBannerSnoozedUntil);
}

async function snoozeDonateBanner(days = DONATE_SNOOZE_DAYS) {
  const until = new Date();
  until.setDate(until.getDate() + days);
  await chrome.storage.local.set({ donateBannerSnoozedUntil: until.toISOString() });
}

// Returns one of: null, 'small', 'milestone'
async function getDonateBannerVariant() {
  const totalCaptures = await getTotalCaptures();
  if (totalCaptures < DONATE_BANNER_MIN_CAPTURES) return null;
  if (await isDonateBannerSnoozed()) return null;
  return totalCaptures >= DONATE_MILESTONE_CAPTURES ? 'milestone' : 'small';
}

function renderDonateBannerHTML(variant) {
  if (variant === 'milestone') {
    return `
      <div class="donate-banner donate-banner-milestone" id="donateBanner">
        <div class="donate-banner-icon">🎉</div>
        <div class="donate-banner-text">
          <strong>You've captured 20 jobs!</strong>
          <p>Simple Job Capture is free, always — no limits, no paywall. If it's been useful, buying the developer a coffee helps keep it maintained and ad-free. Totally optional.</p>
        </div>
        <div class="donate-banner-actions">
          <button id="donateBannerSupportBtn" class="donate-banner-support-btn">☕ Support development</button>
          <button id="donateBannerSnoozeBtn" class="donate-banner-snooze-btn">Maybe later</button>
        </div>
      </div>
    `;
  }

  return `
    <div class="donate-banner donate-banner-small" id="donateBanner">
      <span>💛 <strong>Enjoying Simple Job Capture?</strong> It's free and always will be — <a href="#" id="donateBannerSupportBtn">consider supporting development →</a></span>
      <button id="donateBannerSnoozeBtn" class="donate-banner-close" title="Snooze for 2 weeks" aria-label="Snooze for 2 weeks">✕</button>
    </div>
  `;
}

function attachDonateBannerHandlers(container) {
  const supportBtn = container.querySelector('#donateBannerSupportBtn');
  const snoozeBtn = container.querySelector('#donateBannerSnoozeBtn');

  if (supportBtn) {
    supportBtn.addEventListener('click', (e) => {
      e.preventDefault();
      chrome.tabs.create({ url: GUMROAD_URL });
    });
  }

  if (snoozeBtn) {
    snoozeBtn.addEventListener('click', async () => {
      await snoozeDonateBanner();
      const banner = container.querySelector('#donateBanner');
      if (banner) banner.remove();
    });
  }
}

// Renders the appropriate banner (or nothing) into the given container element.
async function renderDonateBanner(containerEl) {
  const variant = await getDonateBannerVariant();
  if (!variant) {
    containerEl.innerHTML = '';
    return;
  }
  containerEl.innerHTML = renderDonateBannerHTML(variant);
  attachDonateBannerHandlers(containerEl);
}
