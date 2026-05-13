/* ===========================
   GarageOS — MOT Tracker (Multi-Tenant)
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, esc, countdown, getSettings } from './utils.js';

const FieldValue = firebase.firestore.FieldValue;
let motVehicles = [];

export async function initMotTracker() {
  await loadMotData();
  setupMotUI();
}

// ——— Load ———
async function loadMotData() {
  try {
    const snap = await garageRef('customers').get();
    const customers = docsToArr(snap);
    motVehicles = [];
    customers.forEach(c => {
      (c.vehicles || []).forEach((v, idx) => {
        if (v.reg && v.motDue) {
          motVehicles.push({ ...v, customerId: c.id, customerName: c.name, customerPhone: c.phone, vehicleIdx: idx });
        }
      });
    });
    motVehicles.sort((a,b) => new Date(a.motDue) - new Date(b.motDue));
    renderMotSummary();
    renderMotTable(motVehicles);
  } catch (err) {
    console.error(err);
    showToast('Failed to load MOT data', 'error');
  }
}

// ——— Summary bar ———
function renderMotSummary() {
  const now = new Date();
  const counts = { expired: 0, urgent: 0, warning: 0, ok: 0 };
  motVehicles.forEach(v => {
    const cd = countdown(v.motDue);
    counts[cd.status] = (counts[cd.status] || 0) + 1;
  });
  setText('motExpiredCount', `${counts.expired} Expired`);
  setText('motUrgentCount',  `${counts.urgent} Due in 7 days`);
  setText('motWarnCount',    `${counts.warning} Due in 30 days`);
  setText('motOkCount',      `${counts.ok} OK`);
}

// ——— Table ———
function renderMotTable(vehicles) {
  const tbody = document.getElementById('motTbody');
  if (!tbody) return;
  if (!vehicles.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No vehicles with MOT dates found. Add MOT expiry dates to customer vehicles.</td></tr>';
    return;
  }
  tbody.innerHTML = vehicles.map(v => {
    const cd  = countdown(v.motDue);
    const cls = { expired:'text-danger', urgent:'text-danger', warning:'text-warning', ok:'text-success' }[cd.status] || '';
    return `<tr>
      <td><a href="#" onclick="openCustomerById('${v.customerId}')">${esc(v.customerName)}</a></td>
      <td><a href="tel:${esc(v.customerPhone)}">${esc(v.customerPhone)}</a></td>
      <td><span class="reg-chip">${esc(v.reg)}</span></td>
      <td>${esc(v.make||'')} ${esc(v.model||'')}</td>
      <td>${formatDate(v.motDue)}</td>
      <td class="${cls} font-bold">${cd.label}</td>
      <td>${v.lastReminderDate ? `${esc(v.lastReminderStage||'')} ${formatDate(v.lastReminderDate)}` : '—'}</td>
      <td class="actions-cell">
        <button class="btn-sm btn-wa" onclick="sendMotReminder('${v.customerId}', ${v.vehicleIdx}, '30day')" title="30-day reminder"><i class="fab fa-whatsapp"></i> 30d</button>
        <button class="btn-sm btn-wa" onclick="sendMotReminder('${v.customerId}', ${v.vehicleIdx}, '14day')" title="14-day reminder"><i class="fab fa-whatsapp"></i> 14d</button>
        <button class="btn-sm btn-wa" onclick="sendMotReminder('${v.customerId}', ${v.vehicleIdx}, '7day')" title="7-day reminder"><i class="fab fa-whatsapp"></i> 7d</button>
      </td>
    </tr>`;
  }).join('');
}

// ——— UI ———
function setupMotUI() {
  document.getElementById('bulkMotBtn')?.addEventListener('click', bulkSendReminders);
}

// ——— Send reminder ———
window.sendMotReminder = async (customerId, vehicleIdx, stage) => {
  try {
    const snap = await garageDoc('customers', customerId).get();
    if (!snap.exists) return;
    const c = { id: snap.id, ...snap.data() };
    const v = c.vehicles?.[vehicleIdx];
    if (!v || !c.phone) { showToast('No phone number for this customer', 'warning'); return; }

    const settings = getSettings();
    const templates = settings.whatsappTemplates || {};
    const templateMap = { '30day': 'mot30day', '14day': 'mot14day', '7day': 'mot7day', 'today': 'motToday' };
    let msg = templates[templateMap[stage]] || `Hi ${c.name.split(' ')[0]}, your MOT is due soon for ${v.reg}. Please call us to book.`;
    msg = msg
      .replace(/\[FirstName\]/g,  c.name.split(' ')[0])
      .replace(/\[MOTDueDate\]/g, formatDate(v.motDue))
      .replace(/\[Reg\]/g,        v.reg)
      .replace(/\[Make\]/g,       v.make || '')
      .replace(/\[Model\]/g,      v.model || '')
      .replace(/\[Year\]/g,       v.year || '')
      .replace(/\[GarageName\]/g, settings.garageName || 'Your Garage')
      .replace(/\[PhoneNumber\]/g,settings.phone || '')
      .replace(/\[SiteURL\]/g,    settings.siteURL || '');

    const phone = c.phone.replace(/\s/g,'').replace(/^0/,'44');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');

    // Log the reminder
    await garageRef('comms_log').add({
      customerId, type: 'mot_reminder', direction: 'outbound', stage,
      content: msg, createdAt: FieldValue.serverTimestamp()
    });

    // Update last reminder on customer vehicle
    const updatedVehicles = [...(c.vehicles || [])];
    if (updatedVehicles[vehicleIdx]) {
      updatedVehicles[vehicleIdx].lastReminderStage = stage;
      updatedVehicles[vehicleIdx].lastReminderDate  = new Date().toISOString().split('T')[0];
    }
    await garageDoc('customers', customerId).update({ vehicles: updatedVehicles, updatedAt: FieldValue.serverTimestamp() });
    showToast('MOT reminder sent', 'success');
    loadMotData();
  } catch (err) {
    console.error(err);
    showToast('Failed to send reminder', 'error');
  }
};

// ——— Bulk send ———
async function bulkSendReminders() {
  const days = parseInt(prompt('Send reminders for vehicles due within how many days? (e.g. 30)') || '0', 10);
  if (!days || isNaN(days)) return;
  const now = new Date();
  const due = motVehicles.filter(v => {
    const d = new Date(v.motDue);
    const diff = (d - now) / 86400000;
    return diff >= 0 && diff <= days;
  });
  if (!due.length) { showToast(`No vehicles with MOT due in ${days} days`, 'info'); return; }

  let sent = 0;
  for (const v of due) {
    const stage = (() => {
      const d = (new Date(v.motDue) - now) / 86400000;
      if (d <= 0) return 'today';
      if (d <= 7) return '7day';
      if (d <= 14) return '14day';
      return '30day';
    })();
    // Rate limit: max 10/min — stagger
    await new Promise(r => setTimeout(r, 6000));
    window.sendMotReminder(v.customerId, v.vehicleIdx, stage);
    sent++;
    if (sent >= 10) { showToast('Sent 10 reminders (rate limit). Refresh to continue.', 'info'); break; }
  }
  showToast(`Sending ${Math.min(sent, due.length)} reminders`, 'success');
}

// ——— Context for overview ———
export async function getMotDueToday() {
  const today = new Date().toISOString().split('T')[0];
  return motVehicles.filter(v => v.motDue === today);
}

export function getMotVehiclesCount() {
  const counts = { expired: 0, urgent: 0, warning: 0 };
  motVehicles.forEach(v => {
    const cd = countdown(v.motDue);
    if (cd.status !== 'ok') counts[cd.status] = (counts[cd.status] || 0) + 1;
  });
  return counts;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
