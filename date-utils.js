/**
 * Simple Job Capture - Job Application Tracker
 * Copyright (c) 2026 Tamar Hayrikyan
 * Licensed under the MIT License. See LICENSE for details.
 *
 * Date parsing and formatting utilities.
 */

function parseFlexibleDate(input, fieldType) {
  if (!input || !input.trim()) return '';
  
  const cleaned = input.trim();
  
  // Already in a good format, return as-is
  if (cleaned.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
    return cleaned;
  }
  
  // Try to parse various formats
  let date;
  const today = new Date();
  const currentYear = today.getFullYear();
  
  // Format: "January 25, 2026" or "Jan 25, 2026"
  if (cleaned.match(/^[A-Za-z]+\s+\d{1,2},?\s+\d{4}$/)) {
    date = new Date(cleaned);
  }
  // Format: "2026-01-25" (ISO)
  else if (cleaned.match(/^\d{4}-\d{2}-\d{2}$/)) {
    date = new Date(cleaned);
  }
  // Format: "25 January 2026" or "25 Jan 2026"
  else if (cleaned.match(/^\d{1,2}\s+[A-Za-z]+\s+\d{4}$/)) {
    const parts = cleaned.split(/\s+/);
    date = new Date(`${parts[1]} ${parts[0]}, ${parts[2]}`);
  }
  // Format: "1/25/26" (2-digit year)
  else if (cleaned.match(/^\d{1,2}\/\d{1,2}\/\d{2}$/)) {
    const parts = cleaned.split('/');
    const year = parseInt(parts[2]) + 2000;
    date = new Date(`${parts[0]}/${parts[1]}/${year}`);
  }
  // Format: "30 Jan" or "30 January" (day first, NO YEAR - needs smart logic)
  else if (cleaned.match(/^\d{1,2}\s+[A-Za-z]+$/)) {
    // Reorder to "Jan 30" format for parsing
    const parts = cleaned.split(/\s+/);
    const reordered = `${parts[1]} ${parts[0]}`;
    
    // Parse with current year first
    let testDate = new Date(`${reordered}, ${currentYear}`);
    
    // Smart year selection based on field type and date position
    if (fieldType === 'deadline') {
      // Deadlines should be in the future
      if (testDate < today) {
        date = new Date(`${reordered}, ${currentYear + 1}`);
      } else {
        date = testDate;
      }
    } else if (fieldType === 'datePosted') {
      // Posted dates should be in the past
      if (testDate > today) {
        date = new Date(`${reordered}, ${currentYear - 1}`);
      } else {
        date = testDate;
      }
    } else {
      // For dateApplied or unknown fields, assume current year
      date = testDate;
    }
  }
  // Format: "Jan 25" or "January 25" (NO YEAR - needs smart logic)
  else if (cleaned.match(/^[A-Za-z]+\s+\d{1,2}$/)) {
    // Parse with current year first
    let testDate = new Date(`${cleaned}, ${currentYear}`);
    
    // Smart year selection based on field type and date position
    if (fieldType === 'deadline') {
      // Deadlines should be in the future
      if (testDate < today) {
        // If parsed date is in the past, use next year
        date = new Date(`${cleaned}, ${currentYear + 1}`);
      } else {
        date = testDate;
      }
    } else if (fieldType === 'datePosted') {
      // Posted dates should be in the past (within last year)
      if (testDate > today) {
        // If parsed date is in the future, use previous year
        date = new Date(`${cleaned}, ${currentYear - 1}`);
      } else {
        date = testDate;
      }
    } else {
      // For dateApplied or unknown fields, use general logic
      // Prefer current year, but adjust if date is very far in future (>6 months)
      const sixMonthsFromNow = new Date(today);
      sixMonthsFromNow.setMonth(sixMonthsFromNow.getMonth() + 6);
      
      if (testDate > sixMonthsFromNow) {
        // More than 6 months away = probably meant last year
        date = new Date(`${cleaned}, ${currentYear - 1}`);
      } else if (testDate < today) {
        // In the past = could be this year or last year
        // If less than 6 months ago, use current year; otherwise last year
        const sixMonthsAgo = new Date(today);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        
        if (testDate >= sixMonthsAgo) {
          date = testDate; // Recent past, current year
        } else {
          date = new Date(`${cleaned}, ${currentYear - 1}`); // Older past, last year
        }
      } else {
        date = testDate; // Near future, current year
      }
    }
  }
  // Format: "25/1/2026" or "25/01/2026" (day-first format)
  else if (cleaned.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/) && parseInt(cleaned.split('/')[0]) > 12) {
    const parts = cleaned.split('/');
    date = new Date(`${parts[1]}/${parts[0]}/${parts[2]}`);
  }
  // Relative dates like "tomorrow", "next week"
  else if (cleaned.toLowerCase() === 'tomorrow') {
    date = new Date();
    date.setDate(date.getDate() + 1);
  }
  else if (cleaned.toLowerCase() === 'next week') {
    date = new Date();
    date.setDate(date.getDate() + 7);
  }
  else if (cleaned.toLowerCase() === 'next month') {
    date = new Date();
    date.setMonth(date.getMonth() + 1);
  }
  // Try generic Date parsing as last resort
  else {
    date = new Date(cleaned);
  }
  
  // If we successfully parsed a date, format it consistently
  if (date && !isNaN(date.getTime())) {
    // Return in MM/DD/YYYY format
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${month}/${day}/${year}`;
  }
  
  // If all parsing failed, return original input
  return cleaned;
}

// Format date for display (convert MM/DD/YYYY to more readable format)
function formatDateForDisplay(dateString) {
  if (!dateString || !dateString.trim()) return '';
  
  const match = dateString.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return dateString; // Return as-is if not in expected format
  
  const date = new Date(parseInt(match[3]), parseInt(match[1]) - 1, parseInt(match[2]));
  
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Calculate days until deadline
function getDaysUntilDeadline(deadlineString) {
  if (!deadlineString || !deadlineString.trim()) return null;
  
  const deadline = new Date(deadlineString);
  if (isNaN(deadline.getTime())) return null;
  
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);
  
  const diffTime = deadline - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}
