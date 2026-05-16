/* ===========================
   GarageOS — Smart Reminders Engine
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, esc, countdown, getSettings } from './utils.js';

const FieldValue = firebase.firestore.FieldValue;

export function initReminders() {
  setupRemindersUI();
  loadActiveTab('mot-reminders');
}

function setupRemindersUI() {
  document.querySelectorAll('#page-reminders .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-reminders .tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadActiveTab(btn.dataset.tab);
    });
  });
}

async function loadActiveTab(tab) {
  const content = document.getElementById('remindersContent');
  if (!content) return;
  content.innerHTML = '<div class="loading-placeholder"></div>';

  switch (tab) {
    case 'mot-reminders':  renderMotRemindersTab(content); break;
    case 'booking-seq':    renderBookingSequenceTab(content); break;
    case 'service-rem':    renderServiceRemindersTab(content); break;
    case 'birthdays':      renderBirthdaysTab(content); break;
  }
}

// ——— MOT Reminders ———
async function renderMotRemindersTab(container) {
  try {
    const snap     = await garageRef('customers').get();
    const customers = docsToArr(snap);
    const vehicles  = [];
    customers.forEach(c => {
      (c.vehicles||[]).forEach((v, idx) => {
        if (v.motDue) vehicles.push({ ...v, customerId: c.id, customerName: c.name, customerPhone: c.phone, vehicleIdx: idx });
      });
    });

    const now = new Date();
    const groups = {
      today:   vehicles.filter(v => getDaysUntil(v.motDue) === 0),
      week7:   vehicles.filter(v => { const d = getDaysUntil(v.motDue); return d > 0 && d <= 7; }),
      week14:  vehicles.filter(v => { const d = getDaysUntil(v.motDue); return d > 7 && d <= 14; }),
      month30: vehicles.filter(v => { const d = getDaysUntil(v.motDue); return d > 14 && d <= 30; })
    };

    const s = getSettings();
    const template30 = s.whatsappTemplates?.mot30day || 'Hi [FirstName], your MOT is due in 30 days for [Reg]. Book now!';

    container.innerHTML = `
      <div class="reminder-section">
        <div class="reminder-header"><h3><i class="fas fa-car text-danger"></i> MOT Due Today (${groups.today.length})</h3></div>
        ${renderReminderList(groups.today, 'today')}
      </div>
      <div class="reminder-section">
        <div class="reminder-header"><h3><i class="fas fa-car text-danger"></i> Due in 7 Days (${groups.week7.length})</h3></div>
        ${renderReminderList(groups.week7, '7day')}
      </div>
      <div class="reminder-section">
        <div class="reminder-header"><h3><i class="fas fa-car text-warning"></i> Due in 14 Days (${groups.week14.length})</h3></div>
        ${renderReminderList(groups.week14, '14day')}
      </div>
      <div class="reminder-section">
        <div class="reminder-header">
          <h3><i class="fas fa-car text-muted"></i> Due in 30 Days (${groups.month30.length})</h3>
          ${groups.month30.length ? `<button class="btn-sm btn-wa" onclick="bulkSendMot30()"><i class="fab fa-whatsapp"></i> Bulk Send (${groups.month30.length})</button>` : ''}
        </div>
        ${renderReminderList(groups.month30, '30day')}
      </div>
      <div class="reminder-section">
        <h3>Template Editor</h3>
        <p class="text-muted">Edit reminder templates in <a href="#" onclick="window.openSection && openSection('settings')">Settings → Notifications</a></p>
        <div class="template-preview card">${esc(template30)}</div>
        <p class="text-muted" style="font-size:0.8rem">Variables: [FirstName] [Reg] [MOTDueDate] [Make] [Model] [GarageName] [PhoneNumber] [SiteURL]</p>
      </div>`;
  } catch (err) {
    container.innerHTML = '<p class="text-muted">Failed to load reminder data.</p>';
  }
}

function renderReminderList(vehicles, stage) {
  if (!vehicles.length) return '<p class="text-muted" style="padding:8px 0">None</p>';
  return `<div class="reminder-list">${vehicles.map(v => `
    <div class="reminder-item">
      <div class="reminder-info">
        <span class="reminder-name">${esc(v.customerName)}</span>
        <span class="reg-chip">${esc(v.reg)}</span>
        <span class="text-muted">${formatDate(v.motDue)}</span>
        ${v.lastReminderDate ? `<span class="last-sent">Last sent: ${v.lastReminderStage} on ${formatDate(v.lastReminderDate)}</span>` : ''}
      </div>
      <button class="btn-sm btn-wa" onclick="window.sendMotReminder && sendMotReminder('${v.customerId}', ${v.vehicleIdx}, '${stage}')">
        <i class="fab fa-whatsapp"></i> Send Reminder
      </button>
    </div>`).join('')}</div>`;
}

window.bulkSendMot30 = async () => {
  const snap = await garageRef('customers').get();
  const customers = docsToArr(snap);
  const due30 = [];
  customers.forEach(c => {
    (c.vehicles||[]).forEach((v,idx) => {
      if (v.motDue) { const d = getDaysUntil(v.motDue); if (d > 14 && d <= 30) due30.push({ ...v, customerId: c.id, vehicleIdx: idx }); }
    });
  });
  if (!due30.length) { showToast('No vehicles due in 30 days', 'info'); return; }
  for (let i = 0; i < Math.min(due30.length, 10); i++) {
    await new Promise(r => setTimeout(r, 6000));
    if (window.sendMotReminder) window.sendMotReminder(due30[i].customerId, due30[i].vehicleIdx, '30day');
  }
  showToast(`Sent to ${Math.min(due30.length, 10)} customers`, 'success');
};

// ——— Booking Sequence ———
async function renderBookingSequenceTab(container) {
  try {
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const snap = await garageRef('bookings').where('date','==',tomorrowStr).where('status','in',['pending','confirmed']).get();
    const bookings = docsToArr(snap);

    container.innerHTML = `
      <div class="reminder-section">
        <h3>Tomorrow's Bookings — Send 24hr Reminders (${bookings.length})</h3>
        ${bookings.length ? `<div class="reminder-list">${bookings.map(b => `
          <div class="reminder-item">
            <div class="reminder-info">
              <span class="reminder-name">${esc(b.customerName)}</span>
              <span class="reg-chip">${esc(b.reg||'')}</span>
              <span class="text-muted">${b.time||'—'} — ${esc(b.service||'')}</span>
            </div>
            <button class="btn-sm btn-wa" onclick="sendBookingReminder24h('${b.id}')">
              <i class="fab fa-whatsapp"></i> Send Reminder
            </button>
          </div>`).join('')}</div>` : '<p class="text-muted">No bookings tomorrow.</p>'}
      </div>
      <div class="reminder-section">
        <h3>Booking Sequence Templates</h3>
        <p class="text-muted">Configure all booking reminder templates in <a href="#" onclick="openSection && openSection('settings')">Settings → Notifications</a></p>
        <ul class="reminder-steps">
          <li>✅ On booking created: Confirmation sent automatically</li>
          <li>⏱️ 24hrs before: Send from the list above</li>
          <li>🔔 2hrs before: Manual send from Bookings section</li>
          <li>✔️ Job complete: Send from Job Card</li>
          <li>⭐ 24hrs after: Review request (send from job or customer)</li>
        </ul>
      </div>`;
  } catch {
    container.innerHTML = '<p class="text-muted">Failed to load data.</p>';
  }
}

window.sendBookingReminder24h = async (bookingId) => {
  try {
    const doc  = await garageDoc('bookings', bookingId).get();
    const b    = doc.data();
    const s    = getSettings();
    const tmpl = s.whatsappTemplates?.bookingReminder24h || 'Hi [FirstName], reminder: you have a [Service] tomorrow at [Time] for [Reg]. — [GarageName]';
    const msg  = tmpl.replace(/\[FirstName\]/g, b.customerName?.split(' ')[0]||'')
      .replace(/\[Service\]/g, b.service||'').replace(/\[Time\]/g, b.time||'')
      .replace(/\[Reg\]/g, b.reg||'').replace(/\[GarageName\]/g, s.garageName||'');
    const phone = b.customerPhone?.replace(/\s/g,'').replace(/^0/,'44');
    if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    else showToast('No phone number', 'warning');
  } catch { showToast('Failed to send reminder', 'error'); }
};

// ——— Service Reminders ———
async function renderServiceRemindersTab(container) {
  try {
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 11);
    const snap = await garageRef('customers').get();
    const customers = docsToArr(snap).filter(c => {
      if (!c.lastVisit) return false;
      return new Date(c.lastVisit) < cutoff;
    }).slice(0, 50);

    container.innerHTML = `
      <div class="reminder-section">
        <h3>Customers Due for Service (${customers.length}+)</h3>
        <p class="text-muted">Customers whose last visit was 11+ months ago.</p>
        ${customers.length ? `<div class="reminder-list">${customers.map(c => `
          <div class="reminder-item">
            <div class="reminder-info">
              <span class="reminder-name">${esc(c.name)}</span>
              <span class="text-muted">Last visit: ${formatDate(c.lastVisit)}</span>
            </div>
            <button class="btn-sm btn-wa" onclick="sendServiceReminder('${c.id}')">
              <i class="fab fa-whatsapp"></i> Send
            </button>
          </div>`).join('')}</div>` : '<p class="text-muted">All customers visited recently. 🎉</p>'}
      </div>`;
  } catch {
    container.innerHTML = '<p class="text-muted">Failed to load data.</p>';
  }
}

window.sendServiceReminder = async (customerId) => {
  const doc = await garageDoc('customers', customerId).get();
  const c   = doc.data();
  const s   = getSettings();
  const msg = `Hi ${c.name?.split(' ')[0]||''}, it's been a while since your last service. Don't forget to keep your vehicle roadworthy — book now at ${s.siteURL||''} or call ${s.phone||'us'}. — ${s.garageName||''}`;
  const phone = c.phone?.replace(/\s/g,'').replace(/^0/,'44');
  if (phone) { window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank'); }
  else showToast('No phone number', 'warning');
};

// ——— Birthdays ———
async function renderBirthdaysTab(container) {
  try {
    const today = new Date();
    const mm    = String(today.getMonth()+1).padStart(2,'0');
    const dd    = String(today.getDate()).padStart(2,'0');
    const snap  = await garageRef('customers').get();
    const customers = docsToArr(snap).filter(c => {
      if (!c.dob) return false;
      const [y,m,d] = c.dob.split('-');
      return m === mm && d === dd;
    });

    container.innerHTML = `
      <div class="reminder-section">
        <h3>🎂 Birthdays Today (${customers.length})</h3>
        ${customers.length ? `<div class="reminder-list">${customers.map(c => `
          <div class="reminder-item">
            <div class="reminder-info">
              <span class="reminder-name">${esc(c.name)}</span>
              <span class="text-muted">${c.phone||'—'}</span>
            </div>
            <button class="btn-sm btn-wa" onclick="sendBirthdayMessage('${c.id}')">
              <i class="fab fa-whatsapp"></i> Send Birthday Wish
            </button>
          </div>`).join('')}</div>` : '<p class="text-muted">No birthdays today.</p>'}
      </div>`;
  } catch {
    container.innerHTML = '<p class="text-muted">Failed to load data.</p>';
  }
}

window.sendBirthdayMessage = async (customerId) => {
  const doc = await garageDoc('customers', customerId).get();
  const c   = doc.data();
  const s   = getSettings();
  const msg = `Happy Birthday ${c.name?.split(' ')[0]||''}! 🎂 As a thank you, enjoy 10% off your next service. Just mention this message when booking. — ${s.garageName||'Your Garage'}`;
  const phone = c.phone?.replace(/\s/g,'').replace(/^0/,'44');
  if (phone) window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  else showToast('No phone number', 'warning');
};

// ——— Helpers ———
function getDaysUntil(dateStr) {
  const d = new Date(dateStr);
  return Math.ceil((d - Date.now()) / 86400000);
}


