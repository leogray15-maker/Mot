/* ===========================
   Premier MOT — Dashboard CRM (Firebase)
   =========================== */

import firebase, { db, auth, docsToArr, fsAdd, fsUpdate, fsDel, showSpinner, hideSpinner } from './firebase.js';
// ——— Settings ———

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

function getSettings() { return window._settings || getDefaultSettings(); }
window.getSettings = getSettings;

async function initSettings() {
  try {
    const snap = await db.collection('settings').doc('config').get();
    const def = getDefaultSettings();
    const stored = snap.exists ? snap.data() : {};
    window._settings = Object.assign({}, def, stored);
    window._settings.workingHours = Object.assign({}, def.workingHours, stored.workingHours || {});
    if (!Array.isArray(window._settings.reminderDays)) window._settings.reminderDays = def.reminderDays;
    if (!Array.isArray(window._settings.blockedDates))  window._settings.blockedDates = [];
  } catch (e) {
    console.error('Failed to load settings', e);
    window._settings = getDefaultSettings();
  }
}

async function saveSettings(data) {
  window._settings = data;
  try {
    await db.collection('settings').doc('config').set(data);
  } catch (e) {
    showToast('Failed to save settings', 'error');
  }
}
window.saveSettings = saveSettings;

// ——— In-memory caches ———
window._enquiriesData = [];
window._customersData = [];
window._bookingsData  = [];

function getEnquiries() { return window._enquiriesData; }
function getCustomers()  { return window._customersData; }

// ——— Utilities ———

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00');
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
function today() { return new Date().toISOString().split('T')[0]; }
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

// ——— Toast ———
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i class="fas ${icons[type] || icons.info} ${type}"></i><span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'slideInRight 0.3s ease reverse forwards';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ——— Sidebar Navigation ———
let currentSection = 'overview';
let _enquiriesUnsub = null;
let _bookingsUnsub  = null;

window.sectionLoaders = {
  overview:  () => loadOverview(),
  enquiries: () => loadEnquiries(),
  customers: () => loadCustomers(),
  mot:       () => loadMOTTracker(),
  settings:  () => loadSettings()
};

const SECTION_LABELS = {
  overview: 'Overview', enquiries: 'Enquiries', customers: 'Customers', mot: 'MOT Tracker',
  settings: 'Settings', bookings: 'Bookings', jobs: 'Job Cards', invoices: 'Invoices', revenue: 'Revenue'
};

function navigate(section) {
  currentSection = section;
  document.querySelectorAll('.section-page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));
  const page = document.getElementById(`page-${section}`);
  if (page) page.classList.add('active');
  const link = document.querySelector(`.sidebar-link[data-section="${section}"]`);
  if (link) link.classList.add('active');
  const bc = document.querySelector('.topbar-breadcrumb');
  if (bc) bc.innerHTML = `<span>${SECTION_LABELS[section] || section}</span>`;
  const loader = window.sectionLoaders[section];
  if (loader) loader();
  document.querySelector('.sidebar')?.classList.remove('open');
}

document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
  link.addEventListener('click', () => navigate(link.dataset.section));
});

const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.querySelector('.sidebar');
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', e => {
    if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) sidebar.classList.remove('open');
  });
}

// ——— Overview ———
function loadOverview() {
  const enquiries = window._enquiriesData;
  const bookings  = window._bookingsData;
  const todayStr  = today();
  const s = getSettings();

  setText('stat-total',     enquiries.length);
  setText('stat-today',     enquiries.filter(e => (e.date||e.createdAt||'').startsWith(todayStr)).length);
  setText('stat-awaiting',  enquiries.filter(e => e.status === 'New' || e.status === 'Contacted').length);
  setText('stat-completed', enquiries.filter(e => e.status === 'Completed').length);

  const hr = new Date().getHours();
  const greeting = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const greetEl = document.getElementById('overviewGreeting');
  if (greetEl) greetEl.textContent = `${greeting}, Admin`;

  const todayBookings   = bookings.filter(b => b.date === todayStr && b.status !== 'Cancelled').length;
  const motDue          = typeof getMOTDueForReminder === 'function' ? getMOTDueForReminder().length : 0;
  const newEnquiries    = enquiries.filter(e => e.status === 'New').length;

  // Unpaid invoices count from Firestore (async, best-effort)
  let unpaidInvoices = 0;
  db.collection('invoices').where('paymentStatus','==','Unpaid').get()
    .then(snap => {
      unpaidInvoices = snap.size;
      renderSummary(todayBookings, motDue, newEnquiries, unpaidInvoices);
    }).catch(() => renderSummary(todayBookings, motDue, newEnquiries, 0));

  renderSummary(todayBookings, motDue, newEnquiries, 0);

  // Recent enquiries
  const tbody = document.getElementById('recentEnquiriesBody');
  if (tbody) {
    const recent = [...enquiries].slice(0, 5);
    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="fas fa-inbox"></i>No enquiries yet.</td></tr>`;
    } else {
      tbody.innerHTML = recent.map(e => `
        <tr>
          <td class="td-muted">${formatDate(e.date || e.createdAt)}</td>
          <td class="td-name">${esc(e.name)}</td>
          <td>${esc(e.phone)}</td>
          <td>${esc(e.service)}</td>
          <td><span class="badge ${statusClass(e.status)}">${esc(e.status)}</span></td>
          <td><div class="action-btns">
            <button class="action-btn" onclick="viewEnquiry('${e.id}')" title="View"><i class="fas fa-eye"></i></button>
            <button class="action-btn success" onclick="markComplete('${e.id}')" title="Mark complete"><i class="fas fa-check"></i></button>
          </div></td>
        </tr>`).join('');
    }
  }

  // Enquiry badge
  const badge = document.querySelector('.sidebar-link[data-section="enquiries"] .badge');
  if (badge) {
    const n = enquiries.filter(e => e.status === 'New').length;
    badge.textContent = n; badge.style.display = n > 0 ? '' : 'none';
  }

  // MOT reminder widget
  if (typeof getMOTDueForReminder === 'function') {
    const motReminders = getMOTDueForReminder();
    const reminderWidget = document.getElementById('motReminderWidget');
    if (reminderWidget) {
      if (motReminders.length === 0) {
        reminderWidget.innerHTML = `<div class="reminder-empty"><i class="fas fa-check-circle" style="color:var(--green)"></i> No MOT reminders to send today.</div>`;
      } else {
        reminderWidget.innerHTML = motReminders.map(c => `
          <div class="reminder-row${c.reminderSentToday ? ' sent' : ''}">
            <div class="reminder-info">
              <div class="reminder-name">${esc(c.name)}</div>
              <div class="reminder-detail">${esc(c.make||'')} ${esc(c.model||'')} ${esc(c.reg||'')} — due in ${c.daysLeft} day${c.daysLeft !== 1 ? 's' : ''}</div>
            </div>
            <div class="reminder-actions">
              ${c.reminderSentToday
                ? '<span class="badge badge-completed"><i class="fas fa-check"></i> Sent today</span>'
                : `<button class="btn-sm btn-success-sm" onclick="sendMOTReminderWA('${c.id}')"><i class="fab fa-whatsapp"></i> Send</button>`
              }
            </div>
          </div>`).join('');
      }
    }
  }
}

function renderSummary(todayBookings, motDue, newEnquiries, unpaidInvoices) {
  const summaryEl = document.getElementById('dailySummaryBody');
  if (!summaryEl) return;
  summaryEl.innerHTML = `
    <div class="summary-line${todayBookings > 0 ? ' highlight' : ''}"><i class="fas fa-calendar-check"></i><span>Bookings today: <strong>${todayBookings}</strong></span>${todayBookings > 0 ? `<button class="btn-sm btn-ghost-sm" onclick="navigate('bookings')">View</button>` : ''}</div>
    <div class="summary-line${motDue > 0 ? ' highlight-amber' : ''}"><i class="fas fa-car"></i><span>MOT reminders to send: <strong>${motDue}</strong></span>${motDue > 0 ? `<button class="btn-sm btn-ghost-sm" onclick="navigate('mot')">View</button>` : ''}</div>
    <div class="summary-line${newEnquiries > 0 ? ' highlight' : ''}"><i class="fas fa-inbox"></i><span>New enquiries: <strong>${newEnquiries}</strong></span>${newEnquiries > 0 ? `<button class="btn-sm btn-ghost-sm" onclick="navigate('enquiries')">View</button>` : ''}</div>
    <div class="summary-line${unpaidInvoices > 0 ? ' highlight-amber' : ''}"><i class="fas fa-file-invoice-pound"></i><span>Unpaid invoices: <strong>${unpaidInvoices}</strong></span>${unpaidInvoices > 0 ? `<button class="btn-sm btn-ghost-sm" onclick="navigate('invoices')">View</button>` : ''}</div>`;
}

// ——— Enquiries ———
let enquiryFilter = 'all', enquirySearch = '';

function loadEnquiries() {
  if (_enquiriesUnsub) return; // listener already active
  showSpinner('page-enquiries');
  _enquiriesUnsub = db.collection('enquiries')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      window._enquiriesData = docsToArr(snap);
      hideSpinner('page-enquiries');
      renderEnquiriesTable();
      // refresh overview stats live
      if (currentSection === 'overview') loadOverview();
    }, err => {
      hideSpinner('page-enquiries');
      showToast('Failed to load enquiries', 'error');
    });
}

function renderEnquiriesTable() {
  const q = enquirySearch.toLowerCase();
  const filtered = window._enquiriesData.filter(e => {
    const matchStatus = enquiryFilter === 'all' || e.status === enquiryFilter;
    const matchSearch = !q || (e.name||'').toLowerCase().includes(q) || (e.email||'').toLowerCase().includes(q) || (e.reg||'').toLowerCase().includes(q) || (e.phone||'').includes(q);
    return matchStatus && matchSearch;
  });

  const tbody = document.getElementById('enquiriesBody');
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i class="fas fa-search"></i>No enquiries match your search.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(e => `
    <tr>
      <td class="td-muted">${formatDate(e.date || e.createdAt)}</td>
      <td class="td-name">${esc(e.name)}</td>
      <td>${esc(e.phone)}</td>
      <td class="td-muted">${esc(e.email)}</td>
      <td class="td-mono">${esc(e.reg||'—')}</td>
      <td>${esc(e.service)}</td>
      <td>
        <select class="status-select" onchange="updateEnquiryStatus('${e.id}',this.value)">
          ${['New','Contacted','Booked In','Completed','Cancelled'].map(s => `<option value="${s}"${e.status === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><div class="action-btns">
        <button class="action-btn" onclick="viewEnquiry('${e.id}')" title="View"><i class="fas fa-eye"></i></button>
        <button class="action-btn danger" onclick="deleteEnquiry('${e.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`).join('');
}

document.getElementById('enquirySearch')?.addEventListener('input', e => { enquirySearch = e.target.value; renderEnquiriesTable(); });
document.getElementById('enquiryFilter')?.addEventListener('change', e => { enquiryFilter = e.target.value; renderEnquiriesTable(); });

async function updateEnquiryStatus(id, status) {
  try {
    await fsUpdate('enquiries', id, { status });
    showToast(`Status updated to "${status}"`, 'success');
    if (status === 'Completed') {
      const e = window._enquiriesData.find(x => x.id === id);
      if (e) {
        const cust = window._customersData.find(c => c.phone === e.phone || c.email === e.email);
        if (cust && typeof promptReviewRequest === 'function') setTimeout(() => promptReviewRequest(cust.id), 300);
      }
    }
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
}

async function deleteEnquiry(id) {
  if (!confirm('Delete this enquiry?')) return;
  try {
    await fsDel('enquiries', id);
    showToast('Enquiry deleted', 'info');
  } catch (err) {
    showToast('Failed to delete enquiry', 'error');
  }
}

async function markComplete(id) {
  try {
    await fsUpdate('enquiries', id, { status: 'Completed' });
    showToast('Marked as Completed', 'success');
    const e = window._enquiriesData.find(x => x.id === id);
    if (e) {
      const cust = window._customersData.find(c => c.phone === e.phone);
      if (cust && typeof promptReviewRequest === 'function') setTimeout(() => promptReviewRequest(cust.id), 300);
    }
  } catch (err) {
    showToast('Failed to mark complete', 'error');
  }
}

function viewEnquiry(id) {
  const e = window._enquiriesData.find(x => x.id === id);
  if (!e) return;
  const overlay = document.getElementById('enquiryDetailModal');
  const content = document.getElementById('enquiryDetailContent');
  if (!overlay || !content) return;
  content.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>Name</label><p>${esc(e.name)}</p></div>
      <div class="detail-item"><label>Phone</label><p>${esc(e.phone)}</p></div>
      <div class="detail-item"><label>Email</label><p>${esc(e.email)}</p></div>
      <div class="detail-item"><label>Vehicle Reg</label><p class="mono">${esc(e.reg||'—')}</p></div>
      <div class="detail-item"><label>Service</label><p>${esc(e.service)}</p></div>
      <div class="detail-item"><label>Preferred Date</label><p>${esc(e.preferredDate||'—')}</p></div>
      <div class="detail-item"><label>Submitted</label><p>${formatDateTime(e.date || e.createdAt)}</p></div>
      <div class="detail-item"><label>Source</label><p>${esc(e.source||'Website')}</p></div>
      <div class="detail-item"><label>Status</label><p><span class="badge ${statusClass(e.status)}">${esc(e.status)}</span></p></div>
    </div>
    ${e.message ? `<div class="detail-item" style="margin-top:12px"><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);margin-bottom:6px">Message</label><p style="font-size:0.9rem;color:var(--text-muted);line-height:1.6">${esc(e.message)}</p></div>` : ''}`;
  overlay.classList.add('open');
}

document.getElementById('closeEnquiryModal')?.addEventListener('click', () => document.getElementById('enquiryDetailModal')?.classList.remove('open'));
document.getElementById('enquiryDetailModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });

// ——— Customers ———
let customerSearch = '';

async function loadCustomers() {
  showSpinner('page-customers');
  try {
    const snap = await db.collection('customers').get();
    window._customersData = docsToArr(snap);
    hideSpinner('page-customers');
    renderCustomersList();
  } catch (err) {
    hideSpinner('page-customers');
    showToast('Failed to load customers', 'error');
  }
}

function renderCustomersList() {
  const q = customerSearch.toLowerCase();
  const filtered = window._customersData.filter(c =>
    !q || c.name.toLowerCase().includes(q) || (c.email||'').toLowerCase().includes(q) || (c.reg||'').toLowerCase().includes(q) || (c.phone||'').includes(q)
  );
  const tbody = document.getElementById('customersBody');
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fas fa-users"></i>No customers found.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(c => `
    <tr style="cursor:pointer" onclick="viewCustomer('${c.id}')">
      <td class="td-name">${esc(c.name)}</td>
      <td>${esc(c.phone)}</td>
      <td class="td-muted">${esc(c.email||'—')}</td>
      <td class="td-mono">${esc(c.reg||'—')}</td>
      <td class="td-muted">${esc(c.make||'')} ${esc(c.model||'')}</td>
      <td class="td-muted">${esc(c.year||'—')}</td>
      <td><div class="action-btns">
        <button class="action-btn" onclick="event.stopPropagation();viewCustomer('${c.id}')" title="View"><i class="fas fa-eye"></i></button>
        <button class="action-btn danger" onclick="event.stopPropagation();deleteCustomer('${c.id}')" title="Delete"><i class="fas fa-trash"></i></button>
      </div></td>
    </tr>`).join('');
}

document.getElementById('customerSearch')?.addEventListener('input', e => { customerSearch = e.target.value; renderCustomersList(); });

const addCustomerForm = document.getElementById('addCustomerForm');
if (addCustomerForm) {
  addCustomerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const data = new FormData(addCustomerForm);
    const customer = {
      name: data.get('name'), phone: data.get('phone'),
      email: data.get('email'), reg: data.get('reg'),
      make: data.get('make'), model: data.get('model'),
      year: data.get('year'), motDue: data.get('motDue'),
      notes: '', jobs: [], reminderLog: [],
      createdAt: new Date().toISOString()
    };
    try {
      const id = await fsAdd('customers', customer);
      window._customersData.unshift({ id, ...customer });
      addCustomerForm.reset();
      renderCustomersList();
      if (typeof addNotification === 'function') addNotification('info', `Customer added: ${customer.name}`, 'customers');
      showToast('Customer added', 'success');
    } catch (err) {
      showToast('Failed to add customer', 'error');
    }
  });
}

async function deleteCustomer(id) {
  if (!confirm('Delete this customer?')) return;
  try {
    await fsDel('customers', id);
    window._customersData = window._customersData.filter(c => c.id !== id);
    renderCustomersList();
    showToast('Customer deleted', 'info');
  } catch (err) {
    showToast('Failed to delete customer', 'error');
  }
}

function viewCustomer(id) {
  const c = window._customersData.find(x => x.id === id);
  if (!c) return;
  const overlay = document.getElementById('customerProfileModal');
  const content = document.getElementById('customerProfileContent');
  if (!overlay || !content) return;
  const initials = c.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const reminderHistory = (c.reminderLog||[]).slice(0, 5).map(r =>
    `<div style="font-size:0.8rem;color:var(--text-dim);padding:4px 0;border-bottom:1px solid var(--border)">${r.type === 'mot_reminder' ? 'MOT Reminder' : r.type === 'review_request' ? 'Review Request' : 'Message'} — ${formatDateTime(r.sentAt)}</div>`
  ).join('');

  content.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${initials}</div>
      <div class="profile-info">
        <h2>${esc(c.name)}</h2>
        <p>${esc(c.make||'')} ${esc(c.model||'')} ${esc(c.year||'')} &bull; ${esc(c.reg||'No reg')}</p>
      </div>
    </div>
    <div class="profile-grid">
      <div>
        <h4 style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:16px">Contact</h4>
        <div class="info-item"><label>Phone</label><p>${esc(c.phone)}</p></div>
        <div class="info-item"><label>Email</label><p>${esc(c.email||'—')}</p></div>
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
          <button class="btn-sm btn-success-sm" onclick="sendMOTReminderWA('${c.id}')"><i class="fab fa-whatsapp"></i> MOT Reminder</button>
          <button class="btn-sm btn-ghost-sm" onclick="promptReviewRequest('${c.id}')"><i class="fas fa-star"></i> Review Request</button>
        </div>
      </div>
      <div>
        <h4 style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:16px">Vehicle</h4>
        <div class="info-item"><label>Registration</label><p style="font-family:monospace">${esc(c.reg||'—')}</p></div>
        <div class="info-item"><label>Make & Model</label><p>${esc(c.make||'')} ${esc(c.model||'')}</p></div>
        <div class="info-item"><label>Year</label><p>${esc(c.year||'—')}</p></div>
        <div class="info-item"><label>MOT Due</label><p>${c.motDue ? formatDate(c.motDue) : '—'}</p></div>
      </div>
    </div>
    ${reminderHistory ? `<div style="margin-top:20px"><h4 style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:10px">Message History</h4>${reminderHistory}</div>` : ''}
    <div style="margin-top:20px">
      <label style="display:block;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);margin-bottom:8px">Notes</label>
      <textarea id="customerNotes" style="width:100%;background:var(--dark-3);border:1px solid var(--border-strong);border-radius:var(--radius);padding:12px;color:var(--white);font-size:0.88rem;font-family:inherit;min-height:80px;resize:vertical">${esc(c.notes||'')}</textarea>
      <button class="btn-sm btn-primary-sm" style="margin-top:8px" onclick="saveCustomerNotes('${c.id}')"><i class="fas fa-save"></i> Save Notes</button>
    </div>`;
  overlay.classList.add('open');
}

async function saveCustomerNotes(id) {
  const notes = document.getElementById('customerNotes')?.value || '';
  try {
    await fsUpdate('customers', id, { notes });
    const idx = window._customersData.findIndex(c => c.id === id);
    if (idx !== -1) window._customersData[idx].notes = notes;
    showToast('Notes saved', 'success');
  } catch (err) {
    showToast('Failed to save notes', 'error');
  }
}

document.getElementById('closeCustomerModal')?.addEventListener('click', () => document.getElementById('customerProfileModal')?.classList.remove('open'));
document.getElementById('customerProfileModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });

// ——— MOT Tracker ———
async function loadMOTTracker() {
  // Ensure customers are loaded
  if (window._customersData.length === 0) {
    showSpinner('page-mot');
    try {
      const snap = await db.collection('customers').get();
      window._customersData = docsToArr(snap);
    } catch (err) { showToast('Failed to load customer data', 'error'); }
    hideSpinner('page-mot');
  }

  const customers = window._customersData;
  const now = new Date();
  let overdue = 0, soon = 0, ok = 0;

  const rows = customers.map(c => {
    if (!c.motDue) return null;
    const due = new Date(c.motDue + 'T12:00:00');
    const daysLeft = Math.round((due - now) / 86400000);
    let sc, label;
    if (daysLeft < 0)        { sc = 'mot-overdue'; label = `${Math.abs(daysLeft)} days overdue`; overdue++; }
    else if (daysLeft <= 30) { sc = 'mot-soon';    label = `Due in ${daysLeft} days`; soon++; }
    else                     { sc = 'mot-ok';      label = `Due in ${daysLeft} days`; ok++; }

    return `<tr>
      <td class="td-name">${esc(c.name)}</td>
      <td class="td-mono">${esc(c.reg||'—')}</td>
      <td class="td-muted">${esc(c.make||'')} ${esc(c.model||'')}</td>
      <td>${formatDate(c.motDue)}</td>
      <td><span class="badge ${sc}">${label}</span></td>
      <td><button class="btn-sm btn-success-sm" onclick="sendMOTReminderWA('${c.id}')"><i class="fab fa-whatsapp"></i> Send Reminder</button></td>
    </tr>`;
  }).filter(Boolean);

  const tbody = document.getElementById('motBody');
  if (tbody) tbody.innerHTML = rows.length === 0
    ? `<tr><td colspan="6" class="table-empty"><i class="fas fa-car"></i>No customers with MOT dates.</td></tr>`
    : rows.join('');

  setText('mot-overdue', overdue);
  setText('mot-soon', soon);
  setText('mot-ok', ok);

  const preview = document.getElementById('motTemplatePreview');
  if (preview) preview.textContent = getSettings().whatsappTemplate || '';
}

// ——— Settings ———
function loadSettings() {
  const s = getSettings();
  const fieldMap = { settingGarageName: 'garageName', settingPhone: 'phone', settingEmail: 'email', settingAddress: 'address' };
  Object.entries(fieldMap).forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.value = s[key] || ''; });
  const userEmailEl = document.getElementById('settingUserEmail');
  if (userEmailEl && auth.currentUser) userEmailEl.value = auth.currentUser.email || '';
}

const settingsGarageForm = document.getElementById('settingsGarageForm');
if (settingsGarageForm) {
  settingsGarageForm.addEventListener('submit', async e => {
    e.preventDefault();
    const s = getSettings();
    s.garageName = document.getElementById('settingGarageName')?.value || '';
    s.phone      = document.getElementById('settingPhone')?.value || '';
    s.email      = document.getElementById('settingEmail')?.value || '';
    s.address    = document.getElementById('settingAddress')?.value || '';
    await saveSettings(s);
    const brand = document.querySelector('.sidebar-brand-text strong');
    if (brand) brand.textContent = s.garageName;
    showToast('Garage details saved', 'success');
  });
}

const passwordForm = document.getElementById('settingsPasswordForm');
if (passwordForm) {
  passwordForm.addEventListener('submit', async e => {
    e.preventDefault();
    const cur = document.getElementById('currentPassword');
    const nw  = document.getElementById('newPassword');
    const cnf = document.getElementById('confirmPassword');
    if (!cur || !nw || !cnf) return;
    if (nw.value !== cnf.value) { showToast('Passwords do not match', 'error'); nw.value = ''; cnf.value = ''; return; }
    if (nw.value.length < 6)   { showToast('Password must be 6+ characters', 'error'); return; }

    const user = auth.currentUser;
    if (!user) { showToast('Not authenticated', 'error'); return; }

    try {
      // Re-authenticate before changing password
      const cred = firebase.auth.EmailAuthProvider.credential(user.email, cur.value);
      await user.reauthenticateWithCredential(cred);
      await user.updatePassword(nw.value);
      passwordForm.reset();
      showToast('Password updated', 'success');
    } catch (err) {
      if (err.code === 'auth/wrong-password') showToast('Current password incorrect', 'error');
      else showToast('Failed to update password', 'error');
      cur.value = '';
    }
  });
}

// ——— Utilities ———
function statusClass(status) {
  return { 'New': 'badge-new', 'Contacted': 'badge-contacted', 'Booked In': 'badge-booked', 'Completed': 'badge-completed', 'Cancelled': 'badge-cancelled' }[status] || 'badge-new';
}

document.getElementById('quickAddCustomer')?.addEventListener('click', () => navigate('customers'));
document.getElementById('quickViewEnquiries')?.addEventListener('click', () => navigate('enquiries'));

// ——— Seed Demo Data ———
async function seedDemoData() {
  try {
    const [enqSnap, custSnap] = await Promise.all([
      db.collection('enquiries').limit(1).get(),
      db.collection('customers').limit(1).get()
    ]);

    if (enqSnap.empty) {
      const enqs = [
        { date: new Date(Date.now()-86400000*2).toISOString(), name:'James Hargreaves', phone:'07712 345678', email:'james.h@email.com', reg:'AB21 XYZ', service:'MOT', preferredDate:'2026-05-10', message:'My MOT is due next month, can I get booked in?', status:'New', source:'Modal', createdAt: new Date(Date.now()-86400000*2).toISOString() },
        { date: new Date(Date.now()-86400000*5).toISOString(), name:'Sarah Connelly', phone:'07891 234567', email:'sconnelly@gmail.com', reg:'DF18 HJK', service:'Full Service', preferredDate:'2026-05-08', message:'Need a full service, car has been making a noise.', status:'Contacted', source:'Contact Form', createdAt: new Date(Date.now()-86400000*5).toISOString() },
        { date: new Date(Date.now()-86400000*10).toISOString(), name:'Michael Porter', phone:'07654 321098', email:'m.porter@work.co.uk', reg:'LM65 PQR', service:'Brakes', preferredDate:'2026-05-07', message:'Brakes squealing badly, urgent.', status:'Completed', source:'Contact Form', createdAt: new Date(Date.now()-86400000*10).toISOString() },
        { date: new Date().toISOString(), name:'Emma Whitfield', phone:'07723 456789', email:'emma.w@hotmail.com', reg:'EF70 TUV', service:'MOT', preferredDate:'2026-05-12', message:'', status:'New', source:'Modal', createdAt: new Date().toISOString() },
        { date: new Date(Date.now()-86400000).toISOString(), name:'Daniel Ashworth', phone:'07834 567890', email:'d.ashworth@email.com', reg:'GH19 WXY', service:'Tyres', preferredDate:'2026-05-09', message:'Need two new front tyres', status:'Booked In', source:'Modal', createdAt: new Date(Date.now()-86400000).toISOString() }
      ];
      await Promise.all(enqs.map(e => db.collection('enquiries').add(e)));
    }

    if (custSnap.empty) {
      const soon    = new Date(Date.now()+86400000*20).toISOString().split('T')[0];
      const overdue = new Date(Date.now()-86400000*15).toISOString().split('T')[0];
      const fine    = new Date(Date.now()+86400000*90).toISOString().split('T')[0];
      const custs = [
        { name:'James Hargreaves', phone:'07712 345678', email:'james.h@email.com', reg:'AB21 XYZ', make:'Ford', model:'Focus', year:'2021', motDue:soon, notes:'Regular customer. Prefers morning appointments.', jobs:[], reminderLog:[], createdAt: new Date().toISOString() },
        { name:'Sarah Connelly', phone:'07891 234567', email:'sconnelly@gmail.com', reg:'DF18 HJK', make:'Vauxhall', model:'Astra', year:'2018', motDue:overdue, notes:'Called regarding service noise — booked in.', jobs:[], reminderLog:[], createdAt: new Date().toISOString() },
        { name:'Michael Porter', phone:'07654 321098', email:'m.porter@work.co.uk', reg:'LM65 PQR', make:'Toyota', model:'Corolla', year:'2015', motDue:fine, notes:'Replaced both front brake pads. Job completed.', jobs:[], reminderLog:[], createdAt: new Date().toISOString() }
      ];
      const custRefs = await Promise.all(custs.map(c => db.collection('customers').add(c)));

      // Seed a demo job
      const jobsSnap = await db.collection('jobs').limit(1).get();
      if (jobsSnap.empty) {
        const michaelId = custRefs[2].id;
        await db.collection('jobs').add({
          customerId: michaelId, customerName:'Michael Porter', reg:'LM65 PQR', serviceType:'Brakes',
          dateIn: new Date(Date.now()-86400000*10).toISOString().split('T')[0],
          dateOut: new Date(Date.now()-86400000*10).toISOString().split('T')[0],
          workRequired:'Replace front brake pads and discs.',
          parts:[{name:'Front brake pads',qty:1,cost:38.00,total:38.00},{name:'Front brake discs (pair)',qty:1,cost:72.00,total:72.00}],
          labourHours:2, labourRate:65, notes:'Test driven — all good.', status:'Complete',
          jobValue:'240.00', completedAt: new Date(Date.now()-86400000*10).toISOString(),
          createdAt: new Date(Date.now()-86400000*10).toISOString()
        });
      }
    }
  } catch (err) {
    console.error('Seed failed', err);
  }
}

// ——— App Loading State ———
function showAppLoader(visible) {
  const el = document.getElementById('appLoader');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

// ——— Expose globals for cross-module access and onclick handlers ———
Object.assign(window, {
  navigate, showToast, formatDate, formatDateTime, esc, statusClass,
  updateEnquiryStatus, deleteEnquiry, markComplete, viewEnquiry,
  viewCustomer, deleteCustomer
});

// ——— Init (Firebase Auth Guard) ———
if (document.getElementById('dashboardApp')) {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      window.location.href = 'login.html';
      return;
    }

    showAppLoader(true);
    try {
      await initSettings();
      await seedDemoData();
    } catch (e) {
      console.error('Init error', e);
    }
    showAppLoader(false);

    // Update UI with user info
    const userNameEl = document.querySelector('.topbar-user-name');
    if (userNameEl) userNameEl.textContent = user.email?.split('@')[0] || 'Admin';
    const brand = document.querySelector('.sidebar-brand-text strong');
    if (brand) brand.textContent = getSettings().garageName;

    document.getElementById('logoutBtn')?.addEventListener('click', () => {
      if (confirm('Are you sure you want to log out?')) {
        auth.signOut().then(() => { window.location.href = 'login.html'; });
      }
    });

    navigate('overview');
  });
}
