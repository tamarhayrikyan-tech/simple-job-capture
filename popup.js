/**
 * Simple Job Capture - Job Application Tracker
 * Copyright (c) 2026 Tamar Hayrikyan
 * Licensed under the MIT License. See LICENSE for details.
 */

// ====================================================================
// Configuration
// ====================================================================

const FREE_CAPTURE_LIMIT = 20;

// Gumroad product URL for the $4.99 unlimited-captures unlock.
const GUMROAD_URL = 'https://tamarhayri.gumroad.com/l/znqaf';

// ====================================================================
// Paywall helpers (honor system — no payment verification)
// ====================================================================

async function getPaywallState() {
  const result = await chrome.storage.local.get(['captureCount', 'unlocked']);
  return {
    captureCount: result.captureCount || 0,
    unlocked: result.unlocked === true
  };
}

async function markAsUnlocked() {
  await chrome.storage.local.set({
    unlocked: true
  });
}

async function incrementCaptureCount() {
  const result = await chrome.storage.local.get(['captureCount']);
  const count = (result.captureCount || 0) + 1;
  await chrome.storage.local.set({ captureCount: count });
  return count;
}

// ====================================================================
// Initialization
// ====================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const loading = document.getElementById('loading');
  const form = document.getElementById('form');

  try {
    const { captureCount, unlocked } = await getPaywallState();

    // Show paywall immediately if at/over the free limit and not unlocked
    if (!unlocked && captureCount >= FREE_CAPTURE_LIMIT) {
      loading.style.display = 'none';
      document.getElementById('paywall').style.display = 'block';
      return;
    }

    // Show remaining captures for free users (not shown for unlocked users)
    if (!unlocked) {
      const remaining = FREE_CAPTURE_LIMIT - captureCount;
      const remainingDiv = document.getElementById('capturesRemaining');

      if (remaining <= 5 && remaining > 0) {
        remainingDiv.innerHTML = `
          <div style="background: #fff3cd; border: 1px solid #ffb300; padding: 0.75rem; border-radius: 4px; margin-top: 0.75rem;">
            <strong>⚠️ ${remaining} free capture${remaining !== 1 ? 's' : ''} remaining</strong><br>
            <span style="font-size: 0.85rem;">Unlock unlimited for $4.99 (early adopter price) before hitting the limit!</span>
          </div>
        `;
      } else {
        remainingDiv.textContent = `${remaining} free capture${remaining !== 1 ? 's' : ''} remaining`;
      }
    }

    // Get the current active tab and extract job info
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      chrome.tabs.sendMessage(tab.id, { action: 'extractJobInfo' }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Could not auto-extract:', chrome.runtime.lastError.message);
          showStatus('<b>Review and edit</b>, then click Save', 'info', true);
        } else if (response) {
          populateForm(response);
          showStatus('<b>Review and edit</b>, then click Save', 'success', true);
        }

        loading.style.display = 'none';
        form.style.display = 'block';
      });
    } catch (injectError) {
      console.log('Content script injection failed:', injectError.message);
      loading.style.display = 'none';
      form.style.display = 'block';
      showStatus('Cannot extract from this page. Please fill in manually.', 'info', true);
    }
  } catch (error) {
    console.error('Error:', error);
    loading.style.display = 'none';
    form.style.display = 'block';
    showStatus('Error loading page info. Please fill in manually.', 'error');
  }
});

// ====================================================================
// Form helpers
// ====================================================================

function populateForm(jobInfo) {
  const fields = {
    'title': jobInfo.title,
    'company': jobInfo.company,
    'location': jobInfo.location,
    'companyAddress': jobInfo.companyAddress,
    'url': jobInfo.url,
    'requirements': jobInfo.requirements,
    'salary': jobInfo.salary,
    'deadline': jobInfo.deadline,
    'datePosted': jobInfo.datePosted
  };

  for (const [fieldId, value] of Object.entries(fields)) {
    const field = document.getElementById(fieldId);
    if (field && value) {
      field.value = value;
      field.classList.add('auto-filled');
      setTimeout(() => field.classList.remove('auto-filled'), 2000);
    }
  }
}

function showStatus(message, type = 'info', persistent = false) {
  const status = document.getElementById('status');
  status.innerHTML = message;
  status.className = `status ${type}`;
  status.style.display = 'block';

  if (type === 'success' && !persistent) {
    setTimeout(() => {
      status.style.display = 'none';
    }, 3000);
  }
}

function showSavedConfirmation() {
  const form = document.getElementById('form');
  form.innerHTML = `
    <div class="status success" style="display: block; margin-bottom: 1rem; text-align: center; font-size: 1.1rem; padding: 1rem;">
      ✓ Job Saved Successfully!
    </div>
    <p style="text-align: center; margin-bottom: 1.5rem; color: #666; font-size: 1rem;">
      Your job has been added to the tracker.
    </p>
    <button class="btn-view" id="viewTrackerBtn" style="width: 100%; padding: 1.25rem; font-size: 1.2rem; font-weight: 700; background: #c84c09; color: white; border: none; cursor: pointer;">
      📊 View Your Tracker →
    </button>
    <p style="text-align: center; margin-top: 1rem; font-size: 0.85rem; color: #7a7568;">
      Or close this popup and continue browsing jobs
    </p>
  `;

  document.getElementById('viewTrackerBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: 'tracker.html' });
  });
}

// ====================================================================
// Event handlers
// ====================================================================

// Save button
document.getElementById('saveBtn').addEventListener('click', async () => {
  const { captureCount, unlocked } = await getPaywallState();

  if (!unlocked && captureCount >= FREE_CAPTURE_LIMIT) {
    document.getElementById('form').style.display = 'none';
    document.getElementById('paywall').style.display = 'block';
    return;
  }

  const job = {
    title: document.getElementById('title').value.trim(),
    company: document.getElementById('company').value.trim(),
    location: document.getElementById('location').value.trim(),
    companyAddress: document.getElementById('companyAddress').value.trim(),
    url: document.getElementById('url').value.trim(),
    requirements: document.getElementById('requirements').value.trim(),
    salary: document.getElementById('salary').value.trim(),
    deadline: document.getElementById('deadline').value.trim(),
    datePosted: document.getElementById('datePosted').value.trim(),
    notes: document.getElementById('notes').value.trim(),
    dateApplied: '',
    followUpDate: '',
    result: ''
  };

  if (!job.title || !job.company || !job.url) {
    showStatus('Please fill in Title, Company, and URL', 'error');
    return;
  }

  try {
    const result = await chrome.storage.local.get(['jobs']);
    const jobs = result.jobs || [];
    jobs.push(job);
    await chrome.storage.local.set({ jobs });

    // Only increment the capture count for non-unlocked users
    if (!unlocked) {
      await incrementCaptureCount();
    }

    showSavedConfirmation();
  } catch (error) {
    console.error('Error saving job:', error);
    showStatus('Error saving job. Please try again.', 'error');
  }
});

// View tracker button
document.getElementById('viewBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: 'tracker.html' });
});

// Purchase button — opens Gumroad in a new tab
document.getElementById('purchaseBtn').addEventListener('click', () => {
  chrome.tabs.create({ url: GUMROAD_URL });
});

// "I already paid" button — shows the honor-system confirmation step
document.getElementById('alreadyPaidBtn').addEventListener('click', () => {
  document.getElementById('confirmPaid').style.display = 'block';
});

// Confirm paid — flips the unlocked flag and shows success
document.getElementById('confirmPaidBtn').addEventListener('click', async () => {
  await markAsUnlocked();
  document.getElementById('paywall').innerHTML = `
    <div style="text-align: center; padding: 2rem;">
      <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
      <h3 style="color: #5a6e3c; margin-bottom: 1rem;">Unlocked!</h3>
      <p style="color: #555; margin-bottom: 1.5rem;">
        Thanks for supporting Simple Job Capture. You now have unlimited captures.
      </p>
      <button id="continueBtn" class="btn-save" style="padding: 0.75rem 2rem;">
        Continue capturing jobs
      </button>
    </div>
  `;
  document.getElementById('continueBtn').addEventListener('click', () => {
    // Reload the popup to return to the capture form
    window.location.reload();
  });
});

// Cancel paid confirmation
document.getElementById('cancelPaidBtn').addEventListener('click', () => {
  document.getElementById('confirmPaid').style.display = 'none';
});

// Paywall "View tracker" button
document.getElementById('viewTrackerBtn2').addEventListener('click', () => {
  chrome.tabs.create({ url: 'tracker.html' });
});

// Date field auto-formatting
document.getElementById('deadline').addEventListener('blur', function() {
  if (this.value.trim()) {
    this.value = parseFlexibleDate(this.value, 'deadline');
  }
});

document.getElementById('datePosted').addEventListener('blur', function() {
  if (this.value.trim()) {
    this.value = parseFlexibleDate(this.value, 'datePosted');
  }
});
