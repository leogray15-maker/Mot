/* ===========================
   Premier MOT — Extended Settings
   =========================== */

const DAYS = ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];

function formatDate(d) {
  if (!d) return '—';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
  catch { return d; }
}

function showToast(msg, type = 'info') {
  if (window.addNotification) { window.addNotification(msg, type); return; }
  console.log(`[settings] ${type}: ${msg}`);
}

// ── Tab switching ────────────────────────────────────────────────────────────

function initSettingsTabs() {
  const tabBar = document.getElementById('settingsTabBar');
  if (!tabBar || tabBar.dataset.settingsTabsInit) return;
  tabBar.dataset.settingsTabsInit = '1';

  tabBar.addEventListener('click', e => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    const tab = btn.dataset.tab;
    tabBar.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('#page-settings .settings-tab-panel').forEach(p =>
      p.classList.toggle('active', p.dataset.panel === tab)
    );
  });
}

// ── Load settings into form fields ──────────────────────────────────────────

function loadExtendedSettings() {
  const s = window.getSettings?.() || window._settings || {};

  // General
  setVal('settingGarageName', s.garageName);
  setVal('settingPhone',      s.phone);
  setVal('settingEmail',      s.email);
  setVal('settingAddress',    s.address);

  // Branding
  setVal('settingLogoUrl', s.logoUrl);
  setVal('settingSiteURL', s.siteURL);

  // Notifications
  setVal('settingWATemplate',     s.whatsappTemplate);
  setVal('settingReviewTemplate', s.reviewTemplate);
  setVal('settingGoogleLink',     s.googleReviewLink);
  [7, 14, 30].forEach(d => {
    const cb = document.getElementById(`reminderDay${d}`);
    if (cb) cb.checked = (s.reminderDays || []).includes(d);
  });

  // Booking / hours
  setVal('settingMaxSlots', s.maxBookingsPerSlot ?? 2);
  const wh = s.workingHours || {};
  DAYS.forEach(day => {
    const d   = wh[day] || {};
    const isOpen = d.open !== false && !d.closed;
    const openCb  = document.getElementById(`wh_open_${day}`);
    const startIn = document.getElementById(`wh_start_${day}`);
    const endIn   = document.getElementById(`wh_end_${day}`);
    if (openCb)  openCb.checked  = isOpen;
    if (startIn) startIn.value   = d.start || d.open || '08:00';
    if (endIn)   endIn.value     = d.end   || d.close || '18:00';
    updateDayRowState(day);
  });
  renderBlockedDates();

  // Financial
  setVal('settingLabourRate',  s.labourRate ?? 65);
  setVal('settingBankDetails', s.bankDetails);
  const vatCb = document.getElementById('settingVAT');
  if (vatCb) vatCb.checked = !!s.vatRegistered;
  setVal('settingVATNumber', s.vatNumber);
  toggleVATNumber();

  // API keys (stored obfuscated — just show placeholder if set)
  const dvlaField = document.getElementById('settingDvlaApiKey');
  if (dvlaField) dvlaField.placeholder = s.dvlaApiKey ? '••••••••' : 'Your DVLA API key';
  const waField = document.getElementById('settingWaApiKey');
  if (waField) waField.placeholder = s.waApiKey ? '••••••••' : 'e.g. Twilio or Wati API key';

  // Subscription
  const planLabel = document.getElementById('currentPlanLabel');
  if (planLabel) {
    const plan = sessionStorage.getItem('plan') || 'enterprise';
    planLabel.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
  }
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val !== undefined && val !== null) el.value = val;
}

// ── Toggle helpers ───────────────────────────────────────────────────────────

function toggleVATNumber() {
  const vatToggle = document.getElementById('settingVAT');
  const vatNumRow = document.getElementById('vatNumberRow');
  if (!vatToggle || !vatNumRow) return;
  vatNumRow.style.display = vatToggle.checked ? '' : 'none';
}

function updateDayRowState(day) {
  const openCb  = document.getElementById(`wh_open_${day}`);
  const startIn = document.getElementById(`wh_start_${day}`);
  const endIn   = document.getElementById(`wh_end_${day}`);
  if (!openCb) return;
  const isOpen = openCb.checked;
  if (startIn) startIn.disabled = !isOpen;
  if (endIn)   endIn.disabled   = !isOpen;
  openCb.closest('.wh-row')?.classList.toggle('wh-closed', !isOpen);
}

// ── Blocked dates ────────────────────────────────────────────────────────────

function renderBlockedDates() {
  const s   = window.getSettings?.() || window._settings || {};
  const el  = document.getElementById('blockedDatesList');
  if (!el) return;
  const dates = (s.blockedDates || []).sort();
  if (!dates.length) {
    el.innerHTML = '<span style="font-size:0.82rem;color:var(--text-dim);font-style:italic">No dates blocked.</span>';
    return;
  }
  el.innerHTML = dates.map(d => `
    <span class="blocked-date-tag" style="display:inline-flex;align-items:center;gap:4px;background:rgba(224,32,32,0.1);border:1px solid rgba(224,32,32,0.3);border-radius:4px;padding:3px 8px;font-size:0.8rem">
      ${formatDate(d)}
      <button onclick="window.removeBlockedDate('${d}')" style="background:none;border:none;cursor:pointer;color:var(--red);padding:0 2px" title="Remove"><i class="fas fa-times"></i></button>
    </span>`).join('');
}

function addBlockedDate() {
  const input = document.getElementById('newBlockedDate');
  if (!input?.value) return;
  const s = window.getSettings?.() || window._settings || {};
  if (!(s.blockedDates || []).includes(input.value)) {
    s.blockedDates = [...(s.blockedDates || []), input.value];
    window._settings = s;
    window.saveSettings?.(s).catch(() => {});
  }
  input.value = '';
  renderBlockedDates();
}

function removeBlockedDate(date) {
  const s = window.getSettings?.() || window._settings || {};
  s.blockedDates = (s.blockedDates || []).filter(d => d !== date);
  window._settings = s;
  window.saveSettings?.(s).catch(() => {});
  renderBlockedDates();
}

// ── Save functions ───────────────────────────────────────────────────────────

async function saveGeneralSettings() {
  const s = window.getSettings?.() || window._settings || {};
  s.garageName = document.getElementById('settingGarageName')?.value || s.garageName;
  s.phone      = document.getElementById('settingPhone')?.value      || s.phone;
  s.email      = document.getElementById('settingEmail')?.value      || s.email;
  s.address    = document.getElementById('settingAddress')?.value    || s.address;
  try { await window.saveSettings?.(s); showToast('General settings saved', 'success'); }
  catch { showToast('Failed to save', 'error'); }
}

async function saveBrandingSettings() {
  const s = window.getSettings?.() || window._settings || {};
  s.logoUrl = document.getElementById('settingLogoUrl')?.value || '';
  s.siteURL = document.getElementById('settingSiteURL')?.value || '';
  try { await window.saveSettings?.(s); showToast('Branding saved', 'success'); }
  catch { showToast('Failed to save', 'error'); }
}

async function saveExtendedSettings() {
  const s = window.getSettings?.() || window._settings || {};

  s.whatsappTemplate = document.getElementById('settingWATemplate')?.value     ?? s.whatsappTemplate;
  s.reviewTemplate   = document.getElementById('settingReviewTemplate')?.value ?? s.reviewTemplate;
  s.googleReviewLink = document.getElementById('settingGoogleLink')?.value     || '';
  s.bankDetails      = document.getElementById('settingBankDetails')?.value    || '';
  s.vatRegistered    = !!document.getElementById('settingVAT')?.checked;
  s.vatNumber        = document.getElementById('settingVATNumber')?.value      || '';
  s.labourRate       = parseFloat(document.getElementById('settingLabourRate')?.value) || 65;
  s.maxBookingsPerSlot = parseInt(document.getElementById('settingMaxSlots')?.value)  || 2;
  s.reminderDays     = [7, 14, 30].filter(d => document.getElementById(`reminderDay${d}`)?.checked);

  const wh = {};
  DAYS.forEach(day => {
    wh[day] = {
      open:  !!document.getElementById(`wh_open_${day}`)?.checked,
      start: document.getElementById(`wh_start_${day}`)?.value || '08:00',
      end:   document.getElementById(`wh_end_${day}`)?.value   || '18:00',
    };
  });
  s.workingHours = wh;

  try { await window.saveSettings?.(s); showToast('Settings saved', 'success'); }
  catch { showToast('Failed to save settings', 'error'); }
}

async function saveApiKeys() {
  const s = window.getSettings?.() || window._settings || {};
  const dvla = document.getElementById('settingDvlaApiKey')?.value;
  const wa   = document.getElementById('settingWaApiKey')?.value;
  if (dvla) s.dvlaApiKey = dvla;
  if (wa)   s.waApiKey   = wa;
  try {
    await window.saveSettings?.(s);
    showToast('API keys saved', 'success');
    // Clear fields so keys aren't left in DOM
    if (dvla && document.getElementById('settingDvlaApiKey')) document.getElementById('settingDvlaApiKey').value = '';
    if (wa   && document.getElementById('settingWaApiKey'))   document.getElementById('settingWaApiKey').value   = '';
    loadExtendedSettings();
  } catch { showToast('Failed to save API keys', 'error'); }
}

// ── Wire up listeners (safe to call multiple times) ──────────────────────────

let _listenersAttached = false;
function attachSettingsListeners() {
  if (_listenersAttached) return;
  _listenersAttached = true;

  document.getElementById('settingVAT')?.addEventListener('change', toggleVATNumber);

  DAYS.forEach(day =>
    document.getElementById(`wh_open_${day}`)?.addEventListener('change', () => updateDayRowState(day))
  );

  document.getElementById('settingsGeneralForm')?.addEventListener('submit', e => {
    e.preventDefault(); saveGeneralSettings();
  });

  document.getElementById('settingsExtendedForm')?.addEventListener('submit', e => {
    e.preventDefault(); saveExtendedSettings();
  });

  document.getElementById('settingsHoursForm')?.addEventListener('submit', e => {
    e.preventDefault(); saveExtendedSettings();
  });

  document.getElementById('addBlockedDateBtn')?.addEventListener('click', addBlockedDate);
  document.getElementById('newBlockedDate')?.addEventListener('keypress', e => {
    if (e.key === 'Enter') { e.preventDefault(); addBlockedDate(); }
  });
}

// ── Section loader integration ───────────────────────────────────────────────

function initSettingsSection() {
  initSettingsTabs();
  attachSettingsListeners();
  loadExtendedSettings();
}

// Override sectionLoaders.settings so the section loads our init
if (window.sectionLoaders) {
  const orig = window.sectionLoaders['settings'];
  window.sectionLoaders['settings'] = () => {
    if (orig) orig();
    initSettingsSection();
  };
} else {
  // Fallback: wait for sectionLoaders to be set
  const iv = setInterval(() => {
    if (window.sectionLoaders) {
      clearInterval(iv);
      const orig = window.sectionLoaders['settings'];
      window.sectionLoaders['settings'] = () => {
        if (orig) orig();
        initSettingsSection();
      };
    }
  }, 50);
}

// Also run immediately if settings section is already visible
if (document.getElementById('page-settings')?.classList.contains('active')) {
  initSettingsSection();
}

Object.assign(window, {
  addBlockedDate, removeBlockedDate, toggleVATNumber,
  updateDayRowState, renderBlockedDates, saveExtendedSettings,
  saveBrandingSettings, saveApiKeys,
});
