/* ===========================
   Premier MOT — Job Cards (Firebase)
   =========================== */

import { db, docsToArr, fsAdd, fsUpdate, fsDel, showSpinner, hideSpinner } from './firebase.js';

let jobSearch = '', jobStatusFilter = 'all';
window._jobsData = [];

async function loadJobsSection() {
  showSpinner('page-jobs');
  try {
    const [jobsSnap, custSnap] = await Promise.all([
      db.collection('jobs').orderBy('createdAt','desc').get(),
      window._customersData.length > 0 ? Promise.resolve(null) : db.collection('customers').get()
    ]);
    window._jobsData = docsToArr(jobsSnap);
    if (custSnap) window._customersData = docsToArr(custSnap);
    hideSpinner('page-jobs');
    populateCustomerSelect();
    renderJobsList();
    updateJobLabourTotal();
  } catch (e) {
    hideSpinner('page-jobs');
    showToast('Failed to load jobs', 'error');
  }
}

function populateCustomerSelect() {
  const sel = document.getElementById('jobCustomerSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Select customer —</option>' +
    window._customersData.map(c =>
      `<option value="${c.id}" data-reg="${esc(c.reg||'')}" data-make="${esc(c.make||'')}" data-model="${esc(c.model||'')}">${esc(c.name)} — ${esc(c.reg||'No reg')}</option>`
    ).join('');
}

function renderJobsList() {
  const q = jobSearch.toLowerCase();
  const filtered = window._jobsData.filter(j => {
    const matchStatus = jobStatusFilter === 'all' || j.status === jobStatusFilter;
    const matchSearch = !q || (j.customerName||'').toLowerCase().includes(q) || (j.reg||'').toLowerCase().includes(q) || (j.serviceType||'').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const tbody = document.getElementById('jobsBody');
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i class="fas fa-screwdriver-wrench"></i>No job cards found. Create your first job card above.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(j => `
    <tr>
      <td class="td-muted">${formatDate(j.dateIn)}</td>
      <td class="td-name">${esc(j.customerName||'—')}</td>
      <td class="td-mono">${esc(j.reg||'—')}</td>
      <td>${esc(j.serviceType||'—')}</td>
      <td><span class="badge ${jobStatusBadge(j.status)}">${esc(j.status)}</span></td>
      <td style="color:var(--green);font-weight:600">${j.jobValue ? '£' + parseFloat(j.jobValue).toFixed(2) : '—'}</td>
      <td>${esc(j.dateOut||'—')}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="viewJobModal('${j.id}')" title="View"><i class="fas fa-eye"></i></button>
          <button class="action-btn" onclick="printJobCard('${j.id}')" title="Print"><i class="fas fa-print"></i></button>
          <button class="action-btn" onclick="createInvoiceFromJob('${j.id}')" title="Create Invoice"><i class="fas fa-file-invoice-pound"></i></button>
          <button class="action-btn danger" onclick="deleteJob('${j.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function jobStatusBadge(s) {
  return { 'Pending':'badge-new','In Progress':'badge-contacted','Awaiting Parts':'badge-booked','Complete':'badge-completed' }[s] || 'badge-new';
}

// Parts rows
let partRowCount = 0;
function addPartRow(name = '', qty = 1, cost = 0) {
  const container = document.getElementById('partsContainer');
  if (!container) return;
  partRowCount++;
  const row = document.createElement('div');
  row.className = 'parts-row';
  row.id = `part-${partRowCount}`;
  row.innerHTML = `
    <input type="text" placeholder="Part name" class="part-name" value="${esc(name)}" oninput="updateJobLabourTotal()">
    <input type="number" placeholder="Qty" class="part-qty" value="${qty}" min="1" step="1" oninput="updateJobLabourTotal()">
    <input type="number" placeholder="Unit cost (£)" class="part-cost" value="${cost||''}" min="0" step="0.01" oninput="updateJobLabourTotal()">
    <span class="part-total">£${(qty*cost).toFixed(2)}</span>
    <button type="button" class="action-btn danger" onclick="this.closest('.parts-row').remove();updateJobLabourTotal()"><i class="fas fa-times"></i></button>`;
  container.appendChild(row);
  row.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => {
    const r = inp.closest('.parts-row');
    const q = parseFloat(r.querySelector('.part-qty').value) || 0;
    const c = parseFloat(r.querySelector('.part-cost').value) || 0;
    r.querySelector('.part-total').textContent = '£' + (q * c).toFixed(2);
    updateJobLabourTotal();
  }));
}

function getPartsFromForm() {
  const parts = [];
  document.querySelectorAll('.parts-row').forEach(row => {
    const name = row.querySelector('.part-name')?.value?.trim();
    const qty  = parseFloat(row.querySelector('.part-qty')?.value) || 0;
    const cost = parseFloat(row.querySelector('.part-cost')?.value) || 0;
    if (name) parts.push({ name, qty, cost, total: qty * cost });
  });
  return parts;
}

function updateJobLabourTotal() {
  const parts = getPartsFromForm();
  const partsCost = parts.reduce((t, p) => t + p.total, 0);
  const hours  = parseFloat(document.getElementById('jobLabourHours')?.value) || 0;
  const rate   = parseFloat(document.getElementById('jobLabourRate')?.value)  || 0;
  const labour = hours * rate;
  setText('jobPartsCostDisplay',  '£' + partsCost.toFixed(2));
  setText('jobLabourCostDisplay', '£' + labour.toFixed(2));
  setText('jobTotalDisplay',      '£' + (partsCost + labour).toFixed(2));
}

document.getElementById('jobCustomerSelect')?.addEventListener('change', function() {
  const opt = this.selectedOptions[0];
  if (!opt || !opt.value) return;
  const regInput = document.getElementById('jobReg');
  if (regInput && opt.dataset.reg) regInput.value = opt.dataset.reg;
});

document.getElementById('createJobForm')?.addEventListener('submit', async e => {
  e.preventDefault();
  const s = getSettings();
  const custId = document.getElementById('jobCustomerSelect')?.value || null;
  const cust = custId ? window._customersData.find(c => c.id === custId) : null;
  const parts       = getPartsFromForm();
  const labourHours = parseFloat(document.getElementById('jobLabourHours')?.value) || 0;
  const labourRate  = parseFloat(document.getElementById('jobLabourRate')?.value)  || s.labourRate || 65;
  const jobValue    = (parts.reduce((t,p) => t+p.total, 0) + labourHours * labourRate).toFixed(2);

  const job = {
    customerId:    custId || null,
    customerName:  cust?.name || document.getElementById('jobCustomerSelect')?.selectedOptions[0]?.text?.split(' — ')[0] || 'Unknown',
    reg:           document.getElementById('jobReg')?.value?.toUpperCase() || '',
    serviceType:   document.getElementById('jobServiceType')?.value || '',
    dateIn:        document.getElementById('jobDateIn')?.value || '',
    dateOut:       document.getElementById('jobDateOut')?.value || '',
    workRequired:  document.getElementById('jobWorkRequired')?.value || '',
    parts, labourHours, labourRate,
    notes:         document.getElementById('jobNotes')?.value || '',
    status:        document.getElementById('jobStatus')?.value || 'Pending',
    jobValue,
    createdAt:     new Date().toISOString()
  };

  try {
    const id = await fsAdd('jobs', job);
    window._jobsData.unshift({ id, ...job });
    e.target.reset();
    document.getElementById('partsContainer').innerHTML = '';
    partRowCount = 0;
    updateJobLabourTotal();
    document.getElementById('jobLabourRate').value = s.labourRate || 65;
    renderJobsList();
    if (typeof addNotification === 'function') addNotification('job_complete', `Job card created for ${job.customerName}`, 'jobs');
    showToast('Job card created', 'success');
  } catch (err) {
    showToast('Failed to save job card', 'error');
  }
});

async function deleteJob(id) {
  if (!confirm('Delete this job card?')) return;
  try {
    await fsDel('jobs', id);
    window._jobsData = window._jobsData.filter(j => j.id !== id);
    renderJobsList();
    showToast('Job card deleted', 'info');
  } catch (err) {
    showToast('Failed to delete job', 'error');
  }
}

function viewJobModal(id) {
  const j = window._jobsData.find(x => x.id === id);
  if (!j) return;
  const overlay = document.getElementById('jobDetailModal');
  const content = document.getElementById('jobDetailContent');
  if (!overlay || !content) return;

  const partsHTML = j.parts?.length ? `
    <table style="width:100%;font-size:0.82rem;border-collapse:collapse;margin-top:8px">
      <thead><tr>
        <th style="text-align:left;color:var(--text-dim);padding:4px 8px">Part</th>
        <th style="color:var(--text-dim);padding:4px 8px">Qty</th>
        <th style="color:var(--text-dim);padding:4px 8px">Unit</th>
        <th style="color:var(--text-dim);padding:4px 8px">Total</th>
      </tr></thead>
      <tbody>${j.parts.map(p=>`<tr><td style="padding:4px 8px">${esc(p.name)}</td><td style="padding:4px 8px;text-align:center">${p.qty}</td><td style="padding:4px 8px">£${parseFloat(p.cost).toFixed(2)}</td><td style="padding:4px 8px;font-weight:600">£${parseFloat(p.total).toFixed(2)}</td></tr>`).join('')}</tbody>
    </table>` : '<p style="color:var(--text-dim);font-size:0.85rem">No parts recorded.</p>';

  content.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>Customer</label><p>${esc(j.customerName)}</p></div>
      <div class="detail-item"><label>Vehicle Reg</label><p class="mono">${esc(j.reg||'—')}</p></div>
      <div class="detail-item"><label>Service Type</label><p>${esc(j.serviceType)}</p></div>
      <div class="detail-item"><label>Status</label><p><span class="badge ${jobStatusBadge(j.status)}">${esc(j.status)}</span></p></div>
      <div class="detail-item"><label>Date In</label><p>${formatDate(j.dateIn)}</p></div>
      <div class="detail-item"><label>Expected Out</label><p>${formatDate(j.dateOut)}</p></div>
      <div class="detail-item"><label>Labour</label><p>${j.labourHours}hrs @ £${j.labourRate}/hr = £${((j.labourHours||0)*(j.labourRate||0)).toFixed(2)}</p></div>
      <div class="detail-item"><label>Total Value</label><p style="color:var(--green);font-weight:700;font-size:1.1rem">£${parseFloat(j.jobValue||0).toFixed(2)}</p></div>
    </div>
    <div style="margin:16px 0"><label style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);display:block;margin-bottom:8px">Work Required</label><p style="font-size:0.9rem;color:var(--text-muted);line-height:1.6">${esc(j.workRequired||'—')}</p></div>
    <div style="margin-bottom:16px"><label style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);display:block;margin-bottom:8px">Parts Used</label>${partsHTML}</div>
    ${j.notes ? `<div><label style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);display:block;margin-bottom:8px">Notes</label><p style="font-size:0.88rem;color:var(--text-muted)">${esc(j.notes)}</p></div>` : ''}
    <div style="margin-top:20px">
      <label style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);display:block;margin-bottom:8px">Update Status</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${['Pending','In Progress','Awaiting Parts','Complete'].map(s=>`<button class="btn-sm ${j.status===s?'btn-primary-sm':'btn-ghost-sm'}" onclick="updateJobStatus('${j.id}','${s}',this)">${s}</button>`).join('')}
      </div>
    </div>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <button class="btn-sm btn-ghost-sm" onclick="printJobCard('${j.id}')"><i class="fas fa-print"></i> Print Job Card</button>
      <button class="btn-sm btn-primary-sm" onclick="createInvoiceFromJob('${j.id}');document.getElementById('jobDetailModal').classList.remove('open')"><i class="fas fa-file-invoice-pound"></i> Create Invoice</button>
    </div>`;
  overlay.classList.add('open');
}

async function updateJobStatus(id, status, btn) {
  let updates = { status };
  if (status === 'Complete') {
    const val = prompt('Enter job value (£) for revenue tracking:',
      window._jobsData.find(j => j.id === id)?.jobValue || '');
    if (val !== null) updates.jobValue = String(parseFloat(val) || 0);
    updates.completedAt = new Date().toISOString();
    const j = window._jobsData.find(x => x.id === id);
    if (j?.customerId && typeof promptReviewRequest === 'function') {
      setTimeout(() => promptReviewRequest(j.customerId), 400);
    }
  }
  try {
    await fsUpdate('jobs', id, updates);
    const idx = window._jobsData.findIndex(j => j.id === id);
    if (idx !== -1) Object.assign(window._jobsData[idx], updates);
    btn?.closest('.dash-modal-body')?.querySelectorAll('.btn-sm').forEach(b => b.classList.replace('btn-primary-sm','btn-ghost-sm'));
    btn?.classList.replace('btn-ghost-sm','btn-primary-sm');
    renderJobsList();
    showToast(`Job status updated to "${status}"`, 'success');
  } catch (err) {
    showToast('Failed to update job status', 'error');
  }
}

function printJobCard(id) {
  const j = window._jobsData.find(x => x.id === id);
  if (!j) return;
  const s = getSettings();
  const partsRows = (j.parts||[]).map(p=>`<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>£${parseFloat(p.cost).toFixed(2)}</td><td>£${parseFloat(p.total).toFixed(2)}</td></tr>`).join('');
  const labour    = (j.labourHours||0) * (j.labourRate||0);
  const partsCost = (j.parts||[]).reduce((t,p) => t+p.total, 0);
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Job Card — ${esc(j.customerName)}</title>
  <style>body{font-family:Arial,sans-serif;max-width:800px;margin:20px auto;color:#111;font-size:13px}h1{font-size:20px;margin:0}
  .garage{font-size:12px;color:#666;margin-bottom:24px}table{width:100%;border-collapse:collapse;margin:12px 0}
  th,td{border:1px solid #ddd;padding:8px 10px;text-align:left}th{background:#f5f5f5;font-weight:600}
  tfoot td{font-weight:700}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px}
  .field label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:2px}
  .field p{font-size:13px;font-weight:600}@media print{.no-print{display:none}}</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;border-bottom:2px solid #e02020;padding-bottom:16px">
    <div><h1>${esc(s.garageName)}</h1><div class="garage">${esc(s.address)}<br>${esc(s.phone)} | ${esc(s.email)}</div></div>
    <div style="text-align:right"><div style="color:#e02020;font-size:20px;font-weight:900">JOB CARD</div><div style="font-size:12px;color:#888">Created: ${formatDate(j.createdAt)}</div></div>
  </div>
  <div class="grid">
    <div><div class="field"><label>Customer</label><p>${esc(j.customerName)}</p></div></div>
    <div><div class="field"><label>Vehicle Reg</label><p style="font-family:monospace;font-size:16px">${esc(j.reg||'—')}</p></div></div>
    <div><div class="field"><label>Service Type</label><p>${esc(j.serviceType)}</p></div></div>
    <div><div class="field"><label>Status</label><p>${esc(j.status)}</p></div></div>
    <div><div class="field"><label>Date In</label><p>${formatDate(j.dateIn)}</p></div></div>
    <div><div class="field"><label>Expected Out</label><p>${formatDate(j.dateOut)}</p></div></div>
  </div>
  <div style="margin-bottom:16px"><strong>Work Required:</strong><p style="margin-top:6px;color:#444">${esc(j.workRequired||'—')}</p></div>
  <table><thead><tr><th>Part Description</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
  <tbody>${partsRows||'<tr><td colspan="4" style="color:#999;text-align:center">No parts recorded</td></tr>'}</tbody>
  <tfoot>
    <tr><td colspan="3" style="text-align:right">Parts Total</td><td>£${partsCost.toFixed(2)}</td></tr>
    <tr><td colspan="3" style="text-align:right">Labour (${j.labourHours}hrs @ £${j.labourRate}/hr)</td><td>£${labour.toFixed(2)}</td></tr>
    <tr><td colspan="3" style="text-align:right;font-size:15px">TOTAL</td><td style="font-size:15px;color:#e02020">£${parseFloat(j.jobValue||0).toFixed(2)}</td></tr>
  </tfoot></table>
  ${j.notes?`<div style="margin-top:16px;padding:12px;background:#f9f9f9;border-radius:4px"><strong>Notes:</strong> ${esc(j.notes)}</div>`:''}
  <button class="no-print" onclick="window.print()" style="margin-top:24px;padding:10px 20px;background:#e02020;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer">Print</button>
  <script>window.onload=()=>window.print();<\/script></body></html>`);
  win.document.close();
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function esc(str) { if (!str) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

document.getElementById('jobSearch')?.addEventListener('input', e => { jobSearch = e.target.value; renderJobsList(); });
document.getElementById('jobFilter')?.addEventListener('change', e => { jobStatusFilter = e.target.value; renderJobsList(); });

document.addEventListener('DOMContentLoaded', () => {
  const rateInput = document.getElementById('jobLabourRate');
  if (rateInput) rateInput.value = getSettings().labourRate || 65;
});

document.getElementById('closeJobModal')?.addEventListener('click', () => document.getElementById('jobDetailModal')?.classList.remove('open'));
document.getElementById('jobDetailModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });

window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaders['jobs'] = loadJobsSection;

Object.assign(window, {
  viewJobModal, updateJobStatus, deleteJob, createInvoiceFromJob, printJobCard
});
