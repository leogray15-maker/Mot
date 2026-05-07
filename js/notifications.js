/* ===========================
   Premier MOT — Notifications
   =========================== */

const NOTIF_KEY = 'premier_notifications';

function getNotifications() { return JSON.parse(localStorage.getItem(NOTIF_KEY) || '[]'); }
function saveNotificationsData(n) { localStorage.setItem(NOTIF_KEY, JSON.stringify(n)); }

function addNotification(type, message, section) {
  const notifs = getNotifications();
  notifs.unshift({ id: Date.now(), type, message, section: section || 'overview', read: false, createdAt: new Date().toISOString() });
  if (notifs.length > 60) notifs.length = 60;
  saveNotificationsData(notifs);
  updateNotifBadge();
  if (document.getElementById('notifDropdown')?.classList.contains('open')) renderNotifDropdown();
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const count = getNotifications().filter(n => !n.read).length;
  badge.textContent = count > 9 ? '9+' : count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function renderNotifDropdown() {
  const list = document.getElementById('notifList');
  if (!list) return;
  const notifs = getNotifications().slice(0, 25);
  if (notifs.length === 0) {
    list.innerHTML = `<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>All caught up!</p></div>`;
    return;
  }
  const iconMap = {
    new_enquiry: 'fa-inbox', new_booking: 'fa-calendar-plus', mot_reminder: 'fa-car',
    job_complete: 'fa-circle-check', invoice_overdue: 'fa-file-invoice', info: 'fa-info-circle',
    success: 'fa-check-circle', error: 'fa-exclamation-circle'
  };
  list.innerHTML = notifs.map(n => `
    <div class="notif-item${n.read ? '' : ' unread'}" onclick="clickNotif(${n.id},'${n.section || 'overview'}')">
      <div class="notif-icon-wrap type-${n.type}">
        <i class="fas ${iconMap[n.type] || 'fa-bell'}"></i>
      </div>
      <div class="notif-content">
        <p>${esc(n.message)}</p>
        <span class="notif-time">${timeAgo(n.createdAt)}</span>
      </div>
      ${!n.read ? '<div class="notif-dot"></div>' : ''}
    </div>`).join('');
}

function clickNotif(id, section) {
  const notifs = getNotifications();
  const idx = notifs.findIndex(n => n.id === id);
  if (idx !== -1) { notifs[idx].read = true; saveNotificationsData(notifs); }
  updateNotifBadge();
  document.getElementById('notifDropdown')?.classList.remove('open');
  if (section && typeof navigate === 'function') navigate(section);
}

function markAllRead() {
  const notifs = getNotifications().map(n => ({ ...n, read: true }));
  saveNotificationsData(notifs);
  updateNotifBadge();
  renderNotifDropdown();
}

function clearAllNotifs() {
  localStorage.removeItem(NOTIF_KEY);
  updateNotifBadge();
  renderNotifDropdown();
}

function timeAgo(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

document.addEventListener('DOMContentLoaded', () => {
  const bell = document.getElementById('notifBell');
  const dropdown = document.getElementById('notifDropdown');
  if (bell && dropdown) {
    bell.addEventListener('click', e => {
      e.stopPropagation();
      const isOpen = dropdown.classList.toggle('open');
      if (isOpen) { markAllRead(); renderNotifDropdown(); }
    });
    document.addEventListener('click', e => {
      if (!bell.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.remove('open');
    });
  }
  document.getElementById('clearNotifs')?.addEventListener('click', clearAllNotifs);
  updateNotifBadge();
});
