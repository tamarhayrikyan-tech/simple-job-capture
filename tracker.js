/**
 * Simple Job Capture - Job Application Tracker
 * Copyright (c) 2026 Tamar Hayrikyan
 * Licensed under the MIT License. See LICENSE for details.
 */

// ========== STATE MANAGEMENT ==========
let allJobs = [];
let filteredJobs = [];
let todaysDocket = new Set(); // Store indices of jobs in today's docket

// Current sort state (only for datePosted and deadline)
let currentSort = { field: null, direction: null };

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', async () => {
    // Load docket from storage
    const docketResult = await chrome.storage.local.get(['todaysDocket']);
    if (docketResult.todaysDocket) {
        todaysDocket = new Set(docketResult.todaysDocket);
    }
    
    await loadJobs();
    setupEventListeners();
    setupDragAndDrop();
    checkBackupReminder();
});

// Check if we should show backup reminder (7+ days since last export)
async function checkBackupReminder() {
    try {
        const result = await chrome.storage.local.get(['lastExportDate', 'reminderDismissed']);
        const lastExport = result.lastExportDate;
        const dismissed = result.reminderDismissed;
        
        // Don't show if dismissed today
        if (dismissed) {
            const dismissedDate = new Date(dismissed);
            const today = new Date();
            if (dismissedDate.toDateString() === today.toDateString()) {
                return;
            }
        }
        
        // Show reminder if never exported or 7+ days since last export
        const shouldShow = !lastExport || 
            (Date.now() - new Date(lastExport).getTime() > 7 * 24 * 60 * 60 * 1000);
        
        if (shouldShow && allJobs.length > 0) {
            document.getElementById('backupReminder').style.display = 'flex';
        }
    } catch (e) {
        console.log('Could not check backup reminder:', e);
    }
}

function setupEventListeners() {
    // Control buttons
    document.getElementById('exportBtn').addEventListener('click', exportData);
    document.getElementById('importBtn').addEventListener('click', importData);
    document.getElementById('clearBtn').addEventListener('click', clearAll);
    document.getElementById('clearDocketBtn').addEventListener('click', clearDocket);
    
    // Backup reminder dismiss
    document.getElementById('dismissReminder').addEventListener('click', async () => {
        document.getElementById('backupReminder').style.display = 'none';
        await chrome.storage.local.set({ reminderDismissed: new Date().toISOString() });
    });
    
    // Section toggles
    document.getElementById('activeHeader').addEventListener('click', () => toggleSection('active'));
    document.getElementById('appliedHeader').addEventListener('click', () => toggleSection('applied'));
    
    // Sort header clicks - use event delegation on both table containers
    document.getElementById('activeJobsTable').addEventListener('click', handleTableClick);
    document.getElementById('appliedJobsTable').addEventListener('click', handleTableClick);
}

function handleTableClick(e) {
    const sortHeader = e.target.closest('th[data-sort]');
    if (sortHeader) {
        const field = sortHeader.dataset.sort;
        handleSort(field);
    }
}

// ========== DRAG AND DROP ==========
function setupDragAndDrop() {
    const docket = document.getElementById('docketItems');
    
    docket.addEventListener('dragover', (e) => {
        e.preventDefault();
        docket.classList.add('drop-target');
    });
    
    docket.addEventListener('dragleave', () => {
        docket.classList.remove('drop-target');
    });
    
    docket.addEventListener('drop', (e) => {
        e.preventDefault();
        docket.classList.remove('drop-target');
        
        const jobIndex = e.dataTransfer.getData('text/plain');
        if (jobIndex !== '') {
            addToDocket(parseInt(jobIndex));
        }
    });
}

// ========== DOCKET FUNCTIONS ==========
async function addToDocket(index) {
    todaysDocket.add(index);
    await saveDocket();
    renderDocket();
    renderTables();
}

async function removeFromDocket(index) {
    todaysDocket.delete(index);
    await saveDocket();
    renderDocket();
    renderTables();
}

async function clearDocket() {
    todaysDocket.clear();
    await saveDocket();
    renderDocket();
    renderTables();
}

async function saveDocket() {
    await chrome.storage.local.set({ todaysDocket: Array.from(todaysDocket) });
}

// Scroll to and highlight a job in the tracker
function scrollToJobInTracker(index) {
    // Find the row with this index
    const row = document.querySelector(`tr[data-index="${index}"]`);
    if (!row) return;
    
    // Scroll to the row
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Highlight the row temporarily
    row.style.backgroundColor = '#fff3cd';
    row.style.transition = 'background-color 0.3s';
    
    setTimeout(() => {
        row.style.backgroundColor = '';
    }, 2000);
}

function renderDocket() {
    const docketItems = document.getElementById('docketItems');
    const docketJobs = allJobs.filter((_, index) => todaysDocket.has(index));
    
    if (docketJobs.length === 0) {
        docketItems.innerHTML = '<div class="docket-empty">No jobs in today\'s docket. Check the ☐ box next to jobs you want to work on today.</div>';
        return;
    }
    
    docketItems.innerHTML = docketJobs.map((job, i) => {
        const originalIndex = allJobs.findIndex(j => j === job);
        return `
            <div class="docket-job" draggable="true" data-index="${originalIndex}">
                <div>
                    <div class="docket-job-title" title="${escapeHtml(job.title)}">${escapeHtml(job.title)}</div>
                    <div class="docket-job-company" title="${escapeHtml(job.company)}">${escapeHtml(job.company)}</div>
                </div>
                <button class="docket-job-remove" data-index="${originalIndex}" title="Remove from docket">✕</button>
            </div>
        `;
    }).join('');
    
    // Add remove button listeners
    docketItems.querySelectorAll('.docket-job-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFromDocket(parseInt(e.target.dataset.index));
        });
    });
    
    // Make docket items clickable to scroll to job in tracker
    docketItems.querySelectorAll('.docket-job').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('docket-job-remove')) return;
            const index = parseInt(item.dataset.index);
            scrollToJobInTracker(index);
        });
    });
}

// ========== SECTION TOGGLE ==========
function toggleSection(section) {
    const toggle = document.getElementById(`${section}Toggle`);
    const content = document.getElementById(`${section}Content`);
    
    toggle.classList.toggle('collapsed');
    content.classList.toggle('collapsed');
}

// ========== SORTING ==========
function applySorting() {
    filteredJobs = [...allJobs];
    
    // Apply sorting if set
    if (currentSort.field) {
        filteredJobs.sort((a, b) => {
            const valA = parseDateForSort(a[currentSort.field]);
            const valB = parseDateForSort(b[currentSort.field]);
            
            // Push empty dates to the bottom regardless of sort direction
            if (valA === 0 && valB === 0) return 0;
            if (valA === 0) return 1;  // A is empty, push it down
            if (valB === 0) return -1; // B is empty, push it down
            
            if (currentSort.direction === 'asc') {
                return valA - valB;
            } else {
                return valB - valA;
            }
        });
    }
    
    renderTables();
}

// Handle sort header click
function handleSort(field) {
    if (currentSort.field === field) {
        // Cycle: asc -> desc -> none
        if (currentSort.direction === 'asc') {
            currentSort.direction = 'desc';
        } else if (currentSort.direction === 'desc') {
            currentSort.field = null;
            currentSort.direction = null;
        }
    } else {
        currentSort.field = field;
        currentSort.direction = 'asc';
    }
    applySorting();
}

// Parse date string to timestamp for sorting
function parseDateForSort(dateStr) {
    if (!dateStr) return 0;
    
    // Try to parse MM/DD/YYYY format
    const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
        return new Date(slashMatch[3], slashMatch[1] - 1, slashMatch[2]).getTime();
    }
    
    // Try generic Date parsing
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? 0 : date.getTime();
}

function checkUrgent(job) {
    if (!job.deadline) return false;
    const deadline = new Date(job.deadline);
    const now = new Date();
    const daysUntil = (deadline - now) / (1000 * 60 * 60 * 24);
    return daysUntil >= 0 && daysUntil <= 7;
}

// ========== MAIN LOAD FUNCTION ==========
async function loadJobs() {
    try {
        const result = await chrome.storage.local.get(['jobs']);
        allJobs = result.jobs || [];
        filteredJobs = [...allJobs];
        
        // Update stats
        updateStats();
        
        // Render docket
        renderDocket();
        
        // Render tables
        renderTables();
        
    } catch (error) {
        console.error('Error loading jobs:', error);
        document.getElementById('activeJobsTable').innerHTML = `
            <div class="empty-state">
                <h3>Error loading jobs</h3>
                <p>Please try refreshing the page.</p>
            </div>
        `;
    }
}

function updateStats() {
    const now = new Date();
    
    document.getElementById('totalJobs').textContent = allJobs.length;
    
    // Only count urgent among active (non-applied) jobs
    const activeJobs = allJobs.filter(j => !j.dateApplied || !j.dateApplied.trim());
    const urgentCount = activeJobs.filter(j => checkUrgent(j)).length;
    document.getElementById('urgent').textContent = urgentCount;
    
    const appliedCount = allJobs.filter(j => j.dateApplied && j.dateApplied.trim()).length;
    document.getElementById('applied').textContent = appliedCount;
}

function renderTables() {
    const now = new Date();
    
    // Separate applied and active jobs
    const activeJobs = filteredJobs.filter(j => !j.dateApplied || !j.dateApplied.trim());
    const appliedJobs = filteredJobs.filter(j => j.dateApplied && j.dateApplied.trim());
    
    // Active jobs: Reverse order so last added is on top (unless sorting is active)
    const activeJobsDisplay = currentSort.field ? activeJobs : [...activeJobs].reverse();
    
    // Applied jobs: ALWAYS sort by dateApplied, latest first (regardless of other sorting)
    const appliedJobsDisplay = [...appliedJobs].sort((a, b) => {
        const dateA = parseDateForSort(a.dateApplied);
        const dateB = parseDateForSort(b.dateApplied);
        
        // Push empty dates to bottom
        if (dateA === 0 && dateB === 0) return 0;
        if (dateA === 0) return 1;
        if (dateB === 0) return -1;
        
        // Sort descending (newest first)
        return dateB - dateA;
    });
    
    // Update section counts
    document.getElementById('activeCount').textContent = activeJobs.length;
    document.getElementById('appliedCount').textContent = appliedJobs.length;
    
    // Render active jobs table
    renderJobTable('activeJobsTable', activeJobsDisplay, false);
    
    // Render applied jobs table
    renderJobTable('appliedJobsTable', appliedJobsDisplay, true);
}

function renderJobTable(containerId, jobs, isAppliedSection) {
    const container = document.getElementById(containerId);
    
    if (jobs.length === 0) {
        if (allJobs.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>👋 Welcome to Simple Job Capture!</h3>
                    <p style="margin: 1rem 0; line-height: 1.8; font-size: 1.05rem;">Here's how to get started:</p>
                    <ol style="text-align: left; max-width: 500px; margin: 0 auto; line-height: 2; font-size: 1rem;">
                        <li>📋 <strong>Navigate to any job posting</strong> on Indeed, LinkedIn, Idealist, etc.</li>
                        <li>🔧 <strong>Click the extension icon</strong> in your browser toolbar</li>
                        <li>✏️ <strong>Review the auto-filled info, edit or complete as necessary, and click Save</strong></li>
                        <li>📊 <strong>Track all your applications here!</strong></li>
                    </ol>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="no-results">
                    ${isAppliedSection ? 'No applied jobs yet.' : 'No active jobs.'}
                </div>
            `;
        }
        return;
    }

    const now = new Date();
    
    // Generate sort indicator for sortable columns (only for Active section)
    const getSortIndicator = (field) => {
        if (currentSort.field !== field) return '<span class="sort-indicator">↕</span>';
        return currentSort.direction === 'asc' 
            ? '<span class="sort-indicator">↑</span>' 
            : '<span class="sort-indicator">↓</span>';
    };
    
    const getSortClass = (field) => {
        if (currentSort.field !== field) return 'sortable';
        return `sortable sort-${currentSort.direction}`;
    };
    
    let tableHTML;
    
    if (isAppliedSection) {
        // APPLIED SECTION: Different columns - no requirements/deadline/datePosted, add followUp/result
        tableHTML = `
            <div class="table-wrapper">
                <table class="applied-table">
                    <thead>
                        <tr>
                            <th title="Add to Today's Docket">📋</th>
                            <th>Position</th>
                            <th>Company</th>
                            <th>Location</th>
                            <th>Address</th>
                            <th>Salary</th>
                            <th>Applied</th>
                            <th>Follow-up</th>
                            <th>Result</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        jobs.forEach((job) => {
            const originalIndex = allJobs.indexOf(job);
            const isInDocket = todaysDocket.has(originalIndex);

            tableHTML += `
                <tr data-index="${originalIndex}" class="applied-row" draggable="true">
                    <td style="text-align: center;">
                        <input type="checkbox" class="docket-checkbox" data-index="${originalIndex}" 
                               ${isInDocket ? 'checked' : ''} title="Add to Today's Docket">
                    </td>
                    <td>
                        ${isSafeJobUrl(job.url) ? `<a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; font-weight: 600; display: block;" title="Open job posting">${escapeHtml(job.title)} 🔗</a>` : `<div class="job-title editable" data-field="title" contenteditable="true">${escapeHtml(job.title)}</div>`}
                        <div class="editable" data-field="url" contenteditable="true" style="font-size: 0.7rem; color: #7a7568; margin-top: 0.1rem; opacity: 0.7;">${job.url ? escapeHtml(job.url) : 'Click to add URL...'}</div>
                        ${job.notes ? `<div class="editable" data-field="notes" contenteditable="true" style="font-size: 0.8rem; color: #7a7568; margin-top: 0.2rem;">${escapeHtml(job.notes)}</div>` : `<div class="editable" data-field="notes" contenteditable="true" style="font-size: 0.8rem; color: #7a7568; margin-top: 0.2rem; font-style: italic; opacity: 0.5;">Add notes...</div>`}
                    </td>
                    <td>
                        <div class="company editable" data-field="company" contenteditable="true">${escapeHtml(job.company)}</div>
                    </td>
                    <td>
                        <div class="editable" data-field="location" contenteditable="true" style="font-size: 0.85rem;">${escapeHtml(job.location || 'Add...')}</div>
                    </td>
                    <td>
                        <div class="editable" data-field="companyAddress" contenteditable="true" style="font-size: 0.8rem;">${escapeHtml(job.companyAddress || 'Add...')}</div>
                        ${!job.companyAddress || !job.companyAddress.trim() ? `<button class="lookup-btn" data-index="${originalIndex}" data-company="${escapeHtml(job.company)}" style="font-size: 0.65rem; margin-top: 0.2rem; padding: 0.15rem 0.3rem; background: #4a90e2; color: white; border: none; border-radius: 3px; cursor: pointer;">🔍 Lookup</button>` : ''}
                    </td>
                    <td>
                        <div class="editable" data-field="salary" contenteditable="true" style="font-size: 0.85rem;">${escapeHtml(job.salary || 'Add...')}</div>
                    </td>
                    <td>
                        <div class="editable" data-field="dateApplied" contenteditable="true" style="font-weight: 600; color: var(--success);">${escapeHtml(job.dateApplied || 'Add...')}</div>
                    </td>
                    <td>
                        <div class="editable" data-field="followUpDate" contenteditable="true">${escapeHtml(job.followUpDate || 'Add...')}</div>
                    </td>
                    <td>
                        <div class="editable" data-field="result" contenteditable="true" style="font-size: 0.85rem;">${escapeHtml(job.result || 'Add...')}</div>
                    </td>
                    <td class="actions">
                        <button class="action-btn btn-delete" data-index="${originalIndex}" title="Delete this job">🗑️</button>
                    </td>
                </tr>
            `;
        });
    } else {
        // ACTIVE SECTION: Original columns with sorting
        tableHTML = `
            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th title="Add to Today's Docket">📋</th>
                            <th>Position</th>
                            <th>Company</th>
                            <th>Location</th>
                            <th>Address</th>
                            <th>Salary</th>
                            <th>Requirements</th>
                            <th class="${getSortClass('deadline')}" data-sort="deadline">Deadline ${getSortIndicator('deadline')}</th>
                            <th class="${getSortClass('datePosted')}" data-sort="datePosted">Posted ${getSortIndicator('datePosted')}</th>
                            <th>Applied</th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        jobs.forEach((job) => {
            const originalIndex = allJobs.indexOf(job);
            const isInDocket = todaysDocket.has(originalIndex);
            const isApplied = job.dateApplied && job.dateApplied.trim();
            
            // Check if deadline is urgent (within 7 days) - just for styling
            let deadlineClass = '';
            if (job.deadline) {
                const deadline = new Date(job.deadline);
                const daysUntil = Math.ceil((deadline - now) / (1000 * 60 * 60 * 24));
                if (daysUntil >= 0 && daysUntil <= 7) {
                    deadlineClass = 'urgent';
                }
            }

            tableHTML += `
                <tr data-index="${originalIndex}" class="${isApplied ? 'applied-row' : ''}" draggable="true">
                    <td style="text-align: center;">
                        <input type="checkbox" class="docket-checkbox" data-index="${originalIndex}" 
                               ${isInDocket ? 'checked' : ''} title="Add to Today's Docket">
                    </td>
                    <td>
                        ${isSafeJobUrl(job.url) ? `<a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" style="color: var(--accent); text-decoration: none; font-weight: 600; display: block;" title="Open job posting">${escapeHtml(job.title)} 🔗</a>` : `<div class="job-title editable" data-field="title" contenteditable="true">${escapeHtml(job.title)}</div>`}
                        ${isApplied ? '<span class="applied-badge">Applied</span>' : ''}
                        <div class="editable" data-field="url" contenteditable="true" style="font-size: 0.7rem; color: #7a7568; margin-top: 0.1rem; opacity: 0.7;">${job.url ? escapeHtml(job.url) : 'Click to add URL...'}</div>
                        ${job.notes ? `<div class="editable" data-field="notes" contenteditable="true" style="font-size: 0.8rem; color: #7a7568; margin-top: 0.2rem;">${escapeHtml(job.notes)}</div>` : `<div class="editable" data-field="notes" contenteditable="true" style="font-size: 0.8rem; color: #7a7568; margin-top: 0.2rem; font-style: italic; opacity: 0.5;">Add notes...</div>`}
                    </td>
                    <td>
                        <div class="company editable" data-field="company" contenteditable="true">${escapeHtml(job.company)}</div>
                    </td>
                    <td>
                        <div class="editable" data-field="location" contenteditable="true" style="font-size: 0.85rem;">${escapeHtml(job.location || 'Add...')}</div>
                    </td>
                    <td>
                        <div class="editable" data-field="companyAddress" contenteditable="true" style="font-size: 0.8rem;">${escapeHtml(job.companyAddress || 'Add...')}</div>
                        ${!job.companyAddress || !job.companyAddress.trim() ? `<button class="lookup-btn" data-index="${originalIndex}" data-company="${escapeHtml(job.company)}" style="font-size: 0.65rem; margin-top: 0.2rem; padding: 0.15rem 0.3rem; background: #4a90e2; color: white; border: none; border-radius: 3px; cursor: pointer;">🔍 Lookup</button>` : ''}
                    </td>
                    <td>
                        <div class="editable" data-field="salary" contenteditable="true" style="font-size: 0.85rem;">${escapeHtml(job.salary || 'Add...')}</div>
                    </td>
                    <td class="requirements">
                        <div class="editable" data-field="requirements" contenteditable="true" style="min-height: 18px; font-size: 0.8rem;">${job.requirements ? escapeHtml(job.requirements) : '<span style="opacity: 0.5; font-style: italic;">Add...</span>'}</div>
                    </td>
                    <td class="deadline ${deadlineClass}">
                        <div class="editable" data-field="deadline" contenteditable="true">${escapeHtml(job.deadline || 'Add...')}</div>
                    </td>
                    <td>
                        <div class="editable" data-field="datePosted" contenteditable="true">${escapeHtml(job.datePosted || 'Add...')}</div>
                    </td>
                    <td>
                        <div class="editable" data-field="dateApplied" contenteditable="true" style="${isApplied ? 'font-weight: 600; color: var(--success);' : ''}">${escapeHtml(job.dateApplied || 'Add...')}</div>
                    </td>
                    <td class="actions">
                        <button class="action-btn btn-delete" data-index="${originalIndex}" title="Delete this job">🗑️</button>
                    </td>
                </tr>
            `;
        });
    }

    tableHTML += `
            </tbody>
        </table>
    </div>
    `;

    container.innerHTML = tableHTML;
    
    // Setup event listeners for this table
    setupTableEventListeners(container);
}

function setupTableEventListeners(container) {
    // Editable fields
    container.querySelectorAll('.editable').forEach(el => {
        // Clear placeholder text on focus
        el.addEventListener('focus', clearPlaceholderOnFocus);
        
        el.addEventListener('blur', saveEdit);
        el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.target.blur();
            }
        });
        
        el.addEventListener('paste', (e) => {
            e.preventDefault();
            const text = (e.clipboardData || window.clipboardData).getData('text/plain');
            document.execCommand('insertText', false, text);
        });
    });
    
    // Delete buttons
    container.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            deleteJob(index);
        });
    });
    
    // Lookup buttons
    container.querySelectorAll('.lookup-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const index = parseInt(e.target.dataset.index);
            const companyName = e.target.dataset.company;
            await lookupAddress(index, companyName, e.target);
        });
    });
    
    // Docket checkboxes
    container.querySelectorAll('.docket-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const index = parseInt(e.target.dataset.index);
            if (e.target.checked) {
                await addToDocket(index);
            } else {
                await removeFromDocket(index);
            }
        });
    });
    
    // Drag and drop for rows
    container.querySelectorAll('tr[draggable="true"]').forEach(row => {
        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', row.dataset.index);
            row.classList.add('dragging');
        });
        
        row.addEventListener('dragend', () => {
            row.classList.remove('dragging');
        });
    });
}

// ========== SAVE EDIT ==========
async function saveEdit(event) {
    const element = event.target;
    const row = element.closest('tr');
    const index = parseInt(row.dataset.index);
    const field = element.dataset.field;
    let newValue = element.textContent.trim();
    
    // Handle placeholder text
    if (newValue === 'Add...' || newValue === 'Add notes...' || newValue === 'Click to add...' || newValue === 'Click to add URL...') {
        newValue = '';
    }
    
    // Auto-format dates with field-specific logic
    if (field === 'deadline' && newValue && !newValue.includes('(')) {
        newValue = parseFlexibleDate(newValue, 'deadline');
        element.textContent = newValue;
    } else if (field === 'datePosted' && newValue) {
        newValue = parseFlexibleDate(newValue, 'datePosted');
        element.textContent = newValue;
    } else if (field === 'dateApplied' && newValue) {
        newValue = parseFlexibleDate(newValue, 'dateApplied');
        element.textContent = newValue;
    } else if (field === 'followUpDate' && newValue) {
        newValue = parseFlexibleDate(newValue, 'deadline'); // Future-biased like deadline
        element.textContent = newValue;
    }
    
    try {
        const result = await chrome.storage.local.get(['jobs']);
        const jobs = result.jobs || [];
        
        if (jobs[index]) {
            jobs[index][field] = newValue;
            await chrome.storage.local.set({ jobs });
            
            // Update local state
            allJobs = jobs;
            
            // If dateApplied changed, re-render to move between sections
            if (field === 'dateApplied') {
                // If job was just marked as applied (has a value now), remove from docket
                if (newValue && newValue.trim()) {
                    await removeFromDocket(index);
                }
                applySorting();
                updateStats();
            }
            
            // Show brief success indication
            element.style.backgroundColor = '#e8f8e8';
            setTimeout(() => {
                element.style.backgroundColor = '';
            }, 500);
        }
    } catch (error) {
        console.error('Error saving edit:', error);
        alert('Error saving changes. Please try again.');
    }
}

// ========== HELPER FUNCTIONS ==========

// List of placeholder texts to clear on focus
const PLACEHOLDER_TEXTS = [
    'Add...',
    'Add notes...',
    'Click to add...',
    'Click to add URL...',
    'Click to add notes...'
];

function clearPlaceholderOnFocus(event) {
    const el = event.target;
    const text = el.textContent.trim();
    const field = el.dataset.field;

    // Check if current text is a placeholder
    const isPlaceholder = PLACEHOLDER_TEXTS.includes(text) || el.querySelector('span[style*="opacity"]');

    // Auto-fill today's date for dateApplied if empty/placeholder
    if (field === 'dateApplied' && isPlaceholder) {
        const today = new Date();
        const formatted = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
        el.textContent = formatted;
        // Select all so user can easily replace if needed
        setTimeout(() => {
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(el);
            selection.removeAllRanges();
            selection.addRange(range);
        }, 0);
        return;
    }

    // For other fields, just clear placeholder
    if (isPlaceholder) {
        el.textContent = '';
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Returns true only if `url` is a string starting with http:// or https://.
// Used to gate href rendering — prevents javascript:, data:, file:, mailto:,
// etc. from being interpreted as a clickable URL when a job is loaded from
// CSV import or any other untrusted source.
function isSafeJobUrl(url) {
    if (!url || typeof url !== 'string') return false;
    return /^https?:\/\//i.test(url.trim());
}

// CSV formula-injection guard. If a cell's text starts with =, +, -, @, or
// a tab/CR character, Excel and Google Sheets treat it as a formula when the
// CSV is opened. Prepending a single quote is the OWASP-recommended fix:
// it makes the cell render as literal text and disables formula evaluation.
function sanitizeCsvCell(value) {
    const s = String(value ?? '');
    if (s.length === 0) return s;
    const first = s.charAt(0);
    if (first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r') {
        return "'" + s;
    }
    return s;
}

async function lookupAddress(index, companyName, button) {
    if (!companyName || !companyName.trim()) {
        alert('Company name is required to lookup address');
        return;
    }
    
    button.disabled = true;
    button.textContent = '⌛ Looking up...';
    
    try {
        const searchQuery = encodeURIComponent(`${companyName} headquarters address`);
        const searchUrl = `https://www.google.com/search?q=${searchQuery}`;
        
        const userResponse = confirm(
            `To find ${companyName}'s address:\n\n` +
            `1. Click OK to open a Google search\n` +
            `2. Copy the address from the search results\n` +
            `3. Come back here and paste it into the Company Address field\n\n` +
            `Click OK to open search, or Cancel to lookup manually.`
        );
        
        if (userResponse) {
            window.open(searchUrl, '_blank');
            
            const row = button.closest('tr');
            const addressField = row.querySelector('[data-field="companyAddress"]');
            if (addressField) {
                setTimeout(() => {
                    addressField.focus();
                    const selection = window.getSelection();
                    const range = document.createRange();
                    range.selectNodeContents(addressField);
                    selection.removeAllRanges();
                    selection.addRange(range);
                }, 500);
            }
        }
        
        button.disabled = false;
        button.textContent = '🔍 Lookup';
        
    } catch (error) {
        console.error('Error during address lookup:', error);
        alert('Error opening search. Please lookup manually.');
        button.disabled = false;
        button.textContent = '🔍 Lookup';
    }
}

async function deleteJob(index) {
    if (!confirm('Delete this job posting?')) return;
    
    try {
        const result = await chrome.storage.local.get(['jobs']);
        const jobs = result.jobs || [];
        jobs.splice(index, 1);
        await chrome.storage.local.set({ jobs });
        
        // Remove from docket if present
        todaysDocket.delete(index);
        // Adjust docket indices for jobs after the deleted one
        const newDocket = new Set();
        todaysDocket.forEach(i => {
            if (i > index) {
                newDocket.add(i - 1);
            } else {
                newDocket.add(i);
            }
        });
        todaysDocket = newDocket;
        await saveDocket();
        
        await loadJobs();
    } catch (error) {
        console.error('Error deleting job:', error);
        alert('Error deleting job. Please try again.');
    }
}

async function exportData() {
    try {
        const result = await chrome.storage.local.get(['jobs']);
        const jobs = result.jobs || [];
        
        if (jobs.length === 0) {
            alert('No jobs to export!');
            return;
        }

        const csv = [
            ['Position', 'Company/Org', 'Location', 'Company Address', 'Salary', 'Requirements', 'Deadline', 'Date Posted', 'Date Applied', 'Follow-up Date', 'Result', 'URL', 'Notes'],
            ...jobs.map(j => [
                j.title || '',
                j.company || '',
                j.location || '',
                j.companyAddress || '',
                j.salary || '',
                j.requirements || '',
                j.deadline || '',
                j.datePosted || '',
                j.dateApplied || '',
                j.followUpDate || '',
                j.result || '',
                j.url || '',
                j.notes || ''
            ])
        ].map(row => row.map(cell => `"${sanitizeCsvCell(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `job-tracker-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        
        // Save export date and hide reminder
        await chrome.storage.local.set({ lastExportDate: new Date().toISOString() });
        document.getElementById('backupReminder').style.display = 'none';
        
    } catch (error) {
        console.error('Error exporting data:', error);
        alert('Error exporting data. Please try again.');
    }
}

function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const csv = event.target.result;
                const lines = csv.split('\n').slice(1);
                const result = await chrome.storage.local.get(['jobs']);
                const jobs = result.jobs || [];
                
                lines.forEach(line => {
                    if (!line.trim()) return;
                    
                    const cells = [];
                    let current = '';
                    let inQuotes = false;
                    
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        const nextChar = line[i + 1];
                        
                        if (char === '"' && inQuotes && nextChar === '"') {
                            current += '"';
                            i++;
                        } else if (char === '"') {
                            inQuotes = !inQuotes;
                        } else if (char === ',' && !inQuotes) {
                            cells.push(current);
                            current = '';
                        } else {
                            current += char;
                        }
                    }
                    cells.push(current);
                    
                    jobs.push({
                        title: cells[0] || '',
                        company: cells[1] || '',
                        location: cells[2] || '',
                        companyAddress: cells[3] || '',
                        salary: cells[4] || '',
                        requirements: cells[5] || '',
                        deadline: cells[6] || '',
                        datePosted: cells[7] || '',
                        dateApplied: cells[8] || '',
                        followUpDate: cells[9] || '',
                        result: cells[10] || '',
                        url: cells[11] || '',
                        notes: cells[12] || ''
                    });
                });
                
                await chrome.storage.local.set({ jobs });
                await loadJobs();
                alert('Jobs imported successfully!');
            } catch (error) {
                console.error('Error importing:', error);
                alert('Error importing CSV. Please check the format.');
            }
        };
        reader.readAsText(file);
    };
    input.click();
}

async function clearAll() {
    if (!confirm('Delete all jobs? This cannot be undone.')) return;
    
    try {
        await chrome.storage.local.set({ jobs: [], todaysDocket: [] });
        todaysDocket.clear();
        await loadJobs();
    } catch (error) {
        console.error('Error clearing jobs:', error);
        alert('Error clearing jobs. Please try again.');
    }
}
