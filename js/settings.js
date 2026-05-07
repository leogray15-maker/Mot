/* ===========================
   Premier MOT — Extended Settings
   =========================== */

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const DAY_LABELS = { monday:'Mon',tuesday:'Tue',wednesday:'Wed',thursday:'Thu',friday:'Fri',saturday:'Sat',sunday:'Sun' };

function getDefaultSettings() {
  return {
    garageName: 'Premier MOT & Service', phone: '01234 567890',
    email: 'info@premiermot.co.uk', address: '14 Industrial Way, Chelmsford, Essex, CM1 2AB',
    googleReviewLink: '', siteURL: 'https://mot-ruby.vercel.app',
    whatsappTemplate: 'Hi [FirstName], just a reminder that your MOT is due on [MOTDueDate] for your [Year] [Make] [Model] ([Reg]). You can book online at [SiteURL] or call us on [PhoneNumber]. See you soon — [GarageName]',
    reviewTemplate: 'Hi [FirstName], thanks for visiting [GarageName] today! If you\'re happy with the service, we\'d really appreciate a Google review — it takes just 30 seconds: [GoogleReviewLink]\nThanks again — [GarageName]',
    bankDetails: '', vatRegistered: false, vatNumber: '', labourRate: 65,
    reminderDays: [7, 14, 30], maxBookingsPerSlot: 2, blockedDates: [],
    workingHours: {
      monday:{open:true,start:'08:00',end:'18:00'}, tuesday:{open:true,start:'08:00',end:'18:00'},
      wednesday:{open:true,start:'08:00',end:'18:00'}, thursday:{open:true,start:'08:00',end:'18:00'},
      friday:{open:true,start:'08:00',end:'18:00'}, saturday:{open:true,start:'08:00',end:'17:00'},
      sunday:{open:false,start:'09:00',end:'13:00'}
    }
  };
}

// Extend getSettings to include new defaults (merges with stored)
const _origGetSettings = window.getSettings || function() { return JSON.parse(localStorage.getItem('premier_settings') || '{}'); };
window.getSettings = function() {
  const defaults = getDefaultSettings();
  const stored = JSON.parse(localStorage.getItem('premier_settings') || '{}');
  const merged = Object.assign({}, defaults, stored);
  if (stored.workingHours) {
    merged.workingHours = Object.assign({}, defaults.workingHours, stored.workingHours);
  }
  if (!merged.reminderDays || !Array.isArray(merged.reminderDays)) merged.reminderDays = defaults.reminderDays;
  if (!merged.blockedDates || !Array.isArray(merged.blockedDates)) merged.blockedDates = [];
  return merged;
};

function loadExtendedSettings() {
  const s = window.getSettings();

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
    window.saveSettings(s);
  }
  input.value = '';
  renderBlockedDates();
}

function removeBlockedDate(date) {
  const s = window.getSettings();
  s.blockedDates = (s.blockedDates || []).filter(d => d !== date);
  window.saveSettings(s);
  renderBlockedDates();
}

function saveExtendedSettings() {
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

  window.saveSettings(s);
  showToast('Settings saved', 'success');
}

// Hook into navigate for settings section
document.addEventListener('DOMContentLoaded', () => {
  // Extend navigate to also call loadExtendedSettings when on settings page
  if (typeof window.sectionLoaders !== 'undefined') {
    const origSettingsLoader = window.sectionLoaders['settings'];
    window.sectionLoaders['settings'] = function() {
      if (origSettingsLoader) origSettingsLoader();
      loadExtendedSettings();
    };
  }

  // VAT toggle listener
  document.getElementById('settingVAT')?.addEventListener('change', toggleVATNumber);

  // Working hours toggle listeners
  DAYS.forEach(day => {
    document.getElementById(`wh_open_${day}`)?.addEventListener('change', () => updateDayRowState(day));
  });

  // Extended settings form
  document.getElementById('settingsExtendedForm')?.addEventListener('submit', e => {
    e.preventDefault();
    saveExtendedSettings();
  });

  // Working hours form
  document.getElementById('settingsHoursForm')?.addEventListener('submit', e => {
    e.preventDefault();
    saveExtendedSettings();
    showToast('Working hours saved', 'success');
  });

  // Blocked dates
  document.getElementById('addBlockedDateBtn')?.addEventListener('click', addBlockedDate);
  document.getElementById('newBlockedDate')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); addBlockedDate(); }
  });
});
