/* ===========================
   MOT Car Repairs — Extended Settings
   =========================== */

import { showToast, formatDate } from './utils.js';

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_LABELS = { monday:'Mon',tuesday:'Tue',wednesday:'Wed',thursday:'Thu',friday:'Fri',saturday:'Sat',sunday:'Sun' };


function loadExtendedSettings() {
  const s = window.getSettings();

  // General / garage details
  const gn = document.getElementById('settingGarageName'); if (gn) gn.value = s.garageName || '';
  const ph = document.getElementById('settingPhone');      if (ph) ph.value = s.phone      || '';
  const em = document.getElementById('settingEmail');      if (em) em.value = s.email      || '';
  const ad = document.getElementById('settingAddress');    if (ad) ad.value = s.address    || '';
  const dk = document.getElementById('settingDvlaKey');    if (dk) dk.value = s.dvlaApiKey || '';

  // WhatsApp template
  const waTpl = document.getElementById('settingWATemplate');
  if (waTpl) waTpl.value = s.whatsappTemplate || '';

  // Review template
  const rvTpl = document.getElementById('settingReviewTemplate');
  if (rvTpl) rvTpl.value = s.reviewTemplate || '';

  // Google review link
  const grLink = document.getElementById('settingGoogleLink');
  if (grLink) grLink.value = s.googleReviewLink || '';

  // Site URL
  const siteUrl = document.getElementById('settingSiteURL');
  if (siteUrl) siteUrl.value = s.siteURL || '';

  // Bank details
  const bank = document.getElementById('settingBankDetails');
  if (bank) bank.value = s.bankDetails || '';

  // VAT
  const vatToggle = document.getElementById('settingVAT');
  if (vatToggle) vatToggle.checked = !!s.vatRegistered;
  const vatNum = document.getElementById('settingVATNumber');
  if (vatNum) vatNum.value = s.vatNumber || '';
  toggleVATNumber();

  // Labour rate
  const labour = document.getElementById('settingLabourRate');
  if (labour) labour.value = s.labourRate || 65;

  // Max bookings per slot
  const maxSlot = document.getElementById('settingMaxSlots');
  if (maxSlot) maxSlot.value = s.maxBookingsPerSlot || 2;

  // Reminder days checkboxes
  [7, 14, 30].forEach(d => {
    const cb = document.getElementById(`reminderDay${d}`);
    if (cb) cb.checked = (s.reminderDays || []).includes(d);
  });

  // Working hours
  DAYS.forEach(day => {
    const wh = s.workingHours[day] || {};
    const openCb = document.getElementById(`wh_open_${day}`);
    const startIn = document.getElementById(`wh_start_${day}`);
    const endIn = document.getElementById(`wh_end_${day}`);
    if (openCb) openCb.checked = !!wh.open;
    if (startIn) startIn.value = wh.start || '08:00';
    if (endIn) endIn.value = wh.end || '18:00';
    updateDayRowState(day);
  });

  // Blocked dates
  renderBlockedDates();
}

function toggleVATNumber() {
  const vatToggle = document.getElementById('settingVAT');
  const vatNumRow = document.getElementById('vatNumberRow');
  if (!vatToggle || !vatNumRow) return;
  vatNumRow.style.display = vatToggle.checked ? '' : 'none';
}

function updateDayRowState(day) {
  const openCb = document.getElementById(`wh_open_${day}`);
  const startIn = document.getElementById(`wh_start_${day}`);
  const endIn = document.getElementById(`wh_end_${day}`);
  if (!openCb) return;
  const isOpen = openCb.checked;
  if (startIn) startIn.disabled = !isOpen;
  if (endIn) endIn.disabled = !isOpen;
  const row = openCb.closest('.wh-row');
  if (row) row.classList.toggle('wh-closed', !isOpen);
}

function renderBlockedDates() {
  const s = window.getSettings();
  const container = document.getElementById('blockedDatesList');
  if (!container) return;
  const dates = (s.blockedDates || []).sort();
  if (dates.length === 0) {
    container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-dim);font-style:italic">No dates blocked.</p>';
    return;
  }
  container.innerHTML = dates.map(d => `
    <div class="blocked-date-tag">
      <span>${formatDate(d)}</span>
      <button onclick="removeBlockedDate('${d}')" class="remove-date"><i class="fas fa-times"></i></button>
    </div>`).join('');
}

function addBlockedDate() {
  const input = document.getElementById('newBlockedDate');
  if (!input || !input.value) return;
  const s = window.getSettings();
  if (!(s.blockedDates || []).includes(input.value)) {
    s.blockedDates = [...(s.blockedDates || []), input.value];
    window._settings = s;
    window.saveSettings(s).catch(() => {});
  }
  input.value = '';
  renderBlockedDates();
}

function removeBlockedDate(date) {
  const s = window.getSettings();
  s.blockedDates = (s.blockedDates || []).filter(d => d !== date);
  window._settings = s;
  window.saveSettings(s).catch(() => {});
  renderBlockedDates();
}

async function saveExtendedSettings() {
  const s = window.getSettings();

  s.whatsappTemplate = document.getElementById('settingWATemplate')?.value || s.whatsappTemplate;
  s.reviewTemplate = document.getElementById('settingReviewTemplate')?.value || s.reviewTemplate;
  s.googleReviewLink = document.getElementById('settingGoogleLink')?.value || '';
  s.siteURL = document.getElementById('settingSiteURL')?.value || '';
  s.bankDetails = document.getElementById('settingBankDetails')?.value || '';
  s.vatRegistered = !!document.getElementById('settingVAT')?.checked;
  s.vatNumber = document.getElementById('settingVATNumber')?.value || '';
  s.labourRate = parseFloat(document.getElementById('settingLabourRate')?.value) || 65;
  s.maxBookingsPerSlot = parseInt(document.getElementById('settingMaxSlots')?.value) || 2;

  s.reminderDays = [7, 14, 30].filter(d => document.getElementById(`reminderDay${d}`)?.checked);

  const wh = {};
  DAYS.forEach(day => {
    wh[day] = {
      open: !!document.getElementById(`wh_open_${day}`)?.checked,
      start: document.getElementById(`wh_start_${day}`)?.value || '08:00',
      end: document.getElementById(`wh_end_${day}`)?.value || '18:00'
    };
  });
  s.workingHours = wh;

  try {
    await window.saveSettings(s);
    showToast('Settings saved', 'success');
  } catch (e) {
    showToast('Failed to save settings', 'error');
  }
}

// ——— Settings module initialisation (runs when lazily loaded) ———
// DOMContentLoaded has already fired by the time this module is imported,
// so all setup runs immediately and also self-registers the section loader.

function initSettingsModule() {
  // Register the section loader override
  if (typeof window.sectionLoaders !== 'undefined') {
    const orig = window.sectionLoaders['settings'];
    window.sectionLoaders['settings'] = function() {
      if (orig) orig();
      loadExtendedSettings();
    };
  }

  // VAT toggle listener
  document.getElementById('settingVAT')?.addEventListener('change', toggleVATNumber);

  // Working hours toggle listeners
  DAYS.forEach(day => {
    document.getElementById(`wh_open_${day}`)?.addEventListener('change', () => updateDayRowState(day));
  });

  // Working hours form
  document.getElementById('settingsHoursForm')?.addEventListener('submit', e => {
    e.preventDefault();
    saveExtendedSettings();
  });

  // Blocked dates
  document.getElementById('addBlockedDateBtn')?.addEventListener('click', addBlockedDate);
  document.getElementById('newBlockedDate')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); addBlockedDate(); }
  });

  // Run immediately since we're already on the settings page when loaded
  loadExtendedSettings();
}

// Run either immediately (DOM ready) or after DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSettingsModule);
} else {
  initSettingsModule();
}

Object.assign(window, {
  addBlockedDate, removeBlockedDate, toggleVATNumber,
  updateDayRowState, renderBlockedDates, saveExtendedSettings
});
