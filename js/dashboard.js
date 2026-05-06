/* ===========================
   Premier MOT — Dashboard CRM
   =========================== */

// ===========================
// DATA HELPERS
// ===========================

const ENQUIRIES_KEY = 'premier_enquiries';
const CUSTOMERS_KEY = 'premier_customers';
const SETTINGS_KEY = 'premier_settings';
const CREDENTIALS_KEY = 'premier_admin_credentials';

function getEnquiries() { return JSON.parse(localStorage.getItem(ENQUIRIES_KEY) || '[]'); }
function saveEnquiries(data) { localStorage.setItem(ENQUIRIES_KEY, JSON.stringify(data)); }
function getCustomers() { return JSON.parse(localStorage.getItem(CUSTOMERS_KEY) || '[]'); }
function saveCustomers(data) { localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(data)); }
function getSettings() {
  return JSON.parse(localStorage.getItem(SETTINGS_KEY) || JSON.stringify({
    garageName: 'Premier MOT & Service',
    phone: '01234 567890',
    email: 'info@premiermot.co.uk',
    address: '14 Industrial Way, Chelmsford, Essex, CM1 2AB'
  }));
}
function saveSettings(data) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(data)); }

function getCredentials() {
  return JSON.parse(localStorage.getItem(CREDENTIALS_KEY) || JSON.stringify({ username: 'admin', password: 'premier2024' }));
}
function saveCredentials(data) { localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(data)); }

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) + ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function today() { return new Date().toISOString().split('T')[0]; }

// ===========================
// TOAST NOTIFICATIONS
// ===========================

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

// ===========================
// SIDEBAR NAVIGATION
// ===========================

let currentSection = 'overview';

function navigate(section) {
  currentSection = section;
  document.querySelectorAll('.section-page').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.sidebar-link').forEach(el => el.classList.remove('active'));

  const page = document.getElementById(`page-${section}`);
  if (page) page.classList.add('active');

  const link = document.querySelector(`.sidebar-link[data-section="${section}"]`);
  if (link) link.classList.add('active');

  const breadcrumb = document.querySelector('.topbar-breadcrumb');
  if (breadcrumb) {
    const labels = { overview: 'Overview', enquiries: 'Enquiries', customers: 'Customers', mot: 'MOT Tracker', settings: 'Settings' };
    breadcrumb.innerHTML = `<span>${labels[section] || section}</span>`;
  }

  // Load section data
  const loaders = {
    overview: loadOverview,
    enquiries: loadEnquiries,
    customers: loadCustomers,
    mot: loadMOTTracker,
    settings: loadSettings
  };
  if (loaders[section]) loaders[section]();

  // Close mobile sidebar
  document.querySelector('.sidebar')?.classList.remove('open');
}

document.querySelectorAll('.sidebar-link[data-section]').forEach(link => {
  link.addEventListener('click', () => navigate(link.dataset.section));
});

// Mobile sidebar toggle
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.querySelector('.sidebar');
if (sidebarToggle && sidebar) {
  sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}

// ===========================
// OVERVIEW
// ===========================

function loadOverview() {
  const enquiries = getEnquiries();
  const todayStr = today();

  const totalEl = document.getElementById('stat-total');
  const todayEl = document.getElementById('stat-today');
  const awaitingEl = document.getElementById('stat-awaiting');
  const completedEl = document.getElementById('stat-completed');

  if (totalEl) totalEl.textContent = enquiries.length;
  if (todayEl) todayEl.textContent = enquiries.filter(e => e.date && e.date.startsWith(todayStr)).length;
  if (awaitingEl) awaitingEl.textContent = enquiries.filter(e => e.status === 'New' || e.status === 'Contacted').length;
  if (completedEl) completedEl.textContent = enquiries.filter(e => e.status === 'Completed').length;

  const tbody = document.getElementById('recentEnquiriesBody');
  if (tbody) {
    const recent = [...enquiries].reverse().slice(0, 5);
    if (recent.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="fas fa-inbox"></i>No enquiries yet. They'll appear here when customers submit the contact form.</td></tr>`;
    } else {
      tbody.innerHTML = recent.map(e => `
        <tr>
          <td class="td-muted">${formatDate(e.date)}</td>
          <td class="td-name">${esc(e.name)}</td>
          <td>${esc(e.phone)}</td>
          <td>${esc(e.service)}</td>
          <td><span class="badge ${statusClass(e.status)}">${esc(e.status)}</span></td>
          <td>
            <div class="action-btns">
              <button class="action-btn" onclick="viewEnquiry(${e.id})" title="View details"><i class="fas fa-eye"></i></button>
              <button class="action-btn success" onclick="markComplete(${e.id})" title="Mark complete"><i class="fas fa-check"></i></button>
            </div>
          </td>
        </tr>
      `).join('');
    }
  }

  // Update enquiry badge count
  const badge = document.querySelector('.sidebar-link[data-section="enquiries"] .badge');
  if (badge) {
    const newCount = enquiries.filter(e => e.status === 'New').length;
    badge.textContent = newCount;
    badge.style.display = newCount > 0 ? '' : 'none';
  }
}

// ===========================
// ENQUIRIES
// ===========================

let enquiryFilter = 'all';
let enquirySearch = '';

function loadEnquiries() {
  renderEnquiriesTable();
}

function renderEnquiriesTable() {
  const enquiries = getEnquiries();
  let filtered = enquiries.filter(e => {
    const matchStatus = enquiryFilter === 'all' || e.status === enquiryFilter;
    const q = enquirySearch.toLowerCase();
    const matchSearch = !q ||
      (e.name && e.name.toLowerCase().includes(q)) ||
      (e.email && e.email.toLowerCase().includes(q)) ||
      (e.reg && e.reg.toLowerCase().includes(q)) ||
      (e.phone && e.phone.includes(q));
    return matchStatus && matchSearch;
  }).reverse();

  const tbody = document.getElementById('enquiriesBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i class="fas fa-search"></i>No enquiries match your search.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => `
    <tr>
      <td class="td-muted">${formatDate(e.date)}</td>
      <td class="td-name">${esc(e.name)}</td>
      <td>${esc(e.phone)}</td>
      <td class="td-muted">${esc(e.email)}</td>
      <td class="td-mono">${esc(e.reg || '—')}</td>
      <td>${esc(e.service)}</td>
      <td>
        <select class="status-select" onchange="updateEnquiryStatus(${e.id}, this.value)">
          ${['New','Contacted','Booked In','Completed','Cancelled'].map(s =>
            `<option value="${s}" ${e.status === s ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
      </td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="viewEnquiry(${e.id})" title="View"><i class="fas fa-eye"></i></button>
          <button class="action-btn danger" onclick="deleteEnquiry(${e.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

const enquirySearchInput = document.getElementById('enquirySearch');
if (enquirySearchInput) {
  enquirySearchInput.addEventListener('input', (e) => {
    enquirySearch = e.target.value;
    renderEnquiriesTable();
  });
}

const enquiryFilterSelect = document.getElementById('enquiryFilter');
if (enquiryFilterSelect) {
  enquiryFilterSelect.addEventListener('change', (e) => {
    enquiryFilter = e.target.value;
    renderEnquiriesTable();
  });
}

function updateEnquiryStatus(id, status) {
  const enquiries = getEnquiries();
  const idx = enquiries.findIndex(e => e.id === id);
  if (idx !== -1) {
    enquiries[idx].status = status;
    saveEnquiries(enquiries);
    showToast(`Status updated to "${status}"`, 'success');
  }
}

function deleteEnquiry(id) {
  if (!confirm('Delete this enquiry? This cannot be undone.')) return;
  const enquiries = getEnquiries().filter(e => e.id !== id);
  saveEnquiries(enquiries);
  renderEnquiriesTable();
  showToast('Enquiry deleted', 'info');
}

function markComplete(id) {
  const enquiries = getEnquiries();
  const idx = enquiries.findIndex(e => e.id === id);
  if (idx !== -1) {
    enquiries[idx].status = 'Completed';
    saveEnquiries(enquiries);
    showToast('Marked as Completed', 'success');
    loadOverview();
  }
}

function viewEnquiry(id) {
  const enquiries = getEnquiries();
  const e = enquiries.find(x => x.id === id);
  if (!e) return;

  const overlay = document.getElementById('enquiryDetailModal');
  const content = document.getElementById('enquiryDetailContent');
  if (!overlay || !content) return;

  content.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>Name</label><p>${esc(e.name)}</p></div>
      <div class="detail-item"><label>Phone</label><p>${esc(e.phone)}</p></div>
      <div class="detail-item"><label>Email</label><p>${esc(e.email)}</p></div>
      <div class="detail-item"><label>Vehicle Reg</label><p class="mono">${esc(e.reg || '—')}</p></div>
      <div class="detail-item"><label>Service</label><p>${esc(e.service)}</p></div>
      <div class="detail-item"><label>Preferred Date</label><p>${esc(e.preferredDate || '—')}</p></div>
      <div class="detail-item"><label>Submitted</label><p>${formatDateTime(e.date)}</p></div>
      <div class="detail-item"><label>Source</label><p>${esc(e.source || 'Website')}</p></div>
      <div class="detail-item"><label>Status</label><p><span class="badge ${statusClass(e.status)}">${esc(e.status)}</span></p></div>
    </div>
    ${e.message ? `<div class="detail-item"><label>Message</label><p style="margin-top:8px;color:var(--text-muted);font-size:0.9rem;line-height:1.6">${esc(e.message)}</p></div>` : ''}
  `;

  overlay.classList.add('open');
}

document.getElementById('closeEnquiryModal')?.addEventListener('click', () => {
  document.getElementById('enquiryDetailModal')?.classList.remove('open');
});
document.getElementById('enquiryDetailModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// ===========================
// CUSTOMERS
// ===========================

let customerSearch = '';
let selectedCustomerId = null;

function loadCustomers() {
  renderCustomersList();
}

function renderCustomersList() {
  const customers = getCustomers();
  const q = customerSearch.toLowerCase();
  const filtered = customers.filter(c =>
    !q ||
    c.name.toLowerCase().includes(q) ||
    (c.email && c.email.toLowerCase().includes(q)) ||
    (c.reg && c.reg.toLowerCase().includes(q)) ||
    (c.phone && c.phone.includes(q))
  );

  const tbody = document.getElementById('customersBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fas fa-users"></i>No customers found. Add your first customer above.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => `
    <tr style="cursor:pointer" onclick="viewCustomer(${c.id})">
      <td class="td-name">${esc(c.name)}</td>
      <td>${esc(c.phone)}</td>
      <td class="td-muted">${esc(c.email || '—')}</td>
      <td class="td-mono">${esc(c.reg || '—')}</td>
      <td class="td-muted">${esc(c.make || '')} ${esc(c.model || '')}</td>
      <td class="td-muted">${esc(c.year || '—')}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="event.stopPropagation();viewCustomer(${c.id})" title="View profile"><i class="fas fa-eye"></i></button>
          <button class="action-btn danger" onclick="event.stopPropagation();deleteCustomer(${c.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('');
}

const customerSearchInput = document.getElementById('customerSearch');
if (customerSearchInput) {
  customerSearchInput.addEventListener('input', (e) => {
    customerSearch = e.target.value;
    renderCustomersList();
  });
}

// Add customer form
const addCustomerForm = document.getElementById('addCustomerForm');
if (addCustomerForm) {
  addCustomerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(addCustomerForm);
    const customer = {
      id: Date.now(),
      name: data.get('name'),
      phone: data.get('phone'),
      email: data.get('email'),
      reg: data.get('reg'),
      make: data.get('make'),
      model: data.get('model'),
      year: data.get('year'),
      motDue: data.get('motDue'),
      notes: '',
      jobs: []
    };
    const customers = getCustomers();
    customers.push(customer);
    saveCustomers(customers);
    addCustomerForm.reset();
    renderCustomersList();
    showToast('Customer added successfully', 'success');
    navigate('customers');
  });
}

function deleteCustomer(id) {
  if (!confirm('Delete this customer? This cannot be undone.')) return;
  const customers = getCustomers().filter(c => c.id !== id);
  saveCustomers(customers);
  renderCustomersList();
  showToast('Customer deleted', 'info');
}

function viewCustomer(id) {
  const customers = getCustomers();
  const c = customers.find(x => x.id === id);
  if (!c) return;
  selectedCustomerId = id;

  const overlay = document.getElementById('customerProfileModal');
  const content = document.getElementById('customerProfileContent');
  if (!overlay || !content) return;

  const initials = c.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  content.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">${initials}</div>
      <div class="profile-info">
        <h2>${esc(c.name)}</h2>
        <p>${esc(c.make || '')} ${esc(c.model || '')} ${esc(c.year || '')} &bull; ${esc(c.reg || 'No reg')}</p>
      </div>
    </div>
    <div class="profile-grid">
      <div>
        <h4 style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:16px">Contact Details</h4>
        <div class="info-item"><label>Phone</label><p>${esc(c.phone)}</p></div>
        <div class="info-item"><label>Email</label><p>${esc(c.email || '—')}</p></div>
      </div>
      <div>
        <h4 style="font-size:0.75rem;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:16px">Vehicle Info</h4>
        <div class="info-item"><label>Registration</label><p class="mono" style="font-family:monospace">${esc(c.reg || '—')}</p></div>
        <div class="info-item"><label>Make & Model</label><p>${esc(c.make || '')} ${esc(c.model || '')}</p></div>
        <div class="info-item"><label>Year</label><p>${esc(c.year || '—')}</p></div>
        <div class="info-item"><label>MOT Due</label><p>${c.motDue ? formatDate(c.motDue) : '—'}</p></div>
      </div>
    </div>
    <div style="margin-top:24px">
      <label style="display:block;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);margin-bottom:8px">Notes</label>
      <textarea id="customerNotes" style="width:100%;background:var(--dark-3);border:1px solid var(--border-strong);border-radius:var(--radius);padding:12px;color:var(--white);font-size:0.88rem;font-family:inherit;min-height:80px;resize:vertical" placeholder="Add notes about this customer...">${esc(c.notes || '')}</textarea>
      <button class="btn-sm btn-primary-sm" style="margin-top:8px" onclick="saveCustomerNotes(${c.id})"><i class="fas fa-save"></i> Save Notes</button>
    </div>
  `;

  overlay.classList.add('open');
}

function saveCustomerNotes(id) {
  const notes = document.getElementById('customerNotes')?.value || '';
  const customers = getCustomers();
  const idx = customers.findIndex(c => c.id === id);
  if (idx !== -1) {
    customers[idx].notes = notes;
    saveCustomers(customers);
    showToast('Notes saved', 'success');
  }
}

document.getElementById('closeCustomerModal')?.addEventListener('click', () => {
  document.getElementById('customerProfileModal')?.classList.remove('open');
});
document.getElementById('customerProfileModal')?.addEventListener('click', (e) => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// ===========================
// MOT TRACKER
// ===========================

function loadMOTTracker() {
  const customers = getCustomers();
  const now = new Date();

  let overdue = 0, soon = 0, ok = 0;

  const rows = customers.map(c => {
    if (!c.motDue) return null;
    const due = new Date(c.motDue);
    const daysLeft = Math.round((due - now) / (1000 * 60 * 60 * 24));
    let statusClass, statusLabel, summaryKey;

    if (daysLeft < 0) {
      statusClass = 'mot-overdue'; statusLabel = `${Math.abs(daysLeft)} days overdue`; overdue++;
    } else if (daysLeft <= 30) {
      statusClass = 'mot-soon'; statusLabel = `Due in ${daysLeft} days`; soon++;
    } else {
      statusClass = 'mot-ok'; statusLabel = `Due in ${daysLeft} days`; ok++;
    }

    const msg = encodeURIComponent(`Hi ${c.name}, just a reminder your MOT is due on ${formatDate(c.motDue)} for your ${c.make || ''} ${c.model || ''}. Give us a call on 01234 567890 to book in — Premier MOT & Service`);

    return `
      <tr>
        <td class="td-name">${esc(c.name)}</td>
        <td class="td-mono">${esc(c.reg || '—')}</td>
        <td class="td-muted">${esc(c.make || '')} ${esc(c.model || '')}</td>
        <td>${formatDate(c.motDue)}</td>
        <td><span class="badge ${statusClass}">${statusLabel}</span></td>
        <td>
          <button class="btn-sm btn-success-sm" onclick="sendMotReminder(${c.id})" title="Copy WhatsApp reminder">
            <i class="fab fa-whatsapp"></i> Send Reminder
          </button>
        </td>
      </tr>
    `;
  }).filter(Boolean);

  const tbody = document.getElementById('motBody');
  if (tbody) {
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="table-empty"><i class="fas fa-car"></i>No customers with MOT dates. Add MOT due dates when adding customers.</td></tr>`;
    } else {
      tbody.innerHTML = rows.join('');
    }
  }

  const overdueEl = document.getElementById('mot-overdue');
  const soonEl = document.getElementById('mot-soon');
  const okEl = document.getElementById('mot-ok');
  if (overdueEl) overdueEl.textContent = overdue;
  if (soonEl) soonEl.textContent = soon;
  if (okEl) okEl.textContent = ok;
}

function sendMotReminder(id) {
  const customers = getCustomers();
  const c = customers.find(x => x.id === id);
  if (!c) return;

  const msg = `Hi ${c.name}, just a reminder your MOT is due on ${formatDate(c.motDue)} for your ${c.make || ''} ${c.model || ''}. Give us a call on 01234 567890 to book in — Premier MOT & Service`;

  navigator.clipboard.writeText(msg).then(() => {
    showToast('WhatsApp message copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback
    const ta = document.createElement('textarea');
    ta.value = msg;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Message copied to clipboard!', 'success');
  });
}

// ===========================
// SETTINGS
// ===========================

function loadSettings() {
  const settings = getSettings();
  const creds = getCredentials();

  const fields = ['settingGarageName', 'settingPhone', 'settingEmail', 'settingAddress'];
  const keys = ['garageName', 'phone', 'email', 'address'];
  fields.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.value = settings[keys[i]] || '';
  });

  const usernameEl = document.getElementById('settingUsername');
  if (usernameEl) usernameEl.value = creds.username || 'admin';
}

const settingsForm = document.getElementById('settingsGarageForm');
if (settingsForm) {
  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const settings = {
      garageName: document.getElementById('settingGarageName')?.value || '',
      phone: document.getElementById('settingPhone')?.value || '',
      email: document.getElementById('settingEmail')?.value || '',
      address: document.getElementById('settingAddress')?.value || ''
    };
    saveSettings(settings);

    // Update sidebar brand name
    const brandStrong = document.querySelector('.sidebar-brand-text strong');
    if (brandStrong) brandStrong.textContent = settings.garageName;

    showToast('Garage details saved', 'success');
  });
}

const passwordForm = document.getElementById('settingsPasswordForm');
if (passwordForm) {
  passwordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const currentEl = document.getElementById('currentPassword');
    const newEl = document.getElementById('newPassword');
    const confirmEl = document.getElementById('confirmPassword');
    if (!currentEl || !newEl || !confirmEl) return;

    const creds = getCredentials();
    if (currentEl.value !== creds.password) {
      showToast('Current password is incorrect', 'error');
      currentEl.value = '';
      return;
    }
    if (newEl.value !== confirmEl.value) {
      showToast('New passwords do not match', 'error');
      newEl.value = ''; confirmEl.value = '';
      return;
    }
    if (newEl.value.length < 6) {
      showToast('Password must be at least 6 characters', 'error');
      return;
    }
    saveCredentials({ username: creds.username, password: newEl.value });
    passwordForm.reset();
    showToast('Password updated successfully', 'success');
  });
}

// ===========================
// UTILITIES
// ===========================

function statusClass(status) {
  const map = { 'New': 'badge-new', 'Contacted': 'badge-contacted', 'Booked In': 'badge-booked', 'Completed': 'badge-completed', 'Cancelled': 'badge-cancelled' };
  return map[status] || 'badge-new';
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Quick action buttons
document.getElementById('quickAddCustomer')?.addEventListener('click', () => navigate('customers'));
document.getElementById('quickViewEnquiries')?.addEventListener('click', () => navigate('enquiries'));

// ===========================
// SEED DEMO DATA
// ===========================

function seedDemoData() {
  const existingEnquiries = getEnquiries();
  const existingCustomers = getCustomers();

  if (existingEnquiries.length === 0) {
    const demoEnquiries = [
      { id: 1700000001, date: new Date(Date.now() - 86400000 * 2).toISOString(), name: 'James Hargreaves', phone: '07712 345678', email: 'james.h@email.com', reg: 'AB21 XYZ', service: 'MOT', preferredDate: '2026-05-10', message: 'My MOT is due next month, can I get booked in?', status: 'New', source: 'Modal' },
      { id: 1700000002, date: new Date(Date.now() - 86400000 * 5).toISOString(), name: 'Sarah Connelly', phone: '07891 234567', email: 'sconnelly@gmail.com', reg: 'DF18 HJK', service: 'Full Service', preferredDate: '2026-05-08', message: 'Need a full service, car has been making a noise.', status: 'Contacted', source: 'Contact Form' },
      { id: 1700000003, date: new Date(Date.now() - 86400000 * 10).toISOString(), name: 'Michael Porter', phone: '07654 321098', email: 'm.porter@work.co.uk', reg: 'LM65 PQR', service: 'Brakes', preferredDate: '2026-05-07', message: 'Brakes squealing badly, urgent.', status: 'Completed', source: 'Contact Form' },
      { id: 1700000004, date: new Date().toISOString(), name: 'Emma Whitfield', phone: '07723 456789', email: 'emma.w@hotmail.com', reg: 'EF70 TUV', service: 'MOT', preferredDate: '2026-05-12', message: '', status: 'New', source: 'Modal' },
      { id: 1700000005, date: new Date(Date.now() - 86400000 * 1).toISOString(), name: 'Daniel Ashworth', phone: '07834 567890', email: 'd.ashworth@email.com', reg: 'GH19 WXY', service: 'Tyres', preferredDate: '2026-05-09', message: 'Need two new front tyres', status: 'Booked In', source: 'Modal' }
    ];
    saveEnquiries(demoEnquiries);
  }

  if (existingCustomers.length === 0) {
    const soon = new Date(Date.now() + 86400000 * 20).toISOString().split('T')[0];
    const overdue = new Date(Date.now() - 86400000 * 15).toISOString().split('T')[0];
    const fine = new Date(Date.now() + 86400000 * 90).toISOString().split('T')[0];

    const demoCustomers = [
      { id: 2000000001, name: 'James Hargreaves', phone: '07712 345678', email: 'james.h@email.com', reg: 'AB21 XYZ', make: 'Ford', model: 'Focus', year: '2021', motDue: soon, notes: 'Regular customer. Prefers morning appointments.', jobs: [] },
      { id: 2000000002, name: 'Sarah Connelly', phone: '07891 234567', email: 'sconnelly@gmail.com', reg: 'DF18 HJK', make: 'Vauxhall', model: 'Astra', year: '2018', motDue: overdue, notes: 'Called regarding service noise — booked in.', jobs: [] },
      { id: 2000000003, name: 'Michael Porter', phone: '07654 321098', email: 'm.porter@work.co.uk', reg: 'LM65 PQR', make: 'Toyota', model: 'Corolla', year: '2015', motDue: fine, notes: 'Replaced both front brake pads. Job completed.', jobs: [] }
    ];
    saveCustomers(demoCustomers);
  }
}

// ===========================
// INIT
// ===========================

seedDemoData();
navigate('overview');
