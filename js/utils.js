/* ===========================
   GarageOS — Shared Utilities
   =========================== */

// ——— Toast notifications ———
// Stacks up to 3 toasts; auto-dismisses after 3 s.
// Toasts slide in from the right (bottom-right corner).

export function showToast(message, type = 'success') {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'false');
    container.style.cssText = [
      'position:fixed',
      'bottom:1.5rem',
      'right:1.5rem',
      'z-index:9999',
      'display:flex',
      'flex-direction:column',
      'gap:0.5rem',
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(container);
  }

  // Enforce max 3 visible toasts — remove the oldest if at the limit
  const existing = container.querySelectorAll('.toast');
  if (existing.length >= 3) {
    existing[0].remove();
  }

  const icons = {
    success: 'fa-check-circle',
    error:   'fa-exclamation-circle',
    info:    'fa-info-circle',
    warning: 'fa-exclamation-triangle'
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.setAttribute('role', 'status');
  toast.style.pointerEvents = 'auto';
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}" aria-hidden="true"></i><span>${message}</span>`;
  container.appendChild(toast);

  // Trigger enter animation on next paint
  requestAnimationFrame(() => toast.classList.add('show'));

  // Auto-dismiss after 3 s
  setTimeout(() => {
    toast.classList.remove('show');
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ——— Date & time formatting ———

/**
 * Formats an ISO date string as en-GB date, e.g. '09 May 2026'.
 * Returns '—' for falsy/invalid input.
 * @param {string} iso
 * @returns {string}
 */
export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Formats an ISO date string as en-GB date + time, e.g. '09 May 2026, 14:30'.
 * Returns '—' for falsy/invalid input.
 * @param {string} iso
 * @returns {string}
 */
export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

// ——— Currency ———

/**
 * Formats a numeric amount as GBP, e.g. '£1,250.00'.
 * Returns '£0.00' for non-numeric input.
 * @param {number|string} amount
 * @returns {string}
 */
export function formatCurrency(amount) {
  const num = parseFloat(amount);
  if (isNaN(num)) return '£0.00';
  return '£' + num.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ——— HTML escaping ———

/**
 * Escapes a string for safe insertion into HTML.
 * Returns '' for null/undefined.
 * @param {*} str
 * @returns {string}
 */
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ——— Default garage settings ———

/**
 * Returns a comprehensive default settings object for a new garage tenant.
 * Used as the fallback when no settings document exists in Firestore.
 * @returns {object}
 */
export function getDefaultSettings() {
  return {
    // Branding
    garageName:             'Premier MOT & Service',
    phone:                  '01234 567890',
    email:                  'info@premiermot.co.uk',
    address:                '14 Industrial Way, Chelmsford, Essex, CM1 2AB',
    logoUrl:                '',

    // Online presence
    googleReviewLink:       '',
    siteURL:                'https://mot-ruby.vercel.app',

    // Messaging templates
    whatsappTemplate:       'Hi [FirstName], just a reminder that your MOT is due on [MOTDueDate] for your [Year] [Make] [Model] ([Reg]). You can book online at [SiteURL] or call us on [PhoneNumber]. See you soon — [GarageName]',
    reviewTemplate:         "Hi [FirstName], thanks for visiting [GarageName] today! We'd really appreciate a Google review: [GoogleReviewLink]\nThanks — [GarageName]",

    // Financial
    bankDetails:            '',
    vatRegistered:          false,
    vatNumber:              '',
    labourRate:             65,

    // Reminders
    reminderDays:           [7, 14, 30],

    // Bookings
    maxBookingsPerSlot:     2,
    slotDurationMins:       60,
    blockedDates:           [],
    workingHours: {
      monday:    { open: true,  start: '08:00', end: '18:00' },
      tuesday:   { open: true,  start: '08:00', end: '18:00' },
      wednesday: { open: true,  start: '08:00', end: '18:00' },
      thursday:  { open: true,  start: '08:00', end: '18:00' },
      friday:    { open: true,  start: '08:00', end: '18:00' },
      saturday:  { open: true,  start: '08:00', end: '17:00' },
      sunday:    { open: false, start: '09:00', end: '13:00' }
    },

    // Notifications
    emailNotifications:     true,
    smsNotifications:       false,
    whatsappNotifications:  true,

    // VHC
    vhcEnabled:             true,
    vhcPublicPortal:        true,

    // Invoicing
    invoicePrefix:          'INV',
    invoiceNextNumber:      1,
    invoiceFooter:          'Thank you for your custom.',

    // MOT / Services
    defaultJobTypes:        ['MOT', 'Service', 'Repair', 'Tyres', 'Brakes', 'Diagnostics'],

    // Feature flags
    features: {
      jobBoard:   true,
      invoicing:  true,
      vhc:        true,
      crm:        true,
      revenue:    true,
      whatsapp:   true
    }
  };
}

/**
 * Returns the current garage settings.
 * Prefers window._settings (set by the settings listener in dashboard.js),
 * falling back to the built-in defaults.
 * @returns {object}
 */
export function getSettings() {
  return window._settings || getDefaultSettings();
}

// ——— Debounce ———

/**
 * Returns a debounced version of fn that fires after ms milliseconds of inactivity.
 * @param {Function} fn
 * @param {number} ms  Default 300
 * @returns {Function}
 */
export function debounce(fn, ms = 300) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ——— UUID v4 ———

/**
 * Generates a RFC-4122 UUID v4.
 * Uses crypto.randomUUID() where available, with a Math.random fallback.
 * @returns {string}
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ——— Countdown ———

/**
 * Calculates how many days remain until a target date and derives a status label.
 * @param {string} dateStr  ISO date string or any value parseable by Date()
 * @returns {{ days: number|null, label: string, status: 'expired'|'urgent'|'warning'|'ok' }}
 */
export function countdown(dateStr) {
  if (!dateStr) return { days: null, label: '—', status: 'ok' };

  const target = new Date(dateStr);
  if (isNaN(target)) return { days: null, label: '—', status: 'ok' };

  const now = new Date();
  // Strip time component for day-accurate diff using UTC midnight values
  const todayMs  = Date.UTC(now.getFullYear(),    now.getMonth(),    now.getDate());
  const targetMs = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const days = Math.round((targetMs - todayMs) / 86_400_000);

  let label, status;
  if (days < 0) {
    label  = `Expired ${Math.abs(days)}d ago`;
    status = 'expired';
  } else if (days === 0) {
    label  = 'Due today';
    status = 'urgent';
  } else if (days <= 7) {
    label  = `${days}d left`;
    status = 'urgent';
  } else if (days <= 30) {
    label  = `${days}d left`;
    status = 'warning';
  } else {
    label  = `${days}d left`;
    status = 'ok';
  }

  return { days, label, status };
}

// ——— Expose on window for non-module inline scripts ———

window.showToast          = showToast;
window.formatDate         = formatDate;
window.formatDateTime     = formatDateTime;
window.formatCurrency     = formatCurrency;
window.esc                = esc;
window.getDefaultSettings = getDefaultSettings;
window.getSettings        = getSettings;
window.debounce           = debounce;
window.generateId         = generateId;
window.countdown          = countdown;
