/* ===========================
   Premier MOT — Notifications (Firebase)
   =========================== */

import { db, docsToArr } from './firebase.js';

window._notifData = [];

async function loadNotifications() {
  try {
    const snap = await db.collection('notifications').orderBy('createdAt','desc').limit(60).get();
    window._notifData = docsToArr(snap);
  } catch (e) {
    window._notifData = [];
  }
  updateNotifBadge();
}

function addNotification(type, message, section) {
  const notif = { type, message, section: section || 'overview', read: false, createdAt: new Date().toISOString() };
  window._notifData.unshift(notif);
  if (window._notifData.length > 60) window._notifData.length = 60;
  updateNotifBadge();
  if (document.getElementById('notifDropdown')?.classList.contains('open')) renderNotifDropdown();
  // Fire-and-forget Firestore write
  db.collection('notifications').add(notif).catch(() => {});
}

function updateNotifBadge() {
  const badge = document.getElementById('notifBadge');
  if (!badge) return;
  const count = window._notifData.filter(n => !n.read).length;
  badge.textContent = count > 9 ? '9+' : count;
  badge.classList.toggle('hidden', count === 0);
}

function renderNotifDropdown() {
  const list = document.getElementById('notifList');
  if (!list) return;
  const notifs = window._notifData.slice(0, 25);
  if (notifs.length === 0) {
    list.innerHTML = `<div class="notif-empty"><i class="fas fa-bell-slash"></i><p>All caught up!</p></div>`;
    return;
  }
  const iconMap = {
    new_enquiry:'fa-inbox', new_booking:'fa-calendar-plus', mot_reminder:'fa-car',
    job_complete:'fa-circle-check', invoice_overdue:'fa-file-invoice',
    info:'fa-info-circle', success:'fa-check-circle', error:'fa-exclamation-circle'
  };
  list.innerHTML = notifs.map((n, i) => `
    <div class="notif-item${n.read ? '' : ' unread'}" onclick="clickNotif(${i},'${n.section||'overview'}')">
      <div class="notif-dot${n.read ? ' read' : ''}"></div>
      <div class="notif-icon ${iconClass(n.type)}"><i class="fas ${iconMap[n.type]||'fa-bell'}"></i></div>
      <div class="notif-text">
        <p>${esc(n.message)}</p>
        <span class="notif-time">${timeAgo(n.createdAt)}</span>
      </div>
    </div>`).join('');
}

function iconClass(type) {
  if (['new_booking','mot_reminder'].includes(type)) return 'amber';
  if (['job_complete','success'].includes(type)) return 'green';
  if (['error','invoice_overdue'].includes(type)) return 'red';
  return 'blue';
}

function clickNotif(index, section) {
  if (window._notifData[index]) window._notifData[index].read = true;
  updateNotifBadge();
  document.getElementById('notifDropdown')?.classList.remove('open');
  if (section && typeof navigate === 'function') navigate(section);
}

function markAllRead() {
  window._notifData.forEach(n => { n.read = true; });
  updateNotifBadge();
  renderNotifDropdown();
  // Best-effort batch mark-read in Firestore
  db.collection('notifications').where('read','==',false).get()
    .then(snap => {
      const batch = db.batch();
      snap.docs.forEach(d => batch.update(d.ref, { read: true }));
      return batch.commit();
    }).catch(() => {});
}

function clearAllNotifs() {
  window._notifData = [];
  updateNotifBadge();
  renderNotifDropdown();
  // Best-effort delete in Firestore
  db.collection('notifications').get()
    .then(snap => {
      const batch = db.batch();
      snap.docs.forEach(d => batch.delete(d.ref));
      return batch.commit();
    }).catch(() => {});
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

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
  const bell     = document.getElementById('notifBell');
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
  // Load notifications on init (after auth is ready, via a slight delay)
  setTimeout(loadNotifications, 1000);
});

Object.assign(window, {
  clickNotif, markAllRead, clearAllNotifs, addNotification,
  renderNotifDropdown, updateNotifBadge, loadNotifications
});
