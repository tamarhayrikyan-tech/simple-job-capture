/**
 * Simple Job Capture - Job Application Tracker
 * Copyright (c) 2026 Tamar Hayrikyan
 * Licensed under the MIT License. See LICENSE for details.
 */

// This script is injected on-demand into the active tab when the user clicks
// the extension icon and triggers a capture. It does NOT run automatically or
// in the background — the manifest declares no content_scripts, so this file
// only executes when popup.js calls chrome.scripting.executeScript on it.
// Once injected, it listens for an extractJobInfo message from the popup,
// extracts data from the current page, and sends the result back.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractJobInfo') {
    const jobInfo = extractJobInformation();
    sendResponse(jobInfo);
  }
  return true; // Keep the message channel open for async response
});

// IDEALIST.ORG SPECIFIC EXTRACTION
function extractIdealistJob() {
  const url = window.location.href;
  
  // Title - usually in h1
  let title = '';
  const h1 = document.querySelector('h1');
  if (h1) title = h1.textContent.trim();
  
  // Company - look for company/org link
  // Idealist uses different URL patterns: /nonprofit/, /organization/, /consultant/, etc.
  let company = '';
  const companyLink = document.querySelector(
    'a[href*="/nonprofit/"], a[href*="/organization/"], a[href*="/consultant/"], ' +
    'a[href*="/government/"], a[href*="/social-enterprise/"], a[href*="/consulting-firm/"], ' +
    'a[href*="/ngo/"], a[href*="/company/"], a[href*="/agency/"]'
  );
  if (companyLink) {
    company = companyLink.textContent.trim();
  }
  
  // Fallback 1: Look for any idealist.org internal org link (catches unknown org types)
  if (!company) {
    const allLinks = document.querySelectorAll('a[href*="idealist.org"]');
    for (const link of allLinks) {
      const href = link.getAttribute('href') || '';
      // Match org pages: /en/SOMETHING/UUID-slug pattern, but NOT job pages
      if (href.match(/\/en\/(?!.*-job\/)(?!.*jobs\/)(?!.*search)[a-z-]+\/[a-f0-9]/) && 
          !href.includes('-job/')) {
        const text = link.textContent.trim();
        if (text.length > 1 && text.length < 100 &&
            !text.match(/^(Apply|Save|Share|Remote|Hybrid|On-site|Full Time|Part Time|View|Find)/i)) {
          company = text;
          break;
        }
      }
    }
  }
  
  // Fallback 2: Look for the company name link near the h1 title
  // On Idealist, the company name appears as a styled link right below the job title
  if (!company) {
    const h1 = document.querySelector('h1');
    if (h1) {
      // Walk up to find the parent container, then look for links within it
      const container = h1.closest('div, section, article') || h1.parentElement;
      if (container) {
        const links = container.querySelectorAll('a');
        for (const link of links) {
          const text = link.textContent.trim();
          const href = link.getAttribute('href') || '';
          // Skip the job title link itself and navigation links
          if (text !== h1.textContent.trim() && 
              text.length > 1 && text.length < 100 &&
              !href.includes('-job/') &&
              !text.match(/^(Apply|Save|Share|Remote|Hybrid|On-site|Full Time|Part Time|Back|View)/i)) {
            company = text;
            break;
          }
        }
      }
      
      // Also check next sibling elements
      if (!company) {
        let sibling = h1.nextElementSibling;
        for (let i = 0; i < 5 && sibling; i++) {
          const link = sibling.tagName === 'A' ? sibling : sibling.querySelector('a');
          if (link) {
            const text = link.textContent.trim();
            if (text.length > 1 && text.length < 100 &&
                !text.match(/^(Apply|Save|Share|Remote|Hybrid|On-site|Full Time|Part Time)/i)) {
              company = text;
              break;
            }
          }
          sibling = sibling.nextElementSibling;
        }
      }
    }
  }
  
  // Location - Idealist uses specific structure
  let location = '';
  let locationType = ''; // Hybrid, Remote, On-site
  let cityLocation = '';
  
  // Find location type in visible text (badges and descriptions)
  const pageText = document.body.textContent;
  
  // Check for Remote with various patterns
  if (pageText.match(/\bRemote\b/i) || 
      pageText.match(/work can be performed from anywhere/i) ||
      pageText.match(/work from anywhere/i)) {
    locationType = 'Remote';
  } else if (pageText.match(/\bHybrid\b/i)) {
    locationType = 'Hybrid';
  } else if (pageText.match(/\bOn-site\b/i)) {
    locationType = 'On-site';
  }
  
  // For Remote jobs, don't look for city - just use "Remote"
  // For Hybrid/On-site, find the specific city location
  if (locationType !== 'Remote') {
    // Find city location - look for "New York, NY" pattern near "Work must be performed"
    const locationMatch = pageText.match(/(?:Work must be performed in or near|Work can be performed.*in|Location:)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})/);
    if (locationMatch) {
      cityLocation = locationMatch[1];
    }
  }
  
  // Combine
  if (locationType && cityLocation) {
    location = `${locationType} - ${cityLocation}`;
  } else if (cityLocation) {
    location = cityLocation;
  } else if (locationType) {
    location = locationType;
  }
  
  // Salary - Idealist format in Details: "Salary:" or "Compensation:" followed by salary
  // Supports USD ($), EUR (€), GBP (£), CAD
  let salary = '';
  
  // USD range format: "USD $X - $Y / period"
  let salaryMatch = pageText.match(/(?:Salary|Compensation):\s*USD\s*\$\s*(\d{1,3}(?:,\d{3})*)\s*-\s*\$\s*(\d{1,3}(?:,\d{3})*)\s*\/\s*(year|month|hour)/i);
  if (salaryMatch) {
    const min = salaryMatch[1].replace(/,/g, '');
    const max = salaryMatch[2].replace(/,/g, '');
    const period = salaryMatch[3].toLowerCase();
    const periodSuffix = period === 'year' ? '/yr' : period === 'month' ? '/mo' : '/hr';
    salary = `$${parseInt(min).toLocaleString()} - $${parseInt(max).toLocaleString()}${periodSuffix}`;
  }
  
  // USD single value: "At least USD $X / period"
  if (!salary) {
    const singleMatch = pageText.match(/(?:Salary|Compensation):\s*(?:At least\s+)?USD\s*\$\s*(\d{1,3}(?:,\d{3})*)\s*\/\s*(year|month|hour)/i);
    if (singleMatch) {
      const amount = singleMatch[1].replace(/,/g, '');
      const period = singleMatch[2].toLowerCase();
      const periodSuffix = period === 'year' ? '/yr' : period === 'month' ? '/mo' : '/hr';
      salary = `$${parseInt(amount).toLocaleString()}${periodSuffix}`;
    }
  }
  
  // EUR range format: "EUR €X - €Y / period" or "EUR X - Y"
  if (!salary) {
    const euroMatch = pageText.match(/(?:Salary|Compensation):\s*(?:EUR\s*)?€?\s*(\d{1,3}(?:[.,]\d{3})*)\s*[-–]\s*€?\s*(\d{1,3}(?:[.,]\d{3})*)\s*(?:\/\s*)?(year|month|hour|per\s+annum|p\.?a\.?)?/i);
    if (euroMatch && (pageText.match(/EUR|€/i))) {
      const normalizeNum = (s) => s.replace(/[.,]/g, (m, i, str) => {
        // Last separator with 2 digits after = decimal, otherwise thousands
        const afterMatch = str.slice(str.indexOf(m) + 1);
        return afterMatch.match(/^\d{2}$/) ? '.' : '';
      }).replace(/[.,]/g, '');
      const min = normalizeNum(euroMatch[1]);
      const max = normalizeNum(euroMatch[2]);
      const period = euroMatch[3] ? euroMatch[3].toLowerCase() : 'year';
      const periodSuffix = period.includes('month') ? '/mo' : period.includes('hour') ? '/hr' : '/yr';
      salary = `€${parseInt(min).toLocaleString()} - €${parseInt(max).toLocaleString()}${periodSuffix}`;
    }
  }
  
  // GBP range format: "GBP £X - £Y / period"
  if (!salary) {
    const gbpMatch = pageText.match(/(?:Salary|Compensation):\s*(?:GBP\s*)?£\s*(\d{1,3}(?:,\d{3})*)\s*[-–]\s*£?\s*(\d{1,3}(?:,\d{3})*)\s*(?:\/\s*)?(year|month|hour|per\s+annum|p\.?a\.?)?/i);
    if (gbpMatch) {
      const min = gbpMatch[1].replace(/,/g, '');
      const max = gbpMatch[2].replace(/,/g, '');
      const period = gbpMatch[3] ? gbpMatch[3].toLowerCase() : 'year';
      const periodSuffix = period.includes('month') ? '/mo' : period.includes('hour') ? '/hr' : '/yr';
      salary = `£${parseInt(min).toLocaleString()} - £${parseInt(max).toLocaleString()}${periodSuffix}`;
    }
  }
  
  // CAD range format: "CAD $X - $Y / period" or "C$X - C$Y"
  if (!salary) {
    const cadMatch = pageText.match(/(?:Salary|Compensation):\s*(?:CAD|C\$)\s*\$?\s*(\d{1,3}(?:,\d{3})*)\s*[-–]\s*(?:CAD|C\$)?\s*\$?\s*(\d{1,3}(?:,\d{3})*)\s*(?:\/\s*)?(year|month|hour)?/i);
    if (cadMatch) {
      const min = cadMatch[1].replace(/,/g, '');
      const max = cadMatch[2].replace(/,/g, '');
      const period = cadMatch[3] ? cadMatch[3].toLowerCase() : 'year';
      const periodSuffix = period.includes('month') ? '/mo' : period.includes('hour') ? '/hr' : '/yr';
      salary = `C$${parseInt(min).toLocaleString()} - C$${parseInt(max).toLocaleString()}${periodSuffix}`;
    }
  }
  
  // Requirements - left blank for manual entry (auto-extraction unreliable)
  let requirements = '';
  
  // Deadline - Idealist shows "Application Deadline: January 31, 2026" in Details section
  let deadline = '';
  const deadlineMatch = pageText.match(/Application Deadline:\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i);
  if (deadlineMatch) {
    const deadlineDate = new Date(deadlineMatch[1]);
    if (!isNaN(deadlineDate.getTime())) {
      deadline = `${String(deadlineDate.getMonth() + 1).padStart(2, '0')}/${String(deadlineDate.getDate()).padStart(2, '0')}/${deadlineDate.getFullYear()}`;
    }
  }
  
  // Date posted - Idealist shows "Published X days ago" in the main job details
  // We need to be careful not to match "Posted X days ago" from Related Jobs on the left
  let datePosted = '';
  
  // First, try to find the main content area
  const mainContent = document.querySelector('main, article, [role="main"]') || document.body;
  const mainText = mainContent.textContent;
  
  // Look specifically for "Published" (main job) not "Posted" (which appears in Related Jobs)
  const postedMatch = mainText.match(/Published\s+(\d+)\s+(hour|day|week|month)s?\s+ago/i);
  if (postedMatch) {
    const amount = parseInt(postedMatch[1]);
    const unit = postedMatch[2].toLowerCase();
    const now = new Date();
    
    if (unit === 'hour') now.setHours(now.getHours() - amount);
    else if (unit === 'day') now.setDate(now.getDate() - amount);
    else if (unit === 'week') now.setDate(now.getDate() - (amount * 7));
    else if (unit === 'month') now.setMonth(now.getMonth() - amount);
    
    datePosted = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  }
  
  // Company Address - Look for "Associated Location" section which often has full address
  let companyAddress = '';
  
  // First, look specifically for the address after "ASSOCIATED LOCATION" text
  const associatedLocationMatch = pageText.match(/ASSOCIATED LOCATION[^\n]*\n\s*(\d{3,5}\s+[A-Za-z][^\n]{10,100})/i);
  if (associatedLocationMatch && associatedLocationMatch[1]) {
    let addr = associatedLocationMatch[1].trim();
    
    // Check if there's a Suite/Floor line following
    const suiteMatch = pageText.match(new RegExp(addr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\n?\\s*((?:Suite|Ste|Floor|Fl|Unit|#)[^\\n]+)', 'i'));
    if (suiteMatch && suiteMatch[1]) {
      addr += ' ' + suiteMatch[1].trim();
    }
    
    // Validate: must not contain HTML/JSON markers
    if (!addr.match(/[<>{}\[\]"]/)) {
      companyAddress = addr.replace(/\s+/g, ' ').trim();
    }
  }
  
  // Fallback: look for any standard address format in the page
  if (!companyAddress) {
    const addressMatch = pageText.match(/(\d{3,5}\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*[^,\n]{5,50},\s*[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s*[A-Z]{2}\s+\d{5})/);
    if (addressMatch && addressMatch[1]) {
      const addr = addressMatch[1].trim();
      // Validate: reasonable length and no HTML/JSON
      if (addr.length > 15 && addr.length < 150 && !addr.match(/[<>{}\[\]"]/)) {
        companyAddress = addr;
      }
    }
  }
  
  return {
    title,
    company,
    location,
    companyAddress,
    url,
    requirements,
    salary,
    deadline,
    datePosted,
    notes: ''
  };
}

// INDEED SPECIFIC EXTRACTION
// Handles both Direct View (/viewjob) and Feed View (search results with right panel)
function extractIndeedJob() {
  const url = window.location.href;
  
  // Detect view mode
  const isDirectView = url.includes('/viewjob');
  const isFeedView = !isDirectView;
  
  // For feed view, we need to isolate the right panel (selected job details)
  // The right panel contains the actual job details we want
  let container = document.body;
  
  if (isFeedView) {
    // Find the job details panel - Indeed uses data-testid attributes
    const jobDetailsPanel = document.querySelector('[data-testid="jobsearch-ViewjobPaneWrapper"]') ||
                           document.querySelector('[data-testid="job-details"]') ||
                           document.querySelector('.jobsearch-ViewJobLayout--embedded') ||
                           document.querySelector('[class*="ViewJob"]');
    if (jobDetailsPanel) {
      container = jobDetailsPanel;
    }
  }
  
  // Get text only from the container (not the left panel job list)
  const containerText = container.textContent || '';
  
  // === TITLE ===
  let title = '';
  // Try the job title header in the details panel
  const titleEl = container.querySelector('h1, h2.jobsearch-JobInfoHeader-title, [data-testid="jobsearch-JobInfoHeader-title"]');
  if (titleEl) {
    title = titleEl.textContent.trim();
  }
  
  // Fallback: look for the job title pattern
  if (!title) {
    const h2Elements = container.querySelectorAll('h2');
    for (const h2 of h2Elements) {
      const text = h2.textContent.trim();
      if (text.length > 5 && text.length < 150 && !text.match(/^(Profile|Jobs|About|Company|Apply)/i)) {
        title = text;
        break;
      }
    }
  }
  
  // === COMPANY ===
  let company = '';
  // Look for company link or element
  const companyEl = container.querySelector('[data-testid="inlineHeader-companyName"] a, [data-testid="inlineHeader-companyName"], [data-company-name], .jobsearch-InlineCompanyRating-companyHeader a');
  if (companyEl) {
    company = companyEl.textContent.trim();
    // Remove rating if present (e.g., "Ion Solar 3.2")
    company = company.replace(/\s+\d+\.?\d*\s*$/, '').trim();
  }
  
  // Fallback: look for company link pattern
  if (!company) {
    const companyLinks = container.querySelectorAll('a[href*="/cmp/"]');
    for (const link of companyLinks) {
      const text = link.textContent.trim();
      if (text.length > 1 && text.length < 100) {
        company = text.replace(/\s+\d+\.?\d*\s*$/, '').trim();
        break;
      }
    }
  }
  
  // === LOCATION ===
  let location = '';
  let workType = '';
  
  // Look for location element - Indeed has data-testid for this
  const locationEl = container.querySelector('[data-testid="inlineHeader-companyLocation"], [data-testid="job-location"], .jobsearch-JobInfoHeader-subtitle > div');
  if (locationEl) {
    location = locationEl.textContent.trim();
  }
  
  // Check for work type (Remote/Hybrid) - but ONLY in the container
  // Be careful not to pick up from other jobs in the feed
  const workTypeEl = container.querySelector('[data-testid="jobsearch-JobInfoHeader-subtitle"]');
  if (workTypeEl) {
    const workTypeText = workTypeEl.textContent;
    if (workTypeText.match(/\bRemote\b/i)) {
      workType = 'Remote';
    } else if (workTypeText.match(/\bHybrid\b/i)) {
      workType = 'Hybrid';
    }
  }
  
  // Combine location and work type if both present
  if (workType && location && !location.toLowerCase().includes(workType.toLowerCase())) {
    location = `${workType} - ${location}`;
  } else if (workType && !location) {
    location = workType;
  }
  
  // === SALARY ===
  let salary = '';
  // Look for salary in the job details
  const salaryMatch = containerText.match(/\$[\d,]+(?:\.\d{2})?\s*[-–]\s*\$[\d,]+(?:\.\d{2})?\s*(?:a |per |an |\/)(year|hour|month)/i);
  if (salaryMatch) {
    const fullMatch = salaryMatch[0];
    const period = salaryMatch[1].toLowerCase();
    // Extract min and max
    const numbers = fullMatch.match(/\$([\d,]+(?:\.\d{2})?)/g);
    if (numbers && numbers.length >= 2) {
      const min = numbers[0].replace(/[$,]/g, '');
      const max = numbers[1].replace(/[$,]/g, '');
      const suffix = period === 'year' ? '/yr' : period === 'hour' ? '/hr' : '/mo';
      salary = `$${parseFloat(min).toLocaleString()} - $${parseFloat(max).toLocaleString()}${suffix}`;
    }
  }
  
  // Fallback: single salary value
  if (!salary) {
    const singleSalary = containerText.match(/\$([\d,]+(?:\.\d{2})?)\s*(?:a |per |an |\/)(year|hour|month)/i);
    if (singleSalary) {
      const amount = singleSalary[1].replace(/,/g, '');
      const period = singleSalary[2].toLowerCase();
      const suffix = period === 'year' ? '/yr' : period === 'hour' ? '/hr' : '/mo';
      salary = `$${parseFloat(amount).toLocaleString()}${suffix}`;
    }
  }
  
  // === DATE POSTED ===
  let datePosted = '';
  // Look for "Posted X days ago" pattern
  const postedMatch = containerText.match(/(?:Posted|Active)\s+(\d+)\+?\s*(day|hour|week|month)s?\s*ago/i);
  if (postedMatch) {
    const amount = parseInt(postedMatch[1]);
    const unit = postedMatch[2].toLowerCase();
    const now = new Date();
    
    if (unit === 'hour') now.setHours(now.getHours() - amount);
    else if (unit === 'day') now.setDate(now.getDate() - amount);
    else if (unit === 'week') now.setDate(now.getDate() - (amount * 7));
    else if (unit === 'month') now.setMonth(now.getMonth() - amount);
    
    datePosted = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  }
  
  // Also check for "Just posted" or "Today"
  if (!datePosted && containerText.match(/Just posted|Today/i)) {
    const now = new Date();
    datePosted = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  }
  
  return {
    title,
    company,
    location,
    companyAddress: '', // Indeed doesn't typically show company address
    url,
    requirements: '',
    salary,
    deadline: '',
    datePosted,
    notes: ''
  };
}

// LINKEDIN SPECIFIC EXTRACTION
// Text-pattern based approach
function extractLinkedInJob() {
  let url = window.location.href;
  
  // Detect if we're in Direct View (used for title/company fallbacks below)
  const isDirectView = url.includes('/jobs/view/') && !url.includes('currentJobId=');
  
  // Extract job ID from URL and construct clean URL
  let jobId = '';
  if (url.includes('currentJobId=')) {
    const jobIdMatch = url.match(/currentJobId=(\d+)/);
    if (jobIdMatch) {
      jobId = jobIdMatch[1];
      url = `https://www.linkedin.com/jobs/view/${jobId}`;
    }
  } else if (url.includes('/jobs/view/')) {
    const jobIdMatch = url.match(/\/jobs\/view\/(\d+)/);
    if (jobIdMatch) {
      jobId = jobIdMatch[1];
    }
  }
  
  // === TITLE (most reliable: from the <a> tag linking to this job) ===
  let title = '';
  
  // Strategy 1: Find the link containing the job ID
  if (jobId) {
    const jobLinks = document.querySelectorAll(`a[href*="/jobs/view/${jobId}"]`);
    for (const link of jobLinks) {
      const text = link.textContent.trim();
      if (text.length > 3 && text.length < 200 && 
          !text.match(/^(Show|match|details|Apply|Save|Share|More|See|View|Tailor)/i)) {
        title = text;
        break;
      }
    }
  }
  
  // Strategy 2 (Direct View): Parse from document.title ("Title | Company | LinkedIn")
  if (!title && isDirectView) {
    const pageTitle = document.title;
    if (pageTitle && pageTitle.includes(' | ')) {
      title = pageTitle.split(' | ')[0].trim();
    }
  }
  
  // === COMPANY (from /company/ links) ===
  let company = '';
  
  const companyLinks = document.querySelectorAll('a[href*="/company/"]');
  for (const link of companyLinks) {
    let text = link.textContent.trim();
    // Strip follower counts that sometimes get appended
    text = text.replace(/\d{1,3}(?:,\d{3})*\s*followers?$/i, '').trim();
    if (text.length > 1 && text.length < 100 &&
        !text.match(/^(LinkedIn|Jobs|About|Life|People|Posts|Careers|See all|View|Follow)$/i)) {
      company = text;
      break;
    }
  }
  
  // Fallback (Direct View): Parse from document.title
  if (!company && isDirectView) {
    const pageTitle = document.title;
    if (pageTitle && pageTitle.includes(' | ')) {
      const parts = pageTitle.split(' | ');
      if (parts.length >= 2) {
        company = parts[1].trim();
      }
    }
  }
  
  // === GET SCOPED TEXT FOR REMAINING FIELDS ===
  // The full page text includes sidebar job cards which contaminate extraction.
  // Instead, we find text near the title link (which we know is correct).
  // The job detail area text follows this pattern:
  //   CompanyName\nTitle\nCity, ST · 2 weeks ago · 37 people...\n$80K/yr...\nOn-site\n...
  
  const fullText = document.body.textContent || '';
  
  // Find the region of text around our title and company
  // This narrows our search to just the selected job's details
  let scopedText = fullText; // fallback
  
  // Find title position in the full text
  if (title) {
    const titleIndex = fullText.indexOf(title);
    if (titleIndex !== -1) {
      // Grab ~800 chars after the title - covers location, salary, work type, date
      // Also grab ~200 chars before for company name context
      const start = Math.max(0, titleIndex - 200);
      const end = Math.min(fullText.length, titleIndex + 800);
      scopedText = fullText.substring(start, end);
    }
  }
  
  // === LOCATION (City, State) ===
  // LinkedIn shows: "Washington, DC · 2 weeks ago · 37 people..."
  // But in textContent, title and location may run together: "Program DirectorWashington, DC · 2 weeks ago"
  // So we need to handle both separated and concatenated cases
  let cityLocation = '';
  
  // Strategy 1: Find "City, ST" followed by " · X time ago" in scoped text
  // Handle the case where a word runs into the city name (e.g., "DirectorWashington")
  // by looking for known city names OR the "X, YY · time ago" pattern with flexible prefix
  const locationWithTimePattern = scopedText.match(/(?:^|[\s\n])([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})\s*[·•]\s*(?:Reposted\s+)?\d+\s+(?:hour|day|week|month)s?\s+ago/);
  if (locationWithTimePattern) {
    cityLocation = locationWithTimePattern[1];
  }
  
  // Strategy 2: Handle concatenated text - look for known city names before ", ST · time ago"
  // e.g., "DirectorWashington, DC · 2 weeks ago" → extract "Washington, DC"
  if (!cityLocation) {
    const concatenatedPattern = scopedText.match(/(Washington|New York|San Francisco|San Diego|San Antonio|San Jose|Salt Lake City|Los Angeles|New Orleans|Fort Worth|Fort Lauderdale|Santa Barbara|Santa Cruz|Santa Fe|El Paso|Las Vegas|Des Moines|Oklahoma City|Kansas City|Jersey City|New Haven|New Brunswick|Grand Rapids|Cedar Rapids|Palm Beach|Palm Springs|Palo Alto|Mountain View|Half Moon Bay|Boston|Chicago|Houston|Phoenix|Philadelphia|Dallas|Austin|Seattle|Denver|Atlanta|Miami|Portland|Minneapolis|Detroit|Charlotte|Nashville|Pittsburgh|Baltimore|Richmond|Raleigh|Tampa|Orlando|Cincinnati|Cleveland|Columbus|Indianapolis|Milwaukee|Memphis|Louisville|Sacramento|St\.?\s*Louis|San Bernardino|Tucson|Fresno|Mesa|Omaha|Albuquerque|Honolulu|Boise|Burlington|Hartford|Stamford|Bridgeport|Trenton|Newark|Camden|Wilmington|Dover|Annapolis),\s*([A-Z]{2})\s*[·•]\s*(?:Reposted\s+)?\d+\s+(?:hour|day|week|month)s?\s+ago/);
    if (concatenatedPattern) {
      cityLocation = `${concatenatedPattern[1]}, ${concatenatedPattern[2]}`;
    }
  }
  
  // Strategy 3: Generic single-word city - look for capital word + ", ST · time ago"
  // Allow the city to be preceded by any character (handles concatenation)
  if (!cityLocation) {
    const genericCityPattern = scopedText.match(/([A-Z][a-z]{2,}),\s*([A-Z]{2})\s*[·•]\s*(?:Reposted\s+)?\d+\s+(?:hour|day|week|month)s?\s+ago/);
    if (genericCityPattern) {
      const potentialCity = genericCityPattern[1];
      if (!potentialCity.match(/^(Director|Manager|Senior|Junior|Associate|Assistant|Engineer|Analyst|Specialist|Coordinator|Administrator)$/i)) {
        cityLocation = `${genericCityPattern[1]}, ${genericCityPattern[2]}`;
      }
    }
  }
  
  // Strategy 4: "Greater X" or "X Metropolitan" or "United States" patterns
  if (!cityLocation) {
    const greaterPattern = scopedText.match(/(Greater\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Area|Metropolitan))?|United States)\s*[·•]\s*(?:Reposted\s+)?\d+\s+(?:hour|day|week|month)s?\s+ago/);
    if (greaterPattern) {
      cityLocation = greaterPattern[1];
    }
  }
  
  // === WORK TYPE (Remote/Hybrid/On-site) ===
  // LinkedIn shows these as badge text near salary/location in the scoped area
  let workType = '';
  
  // Search only in scoped text to avoid sidebar contamination
  if (scopedText.match(/\bOn-site\b/)) {
    workType = 'On-site';
  } else if (scopedText.match(/\bHybrid\b/)) {
    workType = 'Hybrid';
  } else if (scopedText.match(/\bRemote\b/)) {
    workType = 'Remote';
  }
  
  // Combine location
  let location = '';
  if (cityLocation && workType) {
    location = `${cityLocation} (${workType})`;
  } else if (cityLocation) {
    location = cityLocation;
  } else if (workType) {
    location = workType;
  }
  
  // === SALARY ===
  // Search ONLY in scoped text to avoid picking up salary from sidebar job cards
  // Check K/yr format FIRST (most common LinkedIn format) before hourly
  let salary = '';
  
  // Pattern 1: K notation range: $80K/yr - $100K/yr (most common LinkedIn format)
  const kRange = scopedText.match(/\$(\d{1,3})(?:\.(\d))?K\/yr\s*[-–]\s*\$(\d{1,3})(?:\.(\d))?K\/yr/i);
  if (kRange) {
    let min = parseInt(kRange[1]) * 1000;
    if (kRange[2]) min += parseInt(kRange[2]) * 100;
    let max = parseInt(kRange[3]) * 1000;
    if (kRange[4]) max += parseInt(kRange[4]) * 100;
    salary = `$${min.toLocaleString()} - $${max.toLocaleString()}/yr`;
  }
  
  // Pattern 2: Full number range: $120,000 - $150,000
  if (!salary) {
    const fullRange = scopedText.match(/\$(\d{1,3}(?:,\d{3})+)\s*[-–]\s*\$(\d{1,3}(?:,\d{3})+)/);
    if (fullRange) {
      const min = parseInt(fullRange[1].replace(/,/g, ''));
      const max = parseInt(fullRange[2].replace(/,/g, ''));
      salary = `$${min.toLocaleString()} - $${max.toLocaleString()}/yr`;
    }
  }
  
  // Pattern 3: Hourly range: $60/hr - $85/hr
  if (!salary) {
    const hourlyRange = scopedText.match(/\$(\d{1,3})(?:\.\d{2})?\s*(?:\/hr|per hour)\s*[-–]\s*\$(\d{1,3})(?:\.\d{2})?\s*(?:\/hr|per hour)/i);
    if (hourlyRange) {
      salary = `$${parseInt(hourlyRange[1])} - $${parseInt(hourlyRange[2])}/hr`;
    }
  }
  
  // Pattern 4: Single K value: $130K/yr
  if (!salary) {
    const kSingle = scopedText.match(/\$(\d{1,3})(?:\.(\d))?K\/yr/i);
    if (kSingle) {
      let amount = parseInt(kSingle[1]) * 1000;
      if (kSingle[2]) amount += parseInt(kSingle[2]) * 100;
      salary = `$${amount.toLocaleString()}/yr`;
    }
  }
  
  // Pattern 5: Single hourly: $25/hr
  if (!salary) {
    const hourlySingle = scopedText.match(/\$(\d{1,3})(?:\.\d{2})?\s*(?:\/hr|per hour)/i);
    if (hourlySingle) {
      salary = `$${parseInt(hourlySingle[1])}/hr`;
    }
  }
  
  // Pattern 6: $120,000+ (with plus)
  if (!salary) {
    const plusSalary = scopedText.match(/\$(\d{1,3}(?:,\d{3})+)\+/);
    if (plusSalary) {
      const amount = parseInt(plusSalary[1].replace(/,/g, ''));
      salary = `$${amount.toLocaleString()}+/yr`;
    }
  }
  
  // === DATE POSTED ===
  // LinkedIn shows "X time ago" in the info line: "City, ST · 2 weeks ago · 37 people..."
  // Use scoped text and look for the · separator pattern
  let datePosted = '';
  
  const dateMatch = scopedText.match(/[·•]\s*(?:Reposted\s+)?(\d+)\s+(hour|day|week|month)s?\s+ago/i);
  if (dateMatch) {
    const amount = parseInt(dateMatch[1]);
    const unit = dateMatch[2].toLowerCase();
    const now = new Date();
    
    if (unit === 'hour') now.setHours(now.getHours() - amount);
    else if (unit === 'day') now.setDate(now.getDate() - amount);
    else if (unit === 'week') now.setDate(now.getDate() - (amount * 7));
    else if (unit === 'month') now.setMonth(now.getMonth() - amount);
    
    datePosted = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  }
  
  // Requirements - left blank for manual entry (auto-extraction unreliable on LinkedIn)
  let requirements = '';
  
  return {
    title,
    company,
    location,
    companyAddress: '',
    url,
    requirements,
    salary,
    deadline: '',
    datePosted,
    notes: ''
  };
}

function extractGeneralJob(jobUrl) {
  // Extract job title - try multiple methods
  const title = extractTitle();
  
  // Try to extract company name
  const company = extractCompany();
  
  // Try to extract location
  const location = extractLocation();
  
  // Try to extract company address
  const companyAddress = extractCompanyAddress();
  
  // Try to extract requirements
  const requirements = extractRequirements();
  
  // Extract deadline and date posted separately
  const { deadline, datePosted } = extractDates();
  
  // Try to extract salary
  const salary = extractSalary();
  
  return {
    title,
    company,
    location,
    companyAddress,
    url: jobUrl,
    requirements,
    salary,
    deadline,
    datePosted
  };
}

// ALL-HANDS.US SPECIFIC EXTRACTION
function extractAllHandsJob() {
  const url = window.location.href;
  
  // Find the main content area first (where the actual job posting is)
  const mainContent = document.querySelector('main, [role="main"], .job-content, #content, article') || document.body;
  
  // Title - look for h1 within the main content area
  let title = '';
  const h1 = mainContent.querySelector('h1');
  if (h1) {
    const h1Text = h1.textContent.trim();
    // Make sure it's not application instructions
    if (!h1Text.match(/^(To Apply|How to Apply|Application|Join|About)/i)) {
      title = h1Text;
    }
  }
  
  // If still no title, try looking for the job title pattern in visible text
  if (!title) {
    // The title is usually the first large heading
    const headings = mainContent.querySelectorAll('h1, h2');
    for (let heading of headings) {
      const text = heading.textContent.trim();
      // Job titles are typically 10-100 chars and don't start with common instruction words
      if (text.length > 5 && text.length < 100 && 
          !text.match(/^(To Apply|How to|Join|About|Description|Requirements|Location|Compensation)/i)) {
        title = text;
        break;
      }
    }
  }
  
  // Company - look for text near company logo/icon or in specific patterns
  let company = '';
  
  // Strategy 1: Look for company text near an img/icon (companies usually show with logo)
  const imagesInMain = mainContent.querySelectorAll('img, svg, [class*="logo"], [class*="icon"]');
  for (let img of imagesInMain) {
    // Check text near the image (parent, sibling, or nearby elements)
    const parent = img.parentElement;
    const parentText = parent?.textContent.trim();
    
    if (parentText && parentText.length > 2 && parentText.length < 50 && 
        parentText !== title &&
        !parentText.match(/^(Full-time|Part-time|Remote|Hybrid|On-site|USD|Posted|Location|Job|Description)/i)) {
      company = parentText;
      break;
    }
  }
  
  // Strategy 2: Look for element immediately after h1, but skip if it matches the title
  if (!company && h1 && h1.nextElementSibling) {
    const nextEl = h1.nextElementSibling;
    const nextText = nextEl.textContent.trim();
    
    if (nextText && nextText !== title && 
        nextText.length > 2 && nextText.length < 50 && 
        !nextText.match(/^(Full-time|Part-time|Remote|Hybrid|On-site|USD|Posted|Location)/i)) {
      company = nextText;
    }
  }
  
  // Strategy 3: Look for any distinct text that appears company-like (not title, not common words)
  // BUT be very careful to avoid navigation text
  if (!company) {
    // Helper to detect navigation-like text
    const isNavigationText = (text) => {
      // Navigation often has multiple words concatenated: "SearchJobsExplore"
      const multipleCapsNoSpaces = text.match(/[A-Z][a-z]+[A-Z]/) && !text.includes(' ');
      // Or contains navigation keywords
      const hasNavWords = text.match(/\b(Search|Explore|My|Sign|Log|Profile|Settings|Account|alerts?)\b/i);
      // Or is very long (concatenated menu items)
      const tooLong = text.length > 50;
      
      return multipleCapsNoSpaces || hasNavWords || tooLong;
    };
    
    // Only search within non-nav elements
    const contentElements = mainContent.querySelectorAll('h2, h3, p:not(nav p), div:not(nav div), span:not(nav span)');
    for (let el of contentElements) {
      // Skip if element is inside a nav
      if (el.closest('nav, header[role="banner"], [class*="navigation"], [class*="menu"]')) {
        continue;
      }
      
      // Only check elements with direct text (not nested content)
      if (el.children.length === 0 || el.children.length === 1) {
        const text = el.textContent.trim();
        
        if (text && text !== title && 
            text.length > 2 && text.length < 50 &&
            !isNavigationText(text) &&
            !text.match(/^(Full-time|Part-time|Remote|Hybrid|On-site|USD|Posted|Location|Job|Description|Requirements|About|To Apply)/i) &&
            !text.match(/\d+k/i)) { // Not salary
          company = text;
          break;
        }
      }
    }
  }
  
  // Location - all-hands shows location in a specific format
  // Look for text like "Remote", "City, State, USA · Remote", etc.
  let location = '';
  const pageText = document.body.textContent;
  
  // Check if it says "Remote" anywhere in the top section
  const isRemote = pageText.match(/\bRemote\b/);
  
  // Look for location text pattern
  const locationMatch = pageText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2},\s*USA)\s*[·•]\s*Remote/);
  
  if (locationMatch) {
    // Has specific city + Remote (like "Washington, DC, USA · Remote")
    location = `Remote - ${locationMatch[1].replace(', USA', '')}`;
  } else if (isRemote) {
    // Just Remote
    location = 'Remote';
  } else {
    // Try to find just city, state
    const cityMatch = pageText.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2}),\s*USA/);
    if (cityMatch) {
      location = cityMatch[1];
    }
  }
  
  // Salary - look for "USD 90k-110k / year" pattern
  let salary = '';
  const salaryMatch = pageText.match(/USD\s+(\d+)k-(\d+)k\s*\/\s*year/i);
  if (salaryMatch) {
    const min = parseInt(salaryMatch[1]) * 1000;
    const max = parseInt(salaryMatch[2]) * 1000;
    salary = `$${min.toLocaleString()} - $${max.toLocaleString()}/yr`;
  }
  
  // Requirements - left blank for manual entry (auto-extraction unreliable)
  let requirements = '';
  
  // Date Posted - "Posted 6+ months ago", "Posted on Nov 27, 2025"
  let datePosted = '';
  const dateMatch = pageText.match(/Posted\s+(\d+)\+?\s+(month|day|week)s?\s+ago/i);
  if (dateMatch) {
    const amount = parseInt(dateMatch[1]);
    const unit = dateMatch[2].toLowerCase();
    const now = new Date();
    
    if (unit === 'day') now.setDate(now.getDate() - amount);
    else if (unit === 'week') now.setDate(now.getDate() - (amount * 7));
    else if (unit === 'month') now.setMonth(now.getMonth() - amount);
    
    datePosted = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
  } else {
    // Try "Posted on Nov 27, 2025"
    const explicitDateMatch = pageText.match(/Posted on ([A-Z][a-z]+)\s+(\d+),\s+(\d{4})/);
    if (explicitDateMatch) {
      const months = {Jan:1,Feb:2,Mar:3,Apr:4,May:5,Jun:6,Jul:7,Aug:8,Sep:9,Oct:10,Nov:11,Dec:12};
      const month = months[explicitDateMatch[1]];
      const day = explicitDateMatch[2];
      const year = explicitDateMatch[3];
      datePosted = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    }
  }
  
  return {
    title,
    company,
    location,
    companyAddress: '',
    url,
    requirements,
    salary,
    deadline: '',
    datePosted,
    notes: ''
  };
}

function extractJobInformation() {
  // IDEALIST.ORG SPECIFIC EXTRACTION
  const url = window.location.href;
  if (url.includes('idealist.org')) {
    return extractIdealistJob();
  }
  
  // INDEED SPECIFIC EXTRACTION
  if (url.includes('indeed.com')) {
    return extractIndeedJob();
  }
  
  // LINKEDIN SPECIFIC EXTRACTION
  if (url.includes('linkedin.com/jobs')) {
    return extractLinkedInJob();
  }
  
  // ALL-HANDS.US SPECIFIC EXTRACTION
  if (url.includes('all-hands.us')) {
    return extractAllHandsJob();
  }
  
  // RELIEFWEB SPECIFIC EXTRACTION
  if (url.includes('reliefweb.int/job')) {
    return extractReliefWebJob();
  }
  
  // DEVEX SPECIFIC EXTRACTION
  if (url.includes('devex.com/jobs')) {
    return extractDevexJob();
  }
  
  // WORKFORGOOD SPECIFIC EXTRACTION
  if (url.includes('workforgood.org')) {
    return extractWorkForGoodJob();
  }
  
  // GENERAL EXTRACTION (all other sites)
  let jobUrl = url;
  return extractGeneralJob(jobUrl);
}

// ============================================================
// RELIEFWEB.INT SPECIFIC EXTRACTION
// ============================================================
function extractReliefWebJob() {
  const url = window.location.href;
  const pageText = document.body.textContent;
  
  // Title - in h1 with class rw-page-title or rw-article__title
  let title = '';
  const titleEl = document.querySelector('h1.rw-page-title, h1.rw-article__title, h1');
  if (titleEl) {
    title = titleEl.textContent.trim();
  }
  
  // Company/Organization - in the source/organization meta tag
  let company = '';
  // Look for the source dd element
  const sourceEl = document.querySelector('dd.rw-entity-meta__tag-value--source');
  if (sourceEl) {
    company = sourceEl.textContent.trim();
  }
  // Alternative: look for organization link
  if (!company) {
    const orgLink = document.querySelector('a[href*="/organization/"]');
    if (orgLink) {
      company = orgLink.textContent.trim();
    }
  }
  
  // Location - in country slug or location meta
  let location = '';
  // Look for country in the header/meta area
  const countryEl = document.querySelector('.rw-entity-country-slug--above, [class*="country-slug"]');
  if (countryEl) {
    location = countryEl.textContent.trim();
  }
  // Alternative: look in page text for "Job in [Country]"
  if (!location) {
    const locationMatch = pageText.match(/(?:Job in|Location:?)\s+([A-Z][A-Za-z\s]+?)(?:\s+about|\s+requiring|\n)/i);
    if (locationMatch) {
      location = locationMatch[1].trim();
    }
  }
  // Check for Remote
  if (pageText.match(/\bRemote\b/i)) {
    location = location ? `${location} (Remote)` : 'Remote';
  }
  
  // Closing Date - in dd with class rw-entity-meta__tag-value--closing
  let deadline = '';
  const closingEl = document.querySelector('dd.rw-entity-meta__tag-value--closing, [class*="tag-value--closing"]');
  if (closingEl) {
    const closingText = closingEl.textContent.trim();
    // Parse date - could be "16 Feb 2026" or "February 16, 2026"
    deadline = parseDateText(closingText);
  }
  // Fallback: look for "closing on" pattern in text
  if (!deadline) {
    const closingMatch = pageText.match(/closing\s+(?:on\s+)?(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
    if (closingMatch) {
      const day = closingMatch[1];
      const monthStr = closingMatch[2];
      const year = closingMatch[3];
      const monthNum = parseMonthName(monthStr);
      if (monthNum) {
        deadline = `${String(monthNum).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
      }
    }
  }
  
  // Date Posted - in dd with class rw-entity-meta__tag-value--date or --posted
  let datePosted = '';
  const postedEl = document.querySelector('dd.rw-entity-meta__tag-value--date, dd.rw-entity-meta__tag-value--posted, [class*="tag-value--posted"]');
  if (postedEl) {
    const postedText = postedEl.textContent.trim();
    datePosted = parseDateText(postedText);
  }
  // Fallback: relative dates
  if (!datePosted) {
    const relMatch = pageText.match(/(\d+)\s+(hour|day|week|month)s?\s+ago/i);
    if (relMatch) {
      const amount = parseInt(relMatch[1]);
      const unit = relMatch[2].toLowerCase();
      const now = new Date();
      if (unit === 'hour') now.setHours(now.getHours() - amount);
      else if (unit === 'day') now.setDate(now.getDate() - amount);
      else if (unit === 'week') now.setDate(now.getDate() - (amount * 7));
      else if (unit === 'month') now.setMonth(now.getMonth() - amount);
      datePosted = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}/${now.getFullYear()}`;
    }
  }
  
  // Salary - ReliefWeb sometimes includes salary in description
  // Supports USD ($), EUR (€), GBP (£), CAD
  // Handles: "Salary: €46461 or £35994 depending on location"
  let salary = '';
  
  // Helper to normalize numbers (handles both separator styles and no separators)
  const normalizeNum = (s) => {
    if (!s) return '';
    // Remove all separators and just get the digits
    return s.replace(/[.,\s]/g, '');
  };
  
  // Pattern 1: "Salary: €X or £Y" (dual currency - take first)
  const dualCurrencyMatch = pageText.match(/(?:Salary|Salary\s*Range)[:\s]*([€£$]|EUR|GBP|USD|CAD|C\$)\s*(\d{1,6}(?:[.,]\d{3})*)\s+or\s+([€£$]|EUR|GBP|USD|CAD)\s*(\d{1,6}(?:[.,]\d{3})*)/i);
  if (dualCurrencyMatch) {
    const currency1 = dualCurrencyMatch[1] === 'EUR' ? '€' : dualCurrencyMatch[1] === 'GBP' ? '£' : dualCurrencyMatch[1] === 'USD' ? '$' : dualCurrencyMatch[1];
    const amount1 = normalizeNum(dualCurrencyMatch[2]);
    const currency2 = dualCurrencyMatch[3] === 'EUR' ? '€' : dualCurrencyMatch[3] === 'GBP' ? '£' : dualCurrencyMatch[3] === 'USD' ? '$' : dualCurrencyMatch[3];
    const amount2 = normalizeNum(dualCurrencyMatch[4]);
    // Show both currencies
    salary = `${currency1}${parseInt(amount1).toLocaleString()} / ${currency2}${parseInt(amount2).toLocaleString()}/yr`;
  }
  
  // Pattern 2: "Salary: CURRENCY X - Y" (range)
  if (!salary) {
    const rangeMatch = pageText.match(/(?:Salary|Salary\s*Range)[:\s]*([€£$]|EUR|GBP|USD|CAD|C\$)\s*(\d{1,6}(?:[.,]\d{3})*)\s*[-–to]\s*([€£$]|EUR|GBP|USD|CAD|C\$)?\s*(\d{1,6}(?:[.,]\d{3})*)/i);
    if (rangeMatch) {
      const currency = rangeMatch[1] === 'EUR' ? '€' : rangeMatch[1] === 'GBP' ? '£' : rangeMatch[1] === 'USD' ? '$' : rangeMatch[1] === 'CAD' ? 'C$' : rangeMatch[1];
      const min = normalizeNum(rangeMatch[2]);
      const max = normalizeNum(rangeMatch[4]);
      salary = `${currency}${parseInt(min).toLocaleString()} - ${currency}${parseInt(max).toLocaleString()}/yr`;
    }
  }
  
  // Pattern 3: "Salary: CURRENCY X" (single value)
  if (!salary) {
    const singleMatch = pageText.match(/(?:Salary|Salary\s*Range)[:\s]*([€£$]|EUR|GBP|USD|CAD|C\$)\s*(\d{1,6}(?:[.,]\d{3})*)/i);
    if (singleMatch) {
      const currency = singleMatch[1] === 'EUR' ? '€' : singleMatch[1] === 'GBP' ? '£' : singleMatch[1] === 'USD' ? '$' : singleMatch[1] === 'CAD' ? 'C$' : singleMatch[1];
      const amount = normalizeNum(singleMatch[2]);
      salary = `${currency}${parseInt(amount).toLocaleString()}/yr`;
    }
  }
  
  // Pattern 4: Standalone EUR/GBP amounts in text (fallback)
  if (!salary) {
    const euroMatch = pageText.match(/(?:EUR|€)\s*(\d{4,6})/i);
    if (euroMatch) {
      salary = `€${parseInt(euroMatch[1]).toLocaleString()}/yr`;
    }
  }
  if (!salary) {
    const gbpMatch = pageText.match(/(?:GBP|£)\s*(\d{4,6})/i);
    if (gbpMatch) {
      salary = `£${parseInt(gbpMatch[1]).toLocaleString()}/yr`;
    }
  }
  
  // Requirements - left blank for manual entry (auto-extraction unreliable)
  let requirements = '';
  
  return {
    title,
    company,
    location,
    companyAddress: '',
    url,
    requirements,
    salary,
    deadline,
    datePosted,
    notes: ''
  };
}

// ============================================================
// DEVEX.COM SPECIFIC EXTRACTION
// ============================================================
function extractDevexJob() {
  const url = window.location.href;
  const pageText = document.body.textContent;
  
  // Title - in h1
  let title = '';
  const h1 = document.querySelector('h1');
  if (h1) {
    title = h1.textContent.trim();
  }
  
  // Company - in <li class="company-link"> or <a href="/organizations/...">
  let company = '';
  // Primary: look for company-link li
  const companyLi = document.querySelector('li.company-link a, li.margin-bottom-small.company-link a');
  if (companyLi) {
    company = companyLi.textContent.trim();
  }
  // Alternative: any organization link in the secondary-info section
  if (!company) {
    const secondaryInfo = document.querySelector('.secondary-info');
    if (secondaryInfo) {
      const orgLink = secondaryInfo.querySelector('a[href*="/organizations/"]');
      if (orgLink) {
        company = orgLink.textContent.trim();
      }
    }
  }
  // Fallback: any organization link, but filter navigation
  if (!company) {
    const orgLinks = document.querySelectorAll('a[href*="/organizations/"]');
    for (let link of orgLinks) {
      const text = link.textContent.trim();
      // Skip navigation items
      if (text && text.length > 2 && text.length < 100 && 
          !text.match(/^(Employer|Search|Jobs|News|Funding|Talent|Events|Devex)/i)) {
        company = text;
        break;
      }
    }
  }
  
  // Location - in <li class="margin-bottom-small"> with location icon or text
  // Structure: <span>"Worldwide " <span>|</span> " United States"</span>
  let location = '';
  let isRemote = false;
  
  // Look in the secondary-info section for location elements
  const secondaryInfo = document.querySelector('.secondary-info, div.info-wrap');
  if (secondaryInfo) {
    const lis = secondaryInfo.querySelectorAll('li.margin-bottom-small');
    for (let li of lis) {
      // Skip company link
      if (li.classList.contains('company-link')) continue;
      
      // Check for remote indicator (laptop-house icon)
      const laptopIcon = li.querySelector('i.icon-laptop-house, i[class*="laptop-house"]');
      if (laptopIcon) {
        const spanText = li.querySelector('span');
        if (spanText && spanText.textContent.toLowerCase().includes('remote')) {
          isRemote = true;
        }
        continue;
      }
      
      // Check for location (map-marker icon or just text)
      const mapIcon = li.querySelector('i.icon-map-marker, i[class*="map-marker"]');
      const bulletFlex = li.querySelector('.bullet-flex');
      
      if (bulletFlex || mapIcon) {
        // Get the text, handling the "Worldwide | United States" format
        let locText = li.textContent.trim();
        // Clean up: remove extra whitespace and normalize separators
        locText = locText.replace(/\s+/g, ' ').replace(/\s*\|\s*/g, ' | ').trim();
        
        // Skip if it's clearly not a location
        if (!locText.match(/^(Full-time|Part-time|Staff|Posted|Closing|Current|Remote)/i) &&
            locText.length > 2 && locText.length < 150) {
          location = locText;
        }
      }
    }
  }
  
  // Alternative location detection from page text
  if (!location) {
    // Look for "City, Country" or "Country | Region" pattern
    const locMatch = pageText.match(/(?:Location|Based in)[:\s]+([A-Za-z,\s|]+?)(?:\n|Closing|Posted)/i);
    if (locMatch) {
      location = locMatch[1].trim();
    }
  }
  
  // Check for Remote in text if not detected by icon
  if (!isRemote && pageText.match(/\bRemote\s+position\b/i)) {
    isRemote = true;
  }
  
  // Combine location with remote status
  if (isRemote) {
    if (location && !location.toLowerCase().includes('remote')) {
      location = `${location} (Remote)`;
    } else if (!location) {
      location = 'Remote';
    }
  }
  
  // Date Posted - "Posted on DD Month YYYY" in the header area
  let datePosted = '';
  const postedMatch = pageText.match(/Posted\s+on\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (postedMatch) {
    const day = postedMatch[1];
    const monthStr = postedMatch[2];
    const year = postedMatch[3];
    const monthNum = parseMonthName(monthStr);
    if (monthNum) {
      datePosted = `${String(monthNum).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    }
  }
  
  // Closing Date - "Closing on DD Month YYYY" OR "Deadline for applications: Month DD, YYYY"
  let deadline = '';
  // Pattern 1: "Closing on DD Month YYYY"
  const closingMatch = pageText.match(/Closing\s+on\s+(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/i);
  if (closingMatch) {
    const day = closingMatch[1];
    const monthStr = closingMatch[2];
    const year = closingMatch[3];
    const monthNum = parseMonthName(monthStr);
    if (monthNum) {
      deadline = `${String(monthNum).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    }
  }
  // Pattern 2: "Deadline for applications: Month DD, YYYY"
  if (!deadline) {
    const deadlineMatch = pageText.match(/Deadline\s+(?:for\s+)?applications?[:\s]+([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/i);
    if (deadlineMatch) {
      const monthStr = deadlineMatch[1];
      const day = deadlineMatch[2];
      const year = deadlineMatch[3];
      const monthNum = parseMonthName(monthStr);
      if (monthNum) {
        deadline = `${String(monthNum).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
      }
    }
  }
  
  // Salary - Devex shows "Salary Range: $X - $Y - $Z" or just mentions salary in text
  // Supports USD ($), EUR (€), GBP (£), CAD
  let salary = '';
  
  // Detect currency from context
  let detectedCurrency = '$';
  if (pageText.match(/EUR|€/i) && !pageText.match(/USD|\$/)) detectedCurrency = '€';
  else if (pageText.match(/GBP|£/i)) detectedCurrency = '£';
  else if (pageText.match(/CAD|C\$/i)) detectedCurrency = 'C$';
  
  // USD Pattern: "Salary Range: $148,000 - $185,000 - $222,000" (min - mid - max)
  const salaryRangeMatch = pageText.match(/Salary\s*(?:Range)?[:\s]*\$\s*([\d,]+)\s*[-–]\s*\$\s*([\d,]+)(?:\s*[-–]\s*\$\s*([\d,]+))?/i);
  if (salaryRangeMatch) {
    const min = salaryRangeMatch[1].replace(/,/g, '');
    const mid = salaryRangeMatch[2].replace(/,/g, '');
    const max = salaryRangeMatch[3] ? salaryRangeMatch[3].replace(/,/g, '') : null;
    if (max) {
      salary = `$${parseInt(min).toLocaleString()} - $${parseInt(max).toLocaleString()}/yr`;
    } else {
      salary = `$${parseInt(min).toLocaleString()} - $${parseInt(mid).toLocaleString()}/yr`;
    }
  }
  
  // EUR Pattern
  if (!salary) {
    const euroMatch = pageText.match(/Salary\s*(?:Range)?[:\s]*(?:EUR\s*)?€\s*([\d.,]+)\s*[-–]\s*€?\s*([\d.,]+)/i);
    if (euroMatch) {
      const normalizeNum = (s) => s.replace(/\./g, '').replace(',', '.');
      const min = normalizeNum(euroMatch[1]);
      const max = normalizeNum(euroMatch[2]);
      salary = `€${parseInt(min).toLocaleString()} - €${parseInt(max).toLocaleString()}/yr`;
    }
  }
  
  // GBP Pattern
  if (!salary) {
    const gbpMatch = pageText.match(/Salary\s*(?:Range)?[:\s]*(?:GBP\s*)?£\s*([\d,]+)\s*[-–]\s*£?\s*([\d,]+)/i);
    if (gbpMatch) {
      const min = gbpMatch[1].replace(/,/g, '');
      const max = gbpMatch[2].replace(/,/g, '');
      salary = `£${parseInt(min).toLocaleString()} - £${parseInt(max).toLocaleString()}/yr`;
    }
  }
  
  // CAD Pattern
  if (!salary) {
    const cadMatch = pageText.match(/Salary\s*(?:Range)?[:\s]*(?:CAD|C\$)\s*\$?\s*([\d,]+)\s*[-–]\s*(?:CAD|C\$)?\s*\$?\s*([\d,]+)/i);
    if (cadMatch) {
      const min = cadMatch[1].replace(/,/g, '');
      const max = cadMatch[2].replace(/,/g, '');
      salary = `C$${parseInt(min).toLocaleString()} - C$${parseInt(max).toLocaleString()}/yr`;
    }
  }
  
  // Alternative: look for any salary mention in job description
  if (!salary) {
    // USD
    const salaryAltMatch = pageText.match(/(?:salary|compensation)[:\s]*\$\s*([\d,]+)(?:\s*[-–to]\s*\$?\s*([\d,]+))?/i);
    if (salaryAltMatch) {
      const min = salaryAltMatch[1].replace(/,/g, '');
      if (salaryAltMatch[2]) {
        const max = salaryAltMatch[2].replace(/,/g, '');
        salary = `$${parseInt(min).toLocaleString()} - $${parseInt(max).toLocaleString()}/yr`;
      } else {
        salary = `$${parseInt(min).toLocaleString()}/yr`;
      }
    }
  }
  if (!salary) {
    // EUR
    const euroAltMatch = pageText.match(/(?:salary|compensation)[:\s]*(?:EUR\s*)?€\s*([\d.,]+)(?:\s*[-–to]\s*€?\s*([\d.,]+))?/i);
    if (euroAltMatch) {
      const normalizeNum = (s) => s.replace(/\./g, '').replace(',', '.');
      const min = normalizeNum(euroAltMatch[1]);
      if (euroAltMatch[2]) {
        const max = normalizeNum(euroAltMatch[2]);
        salary = `€${parseInt(min).toLocaleString()} - €${parseInt(max).toLocaleString()}/yr`;
      } else {
        salary = `€${parseInt(min).toLocaleString()}/yr`;
      }
    }
  }
  if (!salary) {
    // GBP
    const gbpAltMatch = pageText.match(/(?:salary|compensation)[:\s]*(?:GBP\s*)?£\s*([\d,]+)(?:\s*[-–to]\s*£?\s*([\d,]+))?/i);
    if (gbpAltMatch) {
      const min = gbpAltMatch[1].replace(/,/g, '');
      if (gbpAltMatch[2]) {
        const max = gbpAltMatch[2].replace(/,/g, '');
        salary = `£${parseInt(min).toLocaleString()} - £${parseInt(max).toLocaleString()}/yr`;
      } else {
        salary = `£${parseInt(min).toLocaleString()}/yr`;
      }
    }
  }
  
  // Requirements - left blank for manual entry (auto-extraction unreliable)
  let requirements = '';
  
  return {
    title,
    company,
    location,
    companyAddress: '',
    url,
    requirements,
    salary,
    deadline,
    datePosted,
    notes: ''
  };
}

// ============================================================
// WORKFORGOOD.ORG SPECIFIC EXTRACTION
// ============================================================
function extractWorkForGoodJob() {
  const url = window.location.href;
  const pageText = document.body.textContent;
  
  // Title - in h1 (the job title like "CEO")
  let title = '';
  const h1 = document.querySelector('h1');
  if (h1) {
    const h1Text = h1.textContent.trim();
    // Make sure it's not navigation text
    if (!h1Text.match(/^(Find a job|Search|Home|About|Work for)/i) && h1Text.length < 150) {
      title = h1Text;
    }
  }
  
  // Company - in the link inside h2 that links to the same job listing
  // Structure: <h2><a href="/listing-job/...">Company Name</a></h2>
  let company = '';
  // Look for link that matches the current URL pattern (company name link)
  const h2 = document.querySelector('h2');
  if (h2) {
    const companyLink = h2.querySelector('a[href*="/listing-job/"]');
    if (companyLink) {
      company = companyLink.textContent.trim();
    } else {
      // Fallback: just use h2 text if no link
      const h2Text = h2.textContent.trim();
      if (h2Text && !h2Text.match(/^(About|Get job|Similar|Job Details)/i)) {
        company = h2Text;
      }
    }
  }
  // Alternative: look for company name in the visible text pattern "Company Name" under title
  if (!company) {
    // Look for text right after the h1 that's styled as company
    const companyEl = document.querySelector('.elementor-heading-title a[href*="/listing-job/"]');
    if (companyEl) {
      company = companyEl.textContent.trim();
    }
  }
  
  // Company Address - in jet-listing-dynamic-field__content span under Location heading
  let companyAddress = '';
  // Look for the address in the structured fields
  const addressSpan = document.querySelector('span.jet-listing-dynamic-field__content');
  if (addressSpan) {
    const addrText = addressSpan.textContent.trim();
    // Check if it looks like an address (has numbers and state abbreviation)
    if (addrText.match(/\d+.*[A-Z]{2}\s+\d{5}/)) {
      companyAddress = addrText;
    }
  }
  // Alternative: search all jet-listing spans for address pattern
  if (!companyAddress) {
    const allSpans = document.querySelectorAll('span.jet-listing-dynamic-field__content');
    for (let span of allSpans) {
      const text = span.textContent.trim();
      if (text.match(/\d+\s+\S+.*,\s*[A-Z]{2}\s+\d{5}/)) {
        companyAddress = text;
        break;
      }
    }
  }
  
  // Location (City, State) - extract from address or from Location section
  let location = '';
  // Parse from company address if available
  if (companyAddress) {
    // Extract "City, ST" from full address
    const cityStateMatch = companyAddress.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})/);
    if (cityStateMatch) {
      location = `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
    }
  }
  // Alternative: look in page text
  if (!location) {
    const locMatch = pageText.match(/Location\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})/);
    if (locMatch) {
      location = locMatch[1];
    }
  }
  
  // Check for work type (Remote/Hybrid/In-Person)
  let workType = '';
  if (pageText.match(/Workplace\s+options\s*Remote/i) || pageText.match(/\bRemote\b/i)) {
    workType = 'Remote';
  } else if (pageText.match(/Workplace\s+options\s*Hybrid/i) || pageText.match(/\bHybrid\b/i)) {
    workType = 'Hybrid';
  } else if (pageText.match(/Workplace\s+options\s*In-Person/i) || pageText.match(/\bIn-Person\b/i)) {
    workType = 'In-Person';
  }
  
  // Combine location with work type
  if (location && workType) {
    location = `${location} (${workType})`;
  } else if (workType && !location) {
    location = workType;
  }
  
  // Date Posted - "Posted: Month DD, YYYY" or "Posted:December 30, 2025"
  let datePosted = '';
  const postedMatch = pageText.match(/Posted:?\s*([A-Za-z]+)\s*(\d{1,2}),?\s*(\d{4})/i);
  if (postedMatch) {
    const monthStr = postedMatch[1];
    const day = postedMatch[2];
    const year = postedMatch[3];
    const monthNum = parseMonthName(monthStr);
    if (monthNum) {
      datePosted = `${String(monthNum).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    }
  }
  
  // Deadline/Expires - "Expires: Month DD, YYYY" or "Expires:January 29, 2026"
  let deadline = '';
  const expiresMatch = pageText.match(/Expires:?\s*([A-Za-z]+)\s*(\d{1,2}),?\s*(\d{4})/i);
  if (expiresMatch) {
    const monthStr = expiresMatch[1];
    const day = expiresMatch[2];
    const year = expiresMatch[3];
    const monthNum = parseMonthName(monthStr);
    if (monthNum) {
      deadline = `${String(monthNum).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    }
  }
  
  // Salary - WorkForGood format: "$140,000.00 – $175,000.00 (max)" in page text
  // OR in span elements: "$140,000.00 (salary min)" and "$175,000.00 (salary max)"
  let salary = '';
  
  // Pattern 1: Look for salary range in page text "$X – $Y (max)" or "$X - $Y"
  const salaryRangeMatch = pageText.match(/\$([\d,]+(?:\.\d{2})?)\s*[–\-]\s*\$([\d,]+(?:\.\d{2})?)/);
  if (salaryRangeMatch) {
    const min = parseFloat(salaryRangeMatch[1].replace(/,/g, ''));
    const max = parseFloat(salaryRangeMatch[2].replace(/,/g, ''));
    salary = `$${Math.round(min).toLocaleString()} - $${Math.round(max).toLocaleString()}/yr`;
  }
  
  // Pattern 2: Look in jet-listing spans for salary values
  if (!salary) {
    const salarySpans = document.querySelectorAll('span.jet-listing-dynamic-field__content');
    let salaryMin = null;
    let salaryMax = null;
    for (let span of salarySpans) {
      const text = span.textContent.trim();
      // Check for "(salary min)" or "(salary max)" or just dollar amounts
      const minMatch = text.match(/\$([\d,]+(?:\.\d{2})?)\s*\((?:salary\s+)?min\)/i);
      const maxMatch = text.match(/\$([\d,]+(?:\.\d{2})?)\s*\((?:salary\s+)?max\)/i);
      if (minMatch) {
        salaryMin = parseFloat(minMatch[1].replace(/,/g, ''));
      }
      if (maxMatch) {
        salaryMax = parseFloat(maxMatch[1].replace(/,/g, ''));
      }
    }
    if (salaryMin && salaryMax) {
      salary = `$${Math.round(salaryMin).toLocaleString()} - $${Math.round(salaryMax).toLocaleString()}/yr`;
    } else if (salaryMax) {
      salary = `$${Math.round(salaryMax).toLocaleString()}/yr`;
    } else if (salaryMin) {
      salary = `$${Math.round(salaryMin).toLocaleString()}/yr`;
    }
  }
  
  // Pattern 3: Look for hourly rates
  if (!salary) {
    const hourlyMatch = pageText.match(/\$([\d.]+)\s*\(hourly\s*(?:min|max)?\)/i);
    if (hourlyMatch) {
      const rate = parseFloat(hourlyMatch[1]);
      salary = `$${rate.toFixed(2)}/hr`;
    }
  }
  
  // Requirements - left blank for manual entry (auto-extraction unreliable)
  let requirements = '';
  
  return {
    title,
    company,
    location,
    companyAddress,
    url,
    requirements,
    salary,
    deadline,
    datePosted,
    notes: ''
  };
}

// Helper function to parse month names to numbers
function parseMonthName(monthStr) {
  const months = {
    'january': 1, 'jan': 1,
    'february': 2, 'feb': 2,
    'march': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'may': 5,
    'june': 6, 'jun': 6,
    'july': 7, 'jul': 7,
    'august': 8, 'aug': 8,
    'september': 9, 'sep': 9, 'sept': 9,
    'october': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'december': 12, 'dec': 12
  };
  return months[monthStr.toLowerCase()] || null;
}

// Helper function to parse various date text formats
function parseDateText(text) {
  if (!text) return '';
  text = text.trim();
  
  // Already in MM/DD/YYYY format
  if (text.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    return text;
  }
  
  // Format: "DD Mon YYYY" (e.g., "16 Feb 2026")
  let match = text.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const day = match[1];
    const monthNum = parseMonthName(match[2]);
    const year = match[3];
    if (monthNum) {
      return `${String(monthNum).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    }
  }
  
  // Format: "Mon DD, YYYY" (e.g., "February 16, 2026")
  match = text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (match) {
    const monthNum = parseMonthName(match[1]);
    const day = match[2];
    const year = match[3];
    if (monthNum) {
      return `${String(monthNum).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    }
  }
  
  // Format: "YYYY-MM-DD" (ISO)
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return `${match[2]}/${match[3]}/${match[1]}`;
  }
  
  // Format: "DD/MM/YYYY" (European) - only if day > 12
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match && parseInt(match[1]) > 12) {
    return `${match[2].padStart(2, '0')}/${match[1].padStart(2, '0')}/${match[3]}`;
  }
  
  return '';
}

function extractTitle() {
  // First try: JSON-LD structured data (LinkedIn and many sites use this)
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (let script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'JobPosting' && data.title) {
          return data.title.trim();
        }
        // Sometimes it's nested in @graph
        if (data['@graph']) {
          const jobPosting = data['@graph'].find(item => item['@type'] === 'JobPosting');
          if (jobPosting && jobPosting.title) {
            return jobPosting.title.trim();
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  
  // LinkedIn specific: Look for link with job URL pattern (before view/)
  try {
    // LinkedIn job links have pattern: /jobs/view/12345 or contains job ID
    const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"], a[href*="currentJobId="]');
    for (let link of jobLinks) {
      const text = link.textContent.trim();
      // Job titles are usually between 10-150 chars, avoid nav elements
      if (text.length > 10 && text.length < 150 && !text.match(/^(Apply|Save|Share|LinkedIn|Jobs|Back|Close)$/i)) {
        return text;
      }
    }
  } catch (e) {}
  
  // Try to find job title in common places
  const titleSelectors = [
    // LinkedIn-specific (most specific first)
    '.job-details-jobs-unified-top-card__job-title h1',
    '.jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title',
    '.jobs-details-top-card__job-title',
    'h1.t-24',
    // Generic selectors
    'h1',
    '[class*="job-title" i]',
    '[class*="jobtitle" i]',
    '[class*="job_title" i]',
    '[class*="position" i]',
    '[class*="posting-title" i]',
    '[data-testid*="title" i]',
    '[itemprop="title"]',
    'h1[class*="title" i]',
    'h2[class*="title" i]'
  ];
  
  for (let selector of titleSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim().length > 0 && el.textContent.trim().length < 200) {
      const text = el.textContent.trim();
      // Make sure it's not a generic header
      if (!text.match(/^(jobs|careers|about|contact|home|search)$/i)) {
        return text;
      }
    }
  }
  
  // Try to extract from page title, removing common suffixes
  const pageTitle = document.title;
  const cleaned = pageTitle
    .replace(/\s*[-–|]\s*(LinkedIn|Indeed|Glassdoor|Jobs|Careers|Apply|The Sentry).*$/i, '')
    .replace(/\s*[-–|]\s*[A-Z][a-z]+.*$/, '') // Remove company name after separator
    .trim();
  
  if (cleaned.length > 0 && cleaned.length < 200) {
    return cleaned;
  }
  
  return document.title;
}

function extractCompany() {
  // First try: JSON-LD structured data (LinkedIn and many sites use this)
  try {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (let script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data['@type'] === 'JobPosting' && data.hiringOrganization) {
          if (typeof data.hiringOrganization === 'string') {
            return data.hiringOrganization.trim();
          } else if (data.hiringOrganization.name) {
            return data.hiringOrganization.name.trim();
          }
        }
        // Sometimes it's nested in @graph
        if (data['@graph']) {
          const jobPosting = data['@graph'].find(item => item['@type'] === 'JobPosting');
          if (jobPosting && jobPosting.hiringOrganization) {
            if (typeof jobPosting.hiringOrganization === 'string') {
              return jobPosting.hiringOrganization.trim();
            } else if (jobPosting.hiringOrganization.name) {
              return jobPosting.hiringOrganization.name.trim();
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
  
  // LinkedIn specific: Look for company links with /company/ pattern
  try {
    const companyLinks = document.querySelectorAll('a[href*="/company/"]');
    for (let link of companyLinks) {
      const text = link.textContent.trim();
      // Company names are usually 2-100 chars, avoid buttons/nav
      if (text.length > 1 && text.length < 100 && !text.match(/^(LinkedIn|Jobs|About|Life|People|Posts|Careers|See all|View|Follow)$/i)) {
        return text;
      }
    }
  } catch (e) {}
  
  // Try various selectors for company name - LinkedIn-specific first
  const selectors = [
    // LinkedIn-specific (most specific first)
    '.job-details-jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name',
    '.jobs-details-top-card__company-name',
    'a.app-aware-link[href*="/company/"]',
    // Generic selectors
    '[data-company]',
    '[data-company-name]',
    '.company-name',
    '.company_name',
    '.employer-name',
    '.employer_name',
    '[itemprop="hiringOrganization"]',
    '[itemprop="name"]',
    '.company',
    '[class*="company" i]',
    '[class*="employer" i]',
    '[class*="organization" i]',
    '[data-testid="company-name"]',
    '[data-testid="employer-name"]',
    '.topcard__org-name-link',
    'a[class*="company" i]',
    'span[class*="company" i]',
    'div[class*="company" i]',
    // Idealist.org specific
    '.org-name',
    '[class*="OrganizationName" i]',
    'a[href*="/en/nonprofit/"]',
    // Greenhouse selectors
    '.company-name',
    '.app-title',
    // Lever selectors  
    '.posting-headline .company-name',
    // Workday selectors
    '[data-automation-id="jobPostingCompany"]',
    // BambooHR selectors
    '.company-header__name',
    // Generic organization selectors
    'meta[property="og:site_name"]',
    // Logo alt text often contains company name
    'header img[alt]',
    'nav img[alt]',
    '.logo img[alt]'
  ];
  
  for (let selector of selectors) {
    let el;
    if (selector.startsWith('meta')) {
      el = document.querySelector(selector);
      if (el && el.content) return el.content.trim();
    } else if (selector.includes('img[alt]')) {
      el = document.querySelector(selector);
      if (el && el.alt && el.alt.length < 100 && el.alt.length > 2) {
        const text = el.alt.trim();
        // Filter out generic words
        if (!text.match(/^(logo|image|icon|menu|home|job|career)$/i)) {
          return text;
        }
      }
    } else if (selector.includes('href*="/en/nonprofit/"')) {
      // Idealist.org specific - extract from link
      el = document.querySelector(selector);
      if (el && el.textContent.trim()) {
        const text = el.textContent.trim();
        if (text.length > 2 && text.length < 100 &&
            !text.match(/^(job|career|apply|search|filter|location|remote|hybrid|view organization)$/i)) {
          return text;
        }
      }
    } else {
      el = document.querySelector(selector);
      if (el && el.textContent.trim() && el.textContent.trim().length < 100) {
        const text = el.textContent.trim();
        // Filter out generic words
        if (!text.match(/^(job|career|apply|search|filter|location|remote|hybrid)$/i)) {
          return text;
        }
      }
    }
  }
  
  // Try JSON-LD structured data
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (let script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent);
      if (data.hiringOrganization && data.hiringOrganization.name) {
        return data.hiringOrganization.name;
      }
      if (data['@type'] === 'Organization' && data.name) {
        return data.name;
      }
    } catch (e) {
      // Skip invalid JSON
    }
  }
  
  // Try meta tags
  const metaTags = [
    'meta[property="og:site_name"]',
    'meta[name="application-name"]',
    'meta[name="apple-mobile-web-app-title"]'
  ];
  
  for (let selector of metaTags) {
    const meta = document.querySelector(selector);
    if (meta && meta.content) {
      return meta.content.trim();
    }
  }
  
  // Try to extract from page title (after dash or hyphen)
  const titleMatch = document.title.match(/[-–|]\s*([^-–|]+)$/);
  if (titleMatch && titleMatch[1]) {
    const candidate = titleMatch[1].trim();
    // Validate it's not a generic word
    if (candidate.length > 2 && candidate.length < 100 && 
        !candidate.match(/^(jobs|careers|apply|linkedin|indeed|glassdoor|idealist)$/i)) {
      return candidate;
    }
  }
  
  // Try to extract from URL path
  const hostname = new URL(window.location.href).hostname;
  const cleanHostname = hostname.replace(/^(www\.|careers\.|jobs\.)/, '').replace(/\.(com|org|net|edu|gov|io).*$/, '');
  
  // Capitalize first letter of each word
  return cleanHostname.split(/[.-]/).map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  ).join(' ');
}

function extractLocation() {
  const text = document.body.textContent;
  const lowerText = text.toLowerCase();
  
  let locationType = '';
  let cityLocation = '';
  
  // Check for remote/hybrid type
  if (lowerText.includes('hybrid')) {
    locationType = 'Hybrid';
  } else if (lowerText.includes('remote') || lowerText.includes('work from home') || lowerText.includes('wfh')) {
    locationType = 'Remote';
  }
  
  // Try to find actual city location in common selectors
  const locationSelectors = [
    '[class*="location" i]',
    '[class*="job-location" i]',
    '[data-testid*="location" i]',
    '[itemprop="jobLocation"]',
    '[itemprop="addressLocality"]',
    '.jobs-unified-top-card__bullet',
    '.job-details-jobs-unified-top-card__job-insight',
    '[data-automation-id="jobPostingLocation"]'
  ];
  
  for (let selector of locationSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      const locationText = el.textContent.trim();
      // Validate it looks like a location (not too long, not generic text)
      if (locationText.length < 100 && locationText.length > 2 &&
          !locationText.match(/^(job|career|apply|search|filter|salary|posted|full.?time|part.?time|hybrid|remote)$/i)) {
        cityLocation = locationText;
        break;
      }
    }
  }
  
  // If still no city, look for common location patterns in text
  if (!cityLocation) {
    const locationPatterns = [
      // City, State format (must be 3+ chars for city to avoid "Street, NW")
      /\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2})\b/g,
      // City, State, Country
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2},\s*(?:USA|United States))\b/gi,
      // Location: City format
      /location[:\s]+([A-Z][a-z]+(?:[\s,]+[A-Z][a-z]+)*)/gi
    ];
    
    for (let pattern of locationPatterns) {
      const matches = text.match(pattern);
      if (matches && matches.length > 0) {
        let location = matches[0];
        // Clean up "Location:" prefix
        location = location.replace(/^location[:\s]+/i, '');
        
        // Validate: skip if it looks like a street (contains common street suffixes)
        if (location.match(/\b(Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)\b/i)) {
          continue; // Skip this match, it's an address
        }
        
        // Validate: skip common non-location words
        if (location.match(/\b(Job Type|Full Time|Part Time|Contract|Temporary|Permanent|Remote|Hybrid|Onsite|Apply|Save|Share|Posted|Salary)\b/i)) {
          continue; // Skip this match, it's not a location
        }
        
        // Validate: skip if it's a partial match of a known city (e.g., "York" from "New York")
        // Look for the match in context to see if it's preceded by another word
        const matchIndex = text.indexOf(location);
        if (matchIndex > 0) {
          const before = text.substring(Math.max(0, matchIndex - 10), matchIndex);
          // If preceded by "New " or other common prefixes, skip this partial match
          if (before.match(/\b(New|San|Los|St|Saint|Fort|Port)\s*$/i)) {
            continue; // This is a partial city name, skip it
          }
        }
        
        // Limit length
        if (location.length < 100 && location.length > 5) {
          cityLocation = location.trim();
          break;
        }

      }
    }
  }
  
  // Combine location type and city
  if (locationType && cityLocation) {
    // Remove locationType from cityLocation if it's already there
    const cleanCity = cityLocation.replace(/\b(hybrid|remote)\b/gi, '').trim().replace(/^[-\s]+/, '');
    if (cleanCity) {
      return `${locationType} - ${cleanCity}`;
    }
    return locationType;
  } else if (cityLocation) {
    return cityLocation;
  } else if (locationType) {
    return locationType;
  }
  
  return '';
}

function extractCompanyAddress() {
  // First try structured data extraction (from existing code)
  const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (let script of jsonLdScripts) {
    try {
      const data = JSON.parse(script.textContent);
      
      // Check for JobPosting with hiringOrganization address
      if (data['@type'] === 'JobPosting' && data.hiringOrganization) {
        const org = data.hiringOrganization;
        if (org.address) {
          const addr = org.address;
          if (typeof addr === 'string') {
            return addr;
          }
          // PostalAddress format
          if (addr.streetAddress || addr.addressLocality) {
            const parts = [];
            if (addr.streetAddress) parts.push(addr.streetAddress);
            if (addr.addressLocality) parts.push(addr.addressLocality);
            if (addr.addressRegion) parts.push(addr.addressRegion);
            if (addr.postalCode) parts.push(addr.postalCode);
            if (addr.addressCountry) {
              const country = typeof addr.addressCountry === 'string' ? 
                             addr.addressCountry : (addr.addressCountry.name || '');
              if (country && country.length > 2) {
                parts.push(country);
              }
            }
            return parts.join(', ');
          }
        }
      }
      
      // Check for Organization type
      if (data['@type'] === 'Organization' && data.address) {
        const addr = data.address;
        if (typeof addr === 'string') {
          return addr;
        }
        if (addr.streetAddress || addr.addressLocality) {
          const parts = [];
          if (addr.streetAddress) parts.push(addr.streetAddress);
          if (addr.addressLocality) parts.push(addr.addressLocality);
          if (addr.addressRegion) parts.push(addr.addressRegion);
          if (addr.postalCode) parts.push(addr.postalCode);
          if (addr.addressCountry) {
            const country = typeof addr.addressCountry === 'string' ? 
                           addr.addressCountry : (addr.addressCountry.name || '');
            if (country && country.length > 2) {
              parts.push(country);
            }
          }
          return parts.join(', ');
        }
      }
    } catch (e) {
      // Skip invalid JSON
    }
  }
  
  // Try schema.org microdata
  const addressElements = document.querySelectorAll('[itemprop="address"]');
  for (let el of addressElements) {
    const addressText = el.textContent.trim();
    if (addressText && addressText.length > 10 && addressText.length < 200) {
      return addressText;
    }
  }
  
  // Try common address selectors
  const addressSelectors = [
    '[class*="company-address" i]',
    '[class*="office-address" i]',
    '[class*="headquarters" i]',
    '[class*="hq-address" i]',
    '[data-testid*="address" i]',
    '.contact-address',
    '.office-location'
  ];
  
  for (let selector of addressSelectors) {
    const el = document.querySelector(selector);
    if (el && el.textContent.trim()) {
      const text = el.textContent.trim();
      if (text.length > 10 && text.length < 200) {
        // Validate it looks like an address (has numbers and commas)
        if (text.match(/\d+/) && text.match(/,/)) {
          return text;
        }
      }
    }
  }
  
  // Try to find address patterns in visible text
  // Pattern: number + street + city, state zip
  const addressPattern = /\b(\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Circle|Cir|Plaza|Plz)[,\s]+[A-Za-z\s]+,\s*[A-Z]{2}\s*\d{5}(?:-\d{4})?)\b/i;
  const fullPageMatch = document.body.textContent.match(addressPattern);
  if (fullPageMatch) {
    return fullPageMatch[1].trim();
  }
  
  // Look for any pattern with street number, city, state
  const looserPattern = /\b(\d+\s+[A-Za-z\s]{5,40}[,\s]+[A-Za-z\s]+,\s*[A-Z]{2})\b/;
  const looserMatch = document.body.textContent.match(looserPattern);
  if (looserMatch && looserMatch[1].length < 150) {
    return looserMatch[1].trim();
  }
  
  return '';
}

function extractRequirements() {
  // Requirements extraction disabled - too unreliable
  // Users should manually enter application requirements
  return '';
}

function extractDates() {
  const text = document.body.textContent;
  const lowerText = text.toLowerCase();
  let deadline = '';
  let datePosted = '';
  
  // Helper function to convert relative dates to actual dates (for LinkedIn)
  function parseRelativeToDate(relativeStr) {
    const lower = relativeStr.toLowerCase();
    const now = new Date();
    
    const hoursMatch = lower.match(/(\d+)\s*hours?\s*ago/);
    if (hoursMatch) {
      const date = new Date(now.getTime() - parseInt(hoursMatch[1]) * 60 * 60 * 1000);
      return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
    }
    
    const daysMatch = lower.match(/(\d+)\s*days?\s*ago/);
    if (daysMatch) {
      const date = new Date(now.getTime() - parseInt(daysMatch[1]) * 24 * 60 * 60 * 1000);
      return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
    }
    
    const weeksMatch = lower.match(/(\d+)\s*weeks?\s*ago/);
    if (weeksMatch) {
      const date = new Date(now.getTime() - parseInt(weeksMatch[1]) * 7 * 24 * 60 * 60 * 1000);
      return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
    }
    
    const monthsMatch = lower.match(/(\d+)\s*months?\s*ago/);
    if (monthsMatch) {
      const date = new Date(now);
      date.setMonth(date.getMonth() - parseInt(monthsMatch[1]));
      return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
    }
    
    return null;
  }
  
  // STRATEGY 1: Look for explicit labeled dates with surrounding context
  
  // Posted date patterns - look for these FIRST (including LinkedIn relative dates)
  const postedPatterns = [
    // LinkedIn specific: relative dates WITH context (more accurate)
    { regex: /(?:posted|reposted|listed)[:\s]*(\d+\s*(?:hours?|days?|weeks?|months?)\s*ago)/i, context: 100, isRelative: true },
    { regex: /(\d+\s*(?:hours?|days?|weeks?|months?)\s*ago)[\s·•,]+\d+\s*(?:applicants?|people)/i, context: 100, isRelative: true },
    // Generic relative date (last resort for LinkedIn)
    { regex: /(\d+\s*(?:hours?|days?|weeks?|months?)\s*ago)/i, context: 100, isRelative: true },
    { regex: /posted\s+on[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 100 },
    { regex: /date\s+posted[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 100 },
    { regex: /published[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 100 },
    { regex: /posted[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, context: 100 },
    { regex: /date\s+posted[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, context: 100 },
    { regex: /posted[:\s]*(\d{4}-\d{2}-\d{2})/i, context: 100 },
    { regex: /job\s+posted[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 100 }
  ];
  
  for (let pattern of postedPatterns) {
    const match = text.match(pattern.regex);
    if (match && match[1]) {
      const matchIndex = match.index;
      const surroundingText = text.substring(Math.max(0, matchIndex - pattern.context), matchIndex + pattern.context);
      // Make sure this isn't near deadline keywords
      if (!surroundingText.match(/deadline|apply\s+by|closing|due\s+date|applications\s+close/i)) {
        // If it's a relative date, convert it
        if (pattern.isRelative) {
          const converted = parseRelativeToDate(match[1].trim());
          if (converted) {
            datePosted = converted;
            break;
          }
        } else {
          datePosted = match[1].trim();
          break;
        }
      }
    }
  }
  
  // Deadline patterns - look for these SECOND
  const deadlinePatterns = [
    { regex: /application\s+deadline[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /deadline\s+to\s+apply[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /apply\s+by[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /closing\s+date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /closing\s+on[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /closes?\s+on[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /closing[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /applications\s+close[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /due\s+date[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /deadline[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /applications\s+accepted\s+until[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    { regex: /submit\s+by[:\s]*([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i, context: 150 },
    // Numeric date formats
    { regex: /closing\s+date[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, context: 150 },
    { regex: /closing\s+on[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, context: 150 },
    { regex: /closing[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, context: 150 },
    { regex: /deadline[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, context: 150 },
    { regex: /apply\s+by[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, context: 150 },
    { regex: /closes[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, context: 150 },
    { regex: /due[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})/i, context: 150 },
    // ISO date formats
    { regex: /closing\s+date[:\s]*(\d{4}-\d{2}-\d{2})/i, context: 150 },
    { regex: /closing\s+on[:\s]*(\d{4}-\d{2}-\d{2})/i, context: 150 },
    { regex: /closing[:\s]*(\d{4}-\d{2}-\d{2})/i, context: 150 },
    { regex: /deadline[:\s]*(\d{4}-\d{2}-\d{2})/i, context: 150 },
    { regex: /apply\s+by[:\s]*(\d{4}-\d{2}-\d{2})/i, context: 150 }
  ];
  
  for (let pattern of deadlinePatterns) {
    const match = text.match(pattern.regex);
    if (match && match[1]) {
      const matchIndex = match.index;
      const surroundingText = text.substring(Math.max(0, matchIndex - pattern.context), matchIndex + pattern.context);
      // Make sure this isn't near "posted" keywords
      if (!surroundingText.match(/posted|published/i)) {
        deadline = match[1].trim();
        break;
      }
    }
  }
  
  // STRATEGY 2: If we still don't have dates, use smart heuristics
  if (!datePosted || !deadline) {
    // Find all dates in the document
    const allDates = [];
    
    // Pattern 1: Month DD, YYYY
    const monthDateMatches = text.matchAll(/\b([A-Z][a-z]+\s+\d{1,2},?\s+\d{4})\b/g);
    for (let match of monthDateMatches) {
      const dateStr = match[0];
      const dateObj = new Date(dateStr);
      if (!isNaN(dateObj.getTime())) {
        const matchIndex = match.index;
        const before = text.substring(Math.max(0, matchIndex - 150), matchIndex).toLowerCase();
        const after = text.substring(matchIndex, Math.min(text.length, matchIndex + 150)).toLowerCase();
        
        allDates.push({
          dateStr,
          dateObj,
          index: matchIndex,
          before,
          after,
          score: 0
        });
      }
    }
    
    // Pattern 2: MM/DD/YYYY
    const slashDateMatches = text.matchAll(/\b(\d{1,2}\/\d{1,2}\/\d{4})\b/g);
    for (let match of slashDateMatches) {
      const dateStr = match[0];
      const dateObj = new Date(dateStr);
      if (!isNaN(dateObj.getTime())) {
        const matchIndex = match.index;
        const before = text.substring(Math.max(0, matchIndex - 150), matchIndex).toLowerCase();
        const after = text.substring(matchIndex, Math.min(text.length, matchIndex + 150)).toLowerCase();
        
        allDates.push({
          dateStr,
          dateObj,
          index: matchIndex,
          before,
          after,
          score: 0
        });
      }
    }
    
    // Pattern 3: YYYY-MM-DD
    const isoDateMatches = text.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g);
    for (let match of isoDateMatches) {
      const dateStr = match[0];
      const dateObj = new Date(dateStr);
      if (!isNaN(dateObj.getTime())) {
        const matchIndex = match.index;
        const before = text.substring(Math.max(0, matchIndex - 150), matchIndex).toLowerCase();
        const after = text.substring(matchIndex, Math.min(text.length, matchIndex + 150)).toLowerCase();
        
        allDates.push({
          dateStr,
          dateObj,
          index: matchIndex,
          before,
          after,
          score: 0
        });
      }
    }
    
    // Score dates based on context
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let dateInfo of allDates) {
      // Check for deadline keywords nearby
      if (dateInfo.before.match(/deadline|apply\s+by|closing|due|submit\s+by|applications?\s+(close|end)|expires?/)) {
        dateInfo.score += 100; // Strong deadline indicator
        dateInfo.type = 'deadline';
      }
      if (dateInfo.after.match(/deadline|to\s+apply|for\s+application/)) {
        dateInfo.score += 80;
        dateInfo.type = 'deadline';
      }
      
      // Check for posted keywords nearby
      if (dateInfo.before.match(/posted|published|listed|advertised/)) {
        dateInfo.score += 100; // Strong posted indicator
        dateInfo.type = 'posted';
      }
      if (dateInfo.after.match(/posted|published/)) {
        dateInfo.score += 50;
        dateInfo.type = 'posted';
      }
      
      // Temporal heuristics
      const daysDiff = Math.ceil((dateInfo.dateObj - today) / (1000 * 60 * 60 * 24));
      
      // If date is in the past, more likely to be posted date
      if (daysDiff < 0 && daysDiff > -60) {
        dateInfo.score += 30;
        if (!dateInfo.type) dateInfo.type = 'posted';
      }
      
      // If date is 1-90 days in future, could be deadline
      if (daysDiff > 0 && daysDiff < 90) {
        dateInfo.score += 20;
        if (!dateInfo.type) dateInfo.type = 'deadline';
      }
      
      // If date is very far in future (>90 days), probably start date (ignore)
      if (daysDiff > 90) {
        dateInfo.score -= 50;
      }
      
      // If date is very old (>60 days ago), probably not relevant
      if (daysDiff < -60) {
        dateInfo.score -= 50;
      }
    }
    
    // Sort by score
    allDates.sort((a, b) => b.score - a.score);
    
    // Assign dates based on type and score
    if (!datePosted) {
      const postedDate = allDates.find(d => d.type === 'posted' && d.score > 0);
      if (postedDate) {
        datePosted = postedDate.dateStr;
      }
    }
    
    if (!deadline) {
      const deadlineDate = allDates.find(d => d.type === 'deadline' && d.score > 0);
      if (deadlineDate) {
        deadline = deadlineDate.dateStr;
      }
    }
    
    // Fallback: if we still don't have both, use temporal logic
    if (!datePosted && !deadline && allDates.length > 0) {
      // Sort by date (oldest to newest)
      const sortedByDate = [...allDates].sort((a, b) => a.dateObj - b.dateObj);
      
      // Past date = posted, future date = deadline
      const pastDates = sortedByDate.filter(d => d.dateObj < today);
      const futureDates = sortedByDate.filter(d => d.dateObj >= today);
      
      if (pastDates.length > 0 && !datePosted) {
        datePosted = pastDates[pastDates.length - 1].dateStr; // Most recent past date
      }
      if (futureDates.length > 0 && !deadline) {
        deadline = futureDates[0].dateStr; // Earliest future date
      }
    }
  }
  
  return { deadline, datePosted };
}

function extractSalary() {
  const text = document.body.textContent;
  const lowerText = text.toLowerCase();
  
  // Strategy: Look for salary patterns and normalize them
  // Supports: USD ($), EUR (€), GBP (£), CAD (C$ or CAD)
  
  const salaryPatterns = [
    // ============================================================
    // USD PATTERNS ($ or USD)
    // ============================================================
    // Range patterns with time periods
    { 
      regex: /(?:USD\s*)?\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–to]\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(hour|hr|hourly)/gi,
      type: 'range', period: 'hourly', currency: '$'
    },
    { 
      regex: /(?:USD\s*)?\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–to]\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(month|monthly|mo)/gi,
      type: 'range', period: 'monthly', currency: '$'
    },
    { 
      regex: /(?:USD\s*)?\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–to]\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(year|annual|yearly|annually)/gi,
      type: 'range', period: 'annual', currency: '$'
    },
    // Compact k format with ranges
    {
      regex: /(?:USD\s*)?\$\s*(\d{1,3})k?\s*[-–to]\s*\$?\s*(\d{1,3})k/gi,
      type: 'range-k', period: 'contextual', currency: '$'
    },
    // Single value with time period
    {
      regex: /(?:USD\s*)?\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(hour|hr|hourly)/gi,
      type: 'single', period: 'hourly', currency: '$'
    },
    {
      regex: /(?:USD\s*)?\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(month|monthly|mo)/gi,
      type: 'single', period: 'monthly', currency: '$'
    },
    {
      regex: /(?:USD\s*)?\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(year|annual|yearly|annually)/gi,
      type: 'single', period: 'annual', currency: '$'
    },
    // Labeled salary with $
    {
      regex: /(?:salary|compensation)(?:\s+range)?[:\s]*\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–]\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
      type: 'labeled-range', period: 'annual', currency: '$'
    },
    {
      regex: /salary[:\s]*\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
      type: 'labeled-single', period: 'annual', currency: '$'
    },
    // Hourly rates with $
    {
      regex: /\$\s*(\d{1,3}(?:\.\d{2})?)\s*[-–to]\s*\$?\s*(\d{1,3}(?:\.\d{2})?)\s*(?:an|per)?\s*(?:hour|hr)/gi,
      type: 'range', period: 'hourly', currency: '$'
    },
    
    // ============================================================
    // EUR PATTERNS (€ or EUR)
    // ============================================================
    // Range with period
    { 
      regex: /(?:EUR\s*)?€\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*[-–to]\s*€?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:per|\/)\s*(hour|hr|hourly)/gi,
      type: 'range', period: 'hourly', currency: '€'
    },
    { 
      regex: /(?:EUR\s*)?€\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*[-–to]\s*€?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:per|\/)\s*(month|monthly|mo)/gi,
      type: 'range', period: 'monthly', currency: '€'
    },
    { 
      regex: /(?:EUR\s*)?€\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*[-–to]\s*€?\s*(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s*(?:per|\/)\s*(year|annual|yearly|annually|annum|p\.?a\.?)/gi,
      type: 'range', period: 'annual', currency: '€'
    },
    // EUR with code prefix (EUR 50,000 - EUR 70,000)
    {
      regex: /EUR\s*(\d{1,3}(?:[.,]\d{3})*)\s*[-–to]\s*(?:EUR\s*)?(\d{1,3}(?:[.,]\d{3})*)\s*(?:per|\/|p\.?a\.?)?\s*(?:year|annual|annum)?/gi,
      type: 'range', period: 'annual', currency: '€'
    },
    // Single EUR value
    {
      regex: /(?:EUR\s*)?€\s*(\d{1,3}(?:[.,]\d{3})*)\s*(?:per|\/)\s*(year|annual|annum|p\.?a\.?)/gi,
      type: 'single', period: 'annual', currency: '€'
    },
    {
      regex: /EUR\s*(\d{1,3}(?:[.,]\d{3})*)\s*(?:per|\/|p\.?a\.?)?\s*(?:year|annual|annum)/gi,
      type: 'single', period: 'annual', currency: '€'
    },
    // Compact k format EUR
    {
      regex: /(?:EUR\s*)?€\s*(\d{1,3})k?\s*[-–to]\s*€?\s*(\d{1,3})k/gi,
      type: 'range-k', period: 'annual', currency: '€'
    },
    
    // ============================================================
    // GBP PATTERNS (£ or GBP)
    // ============================================================
    // Range with period
    { 
      regex: /(?:GBP\s*)?£\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–to]\s*£?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(hour|hr|hourly)/gi,
      type: 'range', period: 'hourly', currency: '£'
    },
    { 
      regex: /(?:GBP\s*)?£\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–to]\s*£?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(month|monthly|mo)/gi,
      type: 'range', period: 'monthly', currency: '£'
    },
    { 
      regex: /(?:GBP\s*)?£\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–to]\s*£?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/|p\.?a\.?)?\s*(?:year|annual|annum)?/gi,
      type: 'range', period: 'annual', currency: '£'
    },
    // GBP with code prefix
    {
      regex: /GBP\s*(\d{1,3}(?:,\d{3})*)\s*[-–to]\s*(?:GBP\s*)?(\d{1,3}(?:,\d{3})*)/gi,
      type: 'range', period: 'annual', currency: '£'
    },
    // Single GBP value
    {
      regex: /(?:GBP\s*)?£\s*(\d{1,3}(?:,\d{3})*)\s*(?:per|\/|p\.?a\.?)?\s*(?:year|annual|annum)/gi,
      type: 'single', period: 'annual', currency: '£'
    },
    // Compact k format GBP
    {
      regex: /(?:GBP\s*)?£\s*(\d{1,3})k?\s*[-–to]\s*£?\s*(\d{1,3})k/gi,
      type: 'range-k', period: 'annual', currency: '£'
    },
    
    // ============================================================
    // CAD PATTERNS (C$ or CAD or CA$)
    // ============================================================
    // Range with period - CAD explicit
    { 
      regex: /(?:CAD|CA?\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–to]\s*(?:CAD|CA?\$)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(hour|hr|hourly)/gi,
      type: 'range', period: 'hourly', currency: 'C$'
    },
    { 
      regex: /(?:CAD|CA?\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–to]\s*(?:CAD|CA?\$)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/)\s*(month|monthly|mo)/gi,
      type: 'range', period: 'monthly', currency: 'C$'
    },
    { 
      regex: /(?:CAD|CA?\$)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*[-–to]\s*(?:CAD|CA?\$)?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:per|\/|p\.?a\.?)?\s*(?:year|annual|annum)?/gi,
      type: 'range', period: 'annual', currency: 'C$'
    },
    // Single CAD value
    {
      regex: /(?:CAD|CA?\$)\s*(\d{1,3}(?:,\d{3})*)\s*(?:per|\/|p\.?a\.?)?\s*(?:year|annual|annum)?/gi,
      type: 'single', period: 'annual', currency: 'C$'
    },
    // Compact k format CAD
    {
      regex: /(?:CAD|CA?\$)\s*(\d{1,3})k?\s*[-–to]\s*(?:CAD|CA?\$)?\s*(\d{1,3})k/gi,
      type: 'range-k', period: 'annual', currency: 'C$'
    },
    
    // ============================================================
    // GENERIC LABELED PATTERNS (no currency symbol - assume USD)
    // ============================================================
    // Hourly labeled
    {
      regex: /(?:hourly\s*(?:rate|wage|pay|compensation)|rate\s*per\s*hour)[:\s]+(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:[-–to]\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?))?/gi,
      type: 'labeled-no-symbol', period: 'hourly', currency: '$'
    },
    // Monthly labeled
    {
      regex: /(?:monthly\s*(?:salary|wage|pay|compensation)|(?:salary|pay)\s*per\s*month)[:\s]+(\d{1,3}(?:,\d{3})+)\s*(?:[-–to]\s*(\d{1,3}(?:,\d{3})+))?/gi,
      type: 'labeled-no-symbol', period: 'monthly', currency: '$'
    },
    // Annual labeled
    {
      regex: /(?:annual\s*(?:salary|compensation|pay)|yearly\s*(?:salary|pay))[:\s]+(\d{1,3}(?:,\d{3})+)\s*(?:[-–to]\s*(\d{1,3}(?:,\d{3})+))?/gi,
      type: 'labeled-no-symbol', period: 'annual', currency: '$'
    },
    // Generic "Salary:" or "Compensation:" (assume annual, USD)
    {
      regex: /(?:salary|compensation)[:\s]+(\d{1,3}(?:,\d{3})+)\s*(?:[-–to]\s*(\d{1,3}(?:,\d{3})+))?/gi,
      type: 'labeled-no-symbol', period: 'annual', currency: '$'
    }
  ];
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (let pattern of salaryPatterns) {
    pattern.regex.lastIndex = 0; // Reset regex
    const match = pattern.regex.exec(text);
    
    if (match) {
      const matchIndex = match.index;
      const surroundingText = text.substring(Math.max(0, matchIndex - 100), Math.min(text.length, matchIndex + 100)).toLowerCase();
      
      // Score this match
      let score = 10; // Base score
      
      // Bonus points for being near salary keywords
      if (surroundingText.match(/salary|compensation|pay|wage|rate|earning|remuneration/)) {
        score += 50;
      }
      
      // Bonus for being near job/position keywords
      if (surroundingText.match(/position|job|role|opening/)) {
        score += 20;
      }
      
      // Penalty if near "requirement" or "experience" (might be experience years, not salary)
      if (surroundingText.match(/requirement|experience|year|must have/)) {
        score -= 30;
      }
      
      // Bonus for explicit currency codes (more reliable)
      if (match[0].match(/USD|EUR|GBP|CAD/i)) {
        score += 15;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = { match, pattern, surroundingText };
      }
    }
  }
  
  if (!bestMatch || bestScore < 10) {
    return ''; // No good salary found
  }
  
  const { match, pattern, surroundingText } = bestMatch;
  const currencySymbol = pattern.currency;
  
  // If period is contextual, detect from surrounding text
  let detectedPeriod = pattern.period;
  if (pattern.period === 'contextual') {
    if (surroundingText.match(/\/(hour|hr)|per\s*hour|hourly/i)) {
      detectedPeriod = 'hourly';
    } else if (surroundingText.match(/\/(month|mo)|per\s*month|monthly/i)) {
      detectedPeriod = 'monthly';
    } else {
      detectedPeriod = 'annual'; // Default for k-format
    }
  }
  
  // Helper to normalize European number format (1.000,50 -> 1000.50)
  const normalizeNumber = (numStr) => {
    if (!numStr) return '';
    // If it has both . and , we need to figure out which is thousands separator
    // European: 1.000,50 (dot for thousands, comma for decimal)
    // US: 1,000.50 (comma for thousands, dot for decimal)
    if (numStr.includes('.') && numStr.includes(',')) {
      // Check position - last separator is decimal
      const lastDot = numStr.lastIndexOf('.');
      const lastComma = numStr.lastIndexOf(',');
      if (lastComma > lastDot) {
        // European format: 1.000,50
        return numStr.replace(/\./g, '').replace(',', '.');
      } else {
        // US format: 1,000.50
        return numStr.replace(/,/g, '');
      }
    }
    // Only commas - assume thousands separator
    if (numStr.includes(',') && !numStr.includes('.')) {
      return numStr.replace(/,/g, '');
    }
    // Only dots - could be thousands (1.000) or decimal (1.50)
    if (numStr.includes('.') && !numStr.includes(',')) {
      // If 3 digits after dot, it's thousands separator
      if (numStr.match(/\.\d{3}$/)) {
        return numStr.replace(/\./g, '');
      }
    }
    return numStr.replace(/,/g, '');
  };
  
  // Format the salary based on type
  let salaryText = '';
  
  if (pattern.type === 'range' || pattern.type === 'labeled-range') {
    const min = normalizeNumber(match[1]);
    const max = normalizeNumber(match[2]);
    salaryText = `${currencySymbol}${formatNumber(min)} - ${currencySymbol}${formatNumber(max)}`;
  } else if (pattern.type === 'range-k') {
    const min = parseInt(match[1]) * 1000;
    const max = parseInt(match[2]) * 1000;
    salaryText = `${currencySymbol}${formatNumber(min)} - ${currencySymbol}${formatNumber(max)}`;
  } else if (pattern.type === 'single' || pattern.type === 'labeled-single') {
    const amount = normalizeNumber(match[1]);
    salaryText = `${currencySymbol}${formatNumber(amount)}`;
  } else if (pattern.type === 'labeled-no-symbol') {
    if (match[2]) {
      const min = normalizeNumber(match[1]);
      const max = normalizeNumber(match[2]);
      salaryText = `${currencySymbol}${formatNumber(min)} - ${currencySymbol}${formatNumber(max)}`;
    } else {
      const amount = normalizeNumber(match[1]);
      salaryText = `${currencySymbol}${formatNumber(amount)}`;
    }
  }
  
  // Add period label
  if (detectedPeriod === 'hourly') {
    salaryText += '/hr';
  } else if (detectedPeriod === 'monthly') {
    salaryText += '/mo';
  } else if (detectedPeriod === 'annual') {
    salaryText += '/yr';
  }
  
  // Sanity check length
  if (salaryText.length > 50) {
    return '';
  }
  
  return salaryText;
}

// Helper function to format numbers with commas
function formatNumber(numStr) {
  const num = parseFloat(numStr);
  if (isNaN(num)) return numStr;
  
  // If it's a decimal hourly rate, keep decimals
  if (num < 1000 && numStr.includes('.')) {
    return num.toFixed(2);
  }
  
  // Otherwise format with commas
  return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
