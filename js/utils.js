/* ===========================
   Premier MOT — Shared Utilities
   =========================== */

// ——— Toast notifications ———

export function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i><span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ——— Date formatting ———

export function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ——— HTML escaping ———

export function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ——— Settings cache ———

export function getDefaultSettings() {
  return {
    garageName: 'Premier MOT & Service',
    phone: '01234 567890',
    email: 'info@premiermot.co.uk',
    address: '14 Industrial Way, Chelmsford, Essex, CM1 2AB',
    googleReviewLink: '',
    siteURL: 'https://mot-ruby.vercel.app',
    whatsappTemplate: 'Hi [FirstName], just a reminder that your MOT is due on [MOTDueDate] for your [Year] [Make] [Model] ([Reg]). You can book online at [SiteURL] or call us on [PhoneNumber]. See you soon — [GarageName]',
    reviewTemplate: "Hi [FirstName], thanks for visiting [GarageName] today! We'd really appreciate a Google review: [GoogleReviewLink]\nThanks — [GarageName]",
    bankDetails: '',
    vatRegistered: false,
    vatNumber: '',
    labourRate: 65,
    reminderDays: [7, 14, 30],
    maxBookingsPerSlot: 2,
    blockedDates: [],
    workingHours: {
      monday:    { open: true,  start: '08:00', end: '18:00' },
      tuesday:   { open: true,  start: '08:00', end: '18:00' },
      wednesday: { open: true,  start: '08:00', end: '18:00' },
      thursday:  { open: true,  start: '08:00', end: '18:00' },
      friday:    { open: true,  start: '08:00', end: '18:00' },
      saturday:  { open: true,  start: '08:00', end: '17:00' },
      sunday:    { open: false, start: '09:00', end: '13:00' }
    }
  };
}

export function getSettings() {
  return window._settings || getDefaultSettings();
}

// Expose on window so inline onclick handlers can call them
window.getSettings = getSettings;
