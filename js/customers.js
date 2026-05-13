/* ===========================
   GarageOS — Customers (Multi-Tenant)
   =========================== */

import { getGarageId, garageRef, garageDoc, db, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, formatCurrency, esc, countdown, debounce } from './utils.js';
import { showModal, closeModal, showEmptyState, showConfirm } from './ui.js';

const FieldValue = firebase.firestore.FieldValue;
let allCustomers = [];
let editingCustomerId = null;

// ——— Init ———
export async function initCustomers() {
  setupCustomerUI();
  await loadCustomers();
}

async function loadCustomers() {
  try {
    const snap = await garageRef('customers').orderBy('name').get();
    allCustomers = docsToArr(snap);
    renderCustomersTable(allCustomers);
  } catch (err) {
    console.error(err);
    showToast('Failed to load customers', 'error');
  }
}

function setupCustomerUI() {
  document.getElementById('newCustomerBtn')?.addEventListener('click', () => openCustomerModal(null));
  document.getElementById('saveCustomerBtn')?.addEventListener('click', saveCustomer);
  document.getElementById('exportCustomersBtn')?.addEventListener('click', exportCustomerCSV);
  document.getElementById('addVehicleBtn')?.addEventListener('click', addVehicleRow);
  document.getElementById('addCustNoteBtn')?.addEventListener('click', addCustomerNote);
  document.getElementById('custIsFleet')?.addEventListener('change', e => {
    document.getElementById('fleetNameGroup').style.display = e.target.checked ? '' : 'none';
  });

  const search = document.getElementById('customerSearch');
  const filter = document.getElementById('customerFilter');
  const doFilter = debounce(() => {
    let result = [...allCustomers];
    const q = search?.value.trim().toLowerCase();
    const f = filter?.value;
    if (q) result = result.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      c.vehicles?.some(v => v.reg?.toLowerCase().includes(q))
    );
    if (f === 'fleet') result = result.filter(c => c.isFleet);
    if (f === 'noshows') result = result.filter(c => (c.noShowCount || 0) > 0);
    renderCustomersTable(result);
  }, 200);
  search?.addEventListener('input', doFilter);
  filter?.addEventListener('change', doFilter);
}

// ——— Table ———
function renderCustomersTable(customers) {
  const tbody = document.getElementById('customersTbody');
  if (!tbody) return;
  if (!customers.length) {
    showEmptyState('customersTbody', { icon: 'fa-users', title: 'No customers yet', subtitle: 'Add your first customer to get started.', actionText: 'Add Customer', onAction: () => openCustomerModal(null) });
    return;
  }
  tbody.innerHTML = customers.map(c => {
    const vehicles = c.vehicles || [];
    const firstVehicle = vehicles[0];
    const mot = firstVehicle?.motDue ? countdown(firstVehicle.motDue) : null;
    const motHtml = mot ? `<span class="mot-badge mot-${mot.status}" title="${mot.label}">${firstVehicle.reg}</span>` : (firstVehicle?.reg || '—');
    const noShowWarning = (c.noShowCount || 0) > 0 ? `<i class="fas fa-exclamation-triangle text-warning" title="${c.noShowCount} no-shows"></i> ` : '';
    return `<tr>
      <td>${noShowWarning}<a href="#" onclick="openCustomerById('${c.id}')" class="link-text">${esc(c.name)}</a>${c.isFleet ? ' <span class="badge-fleet">Fleet</span>' : ''}</td>
      <td><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a></td>
      <td><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></td>
      <td>${vehicles.map(v => `<span class="reg-chip">${esc(v.reg)}</span>`).join(' ')}</td>
      <td>${motHtml}</td>
      <td>${c.lastVisit ? formatDate(c.lastVisit) : '—'}</td>
      <td>${formatCurrency(c.lifetimeSpend || 0)}</td>
      <td class="actions-cell">
        <button class="btn-icon" title="Edit" onclick="openCustomerById('${c.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-icon btn-wa" title="WhatsApp" onclick="waCustomer('${c.id}')"><i class="fab fa-whatsapp"></i></button>
        <button class="btn-icon btn-danger-icon" title="Delete" onclick="deleteCustomer('${c.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// ——— Modal ———
export async function openCustomerModal(id) {
  editingCustomerId = id || null;
  clearCustomerForm();

  if (id) {
    try {
      const doc = await garageDoc('customers', id).get();
      if (!doc.exists) { showToast('Customer not found', 'error'); return; }
      const c = { id: doc.id, ...doc.data() };
      document.getElementById('customerId').value = id;
      document.getElementById('custName').value   = c.name || '';
      document.getElementById('custPhone').value  = c.phone || '';
      document.getElementById('custEmail').value  = c.email || '';
      document.getElementById('custDob').value    = c.dob || '';
      document.getElementById('custAddress').value = c.address || '';
      document.getElementById('custIsFleet').checked = c.isFleet || false;
      document.getElementById('custFleetName').value  = c.fleetName || '';
      document.getElementById('custNoShows').value    = c.noShowCount || 0;
      document.getElementById('custStatus').value     = c.status || 'active';
      if (c.isFleet) document.getElementById('fleetNameGroup').style.display = '';
      renderVehiclesList(c.vehicles || []);
      loadCustomerJobHistory(id);
      loadCustomerInvoices(id);
      loadCustomerComms(id);
      document.getElementById('customerModalTitle').textContent = c.name;
    } catch (err) {
      showToast('Failed to load customer', 'error');
    }
  } else {
    document.getElementById('customerModalTitle').textContent = 'New Customer';
    renderVehiclesList([]);
  }
  showModal('customerModal');
}

window.openCustomerById = (id) => openCustomerModal(id);

function clearCustomerForm() {
  ['customerId','custName','custPhone','custEmail','custDob','custAddress','custFleetName'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('custIsFleet').checked = false;
  document.getElementById('custNoShows').value = 0;
  document.getElementById('custStatus').value = 'active';
  document.getElementById('fleetNameGroup').style.display = 'none';
  document.getElementById('vehiclesList').innerHTML = '';
  document.getElementById('custJobHistory').innerHTML = '';
  document.getElementById('custInvoiceList').innerHTML = '';
  document.getElementById('custCommsTimeline').innerHTML = '';
}

// ——— Vehicles ———
function renderVehiclesList(vehicles) {
  const el = document.getElementById('vehiclesList');
  if (!el) return;
  el.innerHTML = vehicles.map((v, i) => renderVehicleRow(v, i)).join('');
}

function renderVehicleRow(v, idx) {
  const mot = v.motDue ? countdown(v.motDue) : null;
  return `<div class="vehicle-row card" data-vehicle-idx="${idx}">
    <div class="vehicle-row-top">
      <span class="uk-plate">${esc(v.reg || '—')}</span>
      <span>${esc(v.year || '')} ${esc(v.make || '')} ${esc(v.model || '')}</span>
      ${mot ? `<span class="mot-badge mot-${mot.status}">${mot.label}</span>` : ''}
      <button type="button" class="btn-icon btn-danger-icon" onclick="removeVehicleRow(${idx})"><i class="fas fa-trash"></i></button>
    </div>
    <div class="vehicle-fields form-grid">
      <div class="form-group"><label>Reg</label><input type="text" class="form-input v-reg" value="${esc(v.reg||'')}" placeholder="AB12 CDE"></div>
      <div class="form-group"><label>Make</label><input type="text" class="form-input v-make" value="${esc(v.make||'')}"></div>
      <div class="form-group"><label>Model</label><input type="text" class="form-input v-model" value="${esc(v.model||'')}"></div>
      <div class="form-group"><label>Year</label><input type="text" class="form-input v-year" value="${esc(v.year||'')}"></div>
      <div class="form-group"><label>Fuel</label><input type="text" class="form-input v-fuel" value="${esc(v.fuel||'')}"></div>
      <div class="form-group"><label>Colour</label><input type="text" class="form-input v-colour" value="${esc(v.colour||'')}"></div>
      <div class="form-group"><label>MOT Expiry</label><input type="date" class="form-input v-motdue" value="${esc(v.motDue||'')}"></div>
      <div class="form-group"><label>Mileage</label><input type="number" class="form-input v-mileage" value="${esc(String(v.mileage||''))}"></div>
    </div>
  </div>`;
}

function addVehicleRow() {
  const el = document.getElementById('vehiclesList');
  if (!el) return;
  const idx = el.querySelectorAll('.vehicle-row').length;
  const div = document.createElement('div');
  div.innerHTML = renderVehicleRow({}, idx);
  el.appendChild(div.firstElementChild);
}

window.removeVehicleRow = (idx) => {
  document.querySelector(`.vehicle-row[data-vehicle-idx="${idx}"]`)?.remove();
};

function collectVehicles() {
  return Array.from(document.querySelectorAll('.vehicle-row')).map(row => ({
    reg:    row.querySelector('.v-reg')?.value.trim().toUpperCase() || '',
    make:   row.querySelector('.v-make')?.value.trim() || '',
    model:  row.querySelector('.v-model')?.value.trim() || '',
    year:   row.querySelector('.v-year')?.value.trim() || '',
    fuel:   row.querySelector('.v-fuel')?.value.trim() || '',
    colour: row.querySelector('.v-colour')?.value.trim() || '',
    motDue: row.querySelector('.v-motdue')?.value || '',
    mileage: parseInt(row.querySelector('.v-mileage')?.value || '0', 10)
  })).filter(v => v.reg);
}

// ——— Save ———
async function saveCustomer() {
  const btn = document.getElementById('saveCustomerBtn');
  const name = document.getElementById('custName')?.value.trim();
  if (!name) { showToast('Customer name is required', 'warning'); return; }

  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';

  const data = {
    name,
    phone:       document.getElementById('custPhone')?.value.trim() || '',
    email:       document.getElementById('custEmail')?.value.trim() || '',
    dob:         document.getElementById('custDob')?.value || '',
    address:     document.getElementById('custAddress')?.value.trim() || '',
    isFleet:     document.getElementById('custIsFleet')?.checked || false,
    fleetName:   document.getElementById('custFleetName')?.value.trim() || '',
    status:      document.getElementById('custStatus')?.value || 'active',
    vehicles:    collectVehicles(),
    updatedAt:   FieldValue.serverTimestamp()
  };

  try {
    const id = editingCustomerId;
    if (id) {
      await garageDoc('customers', id).update(data);
      showToast('Customer updated', 'success');
    } else {
      data.createdAt     = FieldValue.serverTimestamp();
      data.noShowCount   = 0;
      data.lifetimeSpend = 0;
      data.lastVisit     = '';
      const ref = await garageRef('customers').add(data);
      editingCustomerId  = ref.id;
      showToast('Customer created', 'success');
    }
    closeModal('customerModal');
    await loadCustomers();
  } catch (err) {
    console.error(err);
    showToast('Failed to save customer', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Save Customer';
  }
}

// ——— Delete ———
window.deleteCustomer = async (id) => {
  const confirmed = await showConfirm({ title: 'Delete Customer', message: 'This will permanently delete the customer record. Are you sure?', confirmText: 'Delete', danger: true });
  if (!confirmed) return;
  try {
    await garageDoc('customers', id).delete();
    showToast('Customer deleted', 'success');
    allCustomers = allCustomers.filter(c => c.id !== id);
    renderCustomersTable(allCustomers);
  } catch (err) {
    showToast('Failed to delete customer', 'error');
  }
};

// ——— History / Invoices / Comms ———
async function loadCustomerJobHistory(customerId) {
  const el = document.getElementById('custJobHistory');
  if (!el) return;
  try {
    const snap = await garageRef('jobs').where('customerId','==',customerId).orderBy('createdAt','desc').get();
    const jobs = docsToArr(snap);
    if (!jobs.length) { el.innerHTML = '<p class="text-muted">No job history yet.</p>'; return; }
    el.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Service</th><th>Reg</th><th>Status</th><th>Total</th></tr></thead><tbody>${
      jobs.map(j => `<tr><td>${j.createdAt?.toDate ? formatDate(j.createdAt.toDate().toISOString()) : '—'}</td><td>${esc(j.serviceType||j.service||'')}</td><td>${esc(j.reg||'')}</td><td>${esc(j.status||'')}</td><td>${formatCurrency(j.total||0)}</td></tr>`).join('')
    }</tbody></table></div>`;
  } catch {}
}

async function loadCustomerInvoices(customerId) {
  const el = document.getElementById('custInvoiceList');
  if (!el) return;
  try {
    const snap = await garageRef('invoices').where('customerId','==',customerId).orderBy('createdAt','desc').get();
    const invs = docsToArr(snap);
    const total = invs.reduce((s, i) => s + (i.total || 0), 0);
    const unpaid = invs.reduce((s, i) => s + (i.balance || 0), 0);
    el.innerHTML = `<div class="customer-spend-summary"><span>Total Spend: <strong>${formatCurrency(total)}</strong></span><span>Outstanding: <strong class="text-danger">${formatCurrency(unpaid)}</strong></span></div>
    <div class="table-wrap"><table class="data-table"><thead><tr><th>Invoice #</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>${
      invs.map(i => `<tr><td>${esc(i.invoiceNumber||'')}</td><td>${i.createdAt?.toDate ? formatDate(i.createdAt.toDate().toISOString()) : '—'}</td><td>${formatCurrency(i.total||0)}</td><td><span class="badge-status badge-${i.status}">${esc(i.status||'')}</span></td></tr>`).join('')
    }</tbody></table></div>`;
  } catch {}
}

async function loadCustomerComms(customerId) {
  const el = document.getElementById('custCommsTimeline');
  if (!el) return;
  try {
    const snap = await garageRef('comms_log').where('customerId','==',customerId).orderBy('createdAt','desc').limit(50).get();
    const logs = docsToArr(snap);
    if (!logs.length) { el.innerHTML = '<p class="text-muted">No communications logged.</p>'; return; }
    el.innerHTML = logs.map(log => {
      const icons = { whatsapp:'fa-whatsapp fab text-wa', email:'fa-envelope', booking:'fa-calendar', mot_reminder:'fa-car', invoice_sent:'fa-file-invoice', note:'fa-sticky-note' };
      const icon = icons[log.type] || 'fa-comment';
      const ts = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt);
      return `<div class="comms-entry">
        <div class="comms-icon"><i class="fas ${icon}"></i></div>
        <div class="comms-body">
          <div class="comms-meta"><span class="comms-type">${esc(log.type||'')}</span><span class="comms-time">${ts.toLocaleString('en-GB')}</span></div>
          <div class="comms-content">${esc(log.content || '')}</div>
        </div>
      </div>`;
    }).join('');
  } catch {}
}

async function addCustomerNote() {
  const text = document.getElementById('custNoteText')?.value.trim();
  if (!text || !editingCustomerId) return;
  try {
    await garageRef('comms_log').add({ customerId: editingCustomerId, type: 'note', direction: 'internal', content: text, createdAt: FieldValue.serverTimestamp() });
    document.getElementById('custNoteText').value = '';
    showToast('Note added', 'success');
    loadCustomerComms(editingCustomerId);
  } catch (err) {
    showToast('Failed to add note', 'error');
  }
}

// ——— WhatsApp shortcut ———
window.waCustomer = (id) => {
  const c = allCustomers.find(x => x.id === id);
  if (!c?.phone) return showToast('No phone number', 'warning');
  const phone = c.phone.replace(/\s/g,'').replace(/^0/,'44');
  window.open(`https://wa.me/${phone}`, '_blank');
};

// ——— CSV Export ———
function exportCustomerCSV() {
  const rows = [['Name','Phone','Email','Vehicles','MOT Due','Last Visit','Lifetime Spend']];
  allCustomers.forEach(c => {
    const vehs = (c.vehicles||[]).map(v=>v.reg).join('; ');
    const mot  = (c.vehicles||[])[0]?.motDue || '';
    rows.push([c.name||'', c.phone||'', c.email||'', vehs, mot, c.lastVisit||'', String(c.lifetimeSpend||0)]);
  });
  const csv = rows.map(r => r.map(f => `"${String(f).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a   = document.createElement('a');
  a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download= 'customers.csv';
  a.click();
}

// ——— Search helper for autocomplete (used by jobs/bookings) ———
export async function searchCustomersFor(query) {
  const q = query.trim().toLowerCase();
  return allCustomers.filter(c =>
    c.name?.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q)
  ).slice(0, 8);
}

export { allCustomers };
