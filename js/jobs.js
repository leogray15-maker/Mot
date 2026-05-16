/* ===========================
   GarageOS — Job Card Management
   Multi-tenant, garageRef scoped
   =========================== */

import firebase from 'firebase/compat/app';
import {
  db, garageRef, garageDoc, fsAdd, fsUpdate, fsDel,
  docsToArr, showSpinner, hideSpinner
} from './firebase.js';
import { showToast, formatDate, formatDateTime, esc, getSettings } from './utils.js';

// ——— Module state ———
window._jobsData = window._jobsData || [];
let _jobSearch        = '';
let _jobStatusFilter  = 'all';
let _jobSortField     = 'createdAt';
let _jobSortDir       = 'desc';
let _jobView          = 'list'; // 'list' | 'kanban'
let _openJobId        = null;   // currently open modal job id
let _activeJobTab     = 'vehicle';
let _partRowIdx       = 0;

const STATUSES = ['waiting', 'in_progress', 'awaiting_parts', 'pending_payment', 'complete'];
const STATUS_LABELS = {
  waiting:         'Waiting',
  in_progress:     'In Progress',
  awaiting_parts:  'Awaiting Parts',
  pending_payment: 'Pending Payment',
  complete:        'Complete'
};
const STATUS_BADGE = {
  waiting:         'badge-new',
  in_progress:     'badge-contacted',
  awaiting_parts:  'badge-booked',
  pending_payment: 'badge-pending',
  complete:        'badge-completed'
};
const SERVICE_TYPES = [
  'MOT', 'Full Service', 'Interim Service', 'Oil Change', 'Tyres',
  'Brakes', 'Exhaust', 'Clutch', 'Diagnostics', 'Electrics',
  'Suspension', 'Steering', 'Air Conditioning', 'Welding', 'Other'
];

// ——— VHC checklist items ———
const VHC_SECTIONS = [
  { label: 'Tyres & Wheels', items: ['Tyre condition (FL)', 'Tyre condition (FR)', 'Tyre condition (RL)', 'Tyre condition (RR)', 'Tread depth', 'Wheel condition', 'Spare tyre'] },
  { label: 'Brakes', items: ['Front brake pads', 'Rear brake pads/shoes', 'Front discs', 'Rear discs/drums', 'Handbrake operation', 'Brake fluid level'] },
  { label: 'Lights', items: ['Headlights (main)', 'Headlights (full beam)', 'Rear lights', 'Brake lights', 'Indicators (front)', 'Indicators (rear)', 'Fog lights', 'Number plate light'] },
  { label: 'Steering & Suspension', items: ['Power steering', 'Steering play', 'Front shock absorbers', 'Rear shock absorbers', 'Ball joints', 'Track rod ends'] },
  { label: 'Engine & Underbonnet', items: ['Oil level', 'Coolant level', 'Brake fluid', 'Power steering fluid', 'Washer fluid', 'Battery', 'Air filter', 'Drive belts'] },
  { label: 'Underbody', items: ['Exhaust system', 'Catalytic converter', 'Fuel lines', 'Brake lines', 'Subframe', 'Sills & floor'] },
  { label: 'Interior & Safety', items: ['Seatbelts (all)', 'Horn', 'Wipers & washers', 'Dashboard warning lights', 'Mirrors', 'Interior lights'] }
];

// ——— Helpers ———
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function getEl(id) { return document.getElementById(id); }
function today() { return new Date().toISOString().split('T')[0]; }

function statusBadgeHtml(status) {
  return `<span class="badge ${STATUS_BADGE[status] || 'badge-new'}">${esc(STATUS_LABELS[status] || status)}</span>`;
}

function priorityBadgeHtml(priority) {
  const map = { high: 'badge-pending', urgent: 'badge-cancelled', normal: '' };
  if (!priority || priority === 'normal') return '';
  return `<span class="badge ${map[priority] || ''}">${esc(priority.toUpperCase())}</span>`;
}

// ——— Generate job number ———
async function generateJobNumber() {
  const year = new Date().getFullYear();
  const settingsDoc = garageDoc('settings', 'config');
  let num = 1;
  try {
    num = await db.runTransaction(async t => {
      const snap = await t.get(settingsDoc);
      const n = (snap.exists ? (snap.data().jobCounter || 0) : 0) + 1;
      t.set(settingsDoc, { jobCounter: n }, { merge: true });
      return n;
    });
  } catch (e) {
    num = Date.now();
  }
  return `JB-${year}-${String(num).padStart(4, '0')}`;
}

// ——— DVLA VRM lookup ———
async function lookupVRM(reg) {
  const s = getSettings();
  const apiKey = s.dvlaApiKey || '';
  if (!apiKey) { showToast('No DVLA API key configured in Settings → API Keys', 'info'); return null; }
  try {
    const res = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationNumber: reg.replace(/\s/g, '').toUpperCase() })
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ——— Parts from catalogue search ———
async function searchPartsCatalogue(query) {
  try {
    const snap = await garageRef('parts_catalogue')
      .where('keywords', 'array-contains', query.toLowerCase())
      .limit(10)
      .get();
    return docsToArr(snap);
  } catch {
    return [];
  }
}

// ——— Load jobs ———
async function loadJobs() {
  showSpinner('page-jobs');
  try {
    const snap = await garageRef('jobs').orderBy('createdAt', 'desc').get();
    window._jobsData = docsToArr(snap);
  } catch (e) {
    showToast('Failed to load jobs', 'error');
    console.error('loadJobs', e);
  }
  hideSpinner('page-jobs');
  if (_jobView === 'kanban') renderKanban(window._jobsData);
  else renderJobList(window._jobsData);
}

// ——— Render Kanban ———
function renderKanban(jobs) {
  const container = getEl('jobKanbanBoard');
  if (!container) return;

  const q = _jobSearch.toLowerCase();
  const filtered = jobs.filter(j =>
    !q ||
    (j.customerName || '').toLowerCase().includes(q) ||
    (j.reg || '').toLowerCase().includes(q) ||
    (j.serviceType || '').toLowerCase().includes(q)
  );

  container.innerHTML = STATUSES.map(status => {
    const cols = filtered.filter(j => j.status === status);
    return `
      <div class="kanban-column" data-status="${status}" id="kancol-${status}"
           ondragover="event.preventDefault()" ondrop="window._kanbanDrop(event,'${status}')">
        <div class="kanban-col-header">
          <span>${STATUS_LABELS[status]}</span>
          <span class="kanban-count">${cols.length}</span>
        </div>
        <div class="kanban-cards">
          ${cols.length === 0
            ? `<div class="kanban-empty">No jobs</div>`
            : cols.map(j => `
                <div class="kanban-card priority-${j.priority || 'normal'}"
                     draggable="true"
                     data-id="${j.id}"
                     ondragstart="window._kanbanDragStart(event,'${j.id}')"
                     onclick="openJobModal('${j.id}')">
                  <div class="kanban-card-header">
                    <span class="kanban-job-num">${esc(j.jobNumber || '')}</span>
                    ${priorityBadgeHtml(j.priority)}
                  </div>
                  <div class="kanban-customer">${esc(j.customerName || '—')}</div>
                  <div class="kanban-reg">${esc(j.reg || '—')}</div>
                  <div class="kanban-service">${esc(j.serviceType || '—')}</div>
                  <div class="kanban-card-footer">
                    <span>${j.assignedTech ? esc(j.assignedTech) : '<span class="td-muted">Unassigned</span>'}</span>
                    <span class="kanban-total">${j.total ? '£' + parseFloat(j.total).toFixed(0) : ''}</span>
                  </div>
                </div>`).join('')
          }
        </div>
      </div>`;
  }).join('');
}

// Drag-and-drop helpers exposed on window
let _draggingJobId = null;
window._kanbanDragStart = (e, id) => { _draggingJobId = id; e.dataTransfer.effectAllowed = 'move'; };
window._kanbanDrop = async (e, newStatus) => {
  e.preventDefault();
  if (!_draggingJobId) return;
  const id = _draggingJobId;
  _draggingJobId = null;
  const job = window._jobsData.find(j => j.id === id);
  if (!job || job.status === newStatus) return;
  try {
    await changeJobStatus(id, newStatus);
  } catch (err) {
    showToast('Failed to move job', 'error');
  }
};

// ——— Render Job List (sortable table) ———
function renderJobList(jobs) {
  const q = _jobSearch.toLowerCase();
  let filtered = jobs.filter(j => {
    const matchStatus = _jobStatusFilter === 'all' || j.status === _jobStatusFilter;
    const matchSearch = !q ||
      (j.customerName || '').toLowerCase().includes(q) ||
      (j.reg || '').toLowerCase().includes(q) ||
      (j.serviceType || '').toLowerCase().includes(q) ||
      (j.jobNumber || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  // Sort
  filtered.sort((a, b) => {
    let av = a[_jobSortField] || '';
    let bv = b[_jobSortField] || '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return _jobSortDir === 'asc' ? -1 : 1;
    if (av > bv) return _jobSortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const tbody = getEl('jobsBody');
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><i class="fas fa-screwdriver-wrench"></i>No job cards found.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(j => `
    <tr style="cursor:pointer" onclick="openJobModal('${j.id}')">
      <td class="td-mono">${esc(j.jobNumber || '—')}</td>
      <td class="td-muted">${formatDate(j.createdAt)}</td>
      <td class="td-name">${esc(j.customerName || '—')}</td>
      <td class="td-mono">${esc(j.reg || '—')}</td>
      <td>${esc(j.serviceType || '—')}</td>
      <td>${esc(j.assignedTech || '—')}</td>
      <td>${statusBadgeHtml(j.status)}</td>
      <td style="color:var(--green);font-weight:600">${j.total ? '£' + parseFloat(j.total).toFixed(2) : '—'}</td>
      <td onclick="event.stopPropagation()">
        <div class="action-btns">
          <button class="action-btn" onclick="openJobModal('${j.id}')" title="Open"><i class="fas fa-folder-open"></i></button>
          <button class="action-btn" onclick="printJobCard('${j.id}')" title="Print"><i class="fas fa-print"></i></button>
          <button class="action-btn" onclick="createInvoiceFromJob('${j.id}')" title="Create Invoice"><i class="fas fa-file-invoice-pound"></i></button>
          <button class="action-btn danger" onclick="deleteJob('${j.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

// ——— Compute totals from form state ———
function computeJobTotals() {
  const s = getSettings();
  const vatRegistered = s.vatRegistered || false;

  // Parts
  let partsTotal = 0;
  document.querySelectorAll('.job-part-row').forEach(row => {
    const qty = parseFloat(row.querySelector('.part-qty')?.value) || 0;
    const sp  = parseFloat(row.querySelector('.part-sale-price')?.value) || 0;
    const lineTotal = qty * sp;
    partsTotal += lineTotal;
    const tt = row.querySelector('.part-line-total');
    if (tt) tt.textContent = '£' + lineTotal.toFixed(2);
  });

  // Labour
  const labourHours = parseFloat(getEl('jobLabourHours')?.value) || 0;
  const labourRate  = parseFloat(getEl('jobLabourRate')?.value)  || s.labourRate || 65;
  const labourTotal = labourHours * labourRate;

  const subtotal  = partsTotal + labourTotal;
  const vatAmount = vatRegistered ? subtotal * 0.2 : 0;
  const total     = subtotal + vatAmount;

  setText('jobPartsTotal',  '£' + partsTotal.toFixed(2));
  setText('jobLabourTotal', '£' + labourTotal.toFixed(2));
  setText('jobSubtotal',    '£' + subtotal.toFixed(2));
  setText('jobVAT',         vatRegistered ? '£' + vatAmount.toFixed(2) : 'N/A');
  setText('jobTotal',       '£' + total.toFixed(2));

  return { partsTotal, labourHours, labourRate, labourTotal, subtotal, vatAmount, total };
}

// ——— Add part row to modal ———
function addPartRow(part = {}) {
  const container = getEl('jobPartsRows');
  if (!container) return;
  _partRowIdx++;
  const idx = _partRowIdx;
  const row = document.createElement('div');
  row.className = 'job-part-row';
  row.dataset.partId = part.partId || '';
  row.innerHTML = `
    <input class="part-name form-input" type="text" placeholder="Part name" value="${esc(part.name || '')}" oninput="computeJobTotals()">
    <input class="part-qty form-input" type="number" placeholder="Qty" min="1" step="1" value="${part.qty || 1}" oninput="computeJobTotals()">
    <input class="part-cp form-input" type="number" placeholder="Cost £" step="0.01" value="${part.costPrice || ''}" oninput="computeJobTotals()">
    <input class="part-sale-price form-input" type="number" placeholder="Sale £" step="0.01" value="${part.salePrice || ''}" oninput="computeJobTotals()">
    <span class="part-line-total">£0.00</span>
    <button type="button" class="action-btn danger" title="Remove" onclick="this.closest('.job-part-row').remove();computeJobTotals()"><i class="fas fa-times"></i></button>`;
  container.appendChild(row);
  // Set initial line total
  const qty = part.qty || 1;
  const sp  = part.salePrice || 0;
  row.querySelector('.part-line-total').textContent = '£' + (qty * sp).toFixed(2);
}

// ——— Collect parts from form ———
function collectParts() {
  const parts = [];
  document.querySelectorAll('.job-part-row').forEach(row => {
    const name = row.querySelector('.part-name')?.value?.trim();
    if (!name) return;
    parts.push({
      partId:    row.dataset.partId || '',
      name,
      qty:       parseFloat(row.querySelector('.part-qty')?.value)         || 1,
      costPrice: parseFloat(row.querySelector('.part-cp')?.value)           || 0,
      salePrice: parseFloat(row.querySelector('.part-sale-price')?.value)   || 0
    });
  });
  return parts;
}

// ——— Collect clock log from display ———
function collectClockLog() {
  const j = window._jobsData.find(x => x.id === _openJobId);
  return j?.clockLog || [];
}

// ——— Render VHC checklist ———
function renderVHCTab(vhcData = {}) {
  const container = getEl('jobVHCContent');
  if (!container) return;

  container.innerHTML = VHC_SECTIONS.map(sec => `
    <div class="vhc-section">
      <h4 class="vhc-section-title">${esc(sec.label)}</h4>
      <div class="vhc-items">
        ${sec.items.map(item => {
          const key  = item.replace(/[^a-z0-9]/gi, '_').toLowerCase();
          const val  = vhcData[key] || 'ok';
          return `
            <div class="vhc-item">
              <span class="vhc-item-label">${esc(item)}</span>
              <div class="vhc-radios">
                <label class="vhc-radio ok"><input type="radio" name="vhc_${key}" value="ok" ${val === 'ok' ? 'checked' : ''}> OK</label>
                <label class="vhc-radio advisory"><input type="radio" name="vhc_${key}" value="advisory" ${val === 'advisory' ? 'checked' : ''}> Advisory</label>
                <label class="vhc-radio fail"><input type="radio" name="vhc_${key}" value="fail" ${val === 'fail' ? 'checked' : ''}> Fail</label>
              </div>
            </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

// ——— Collect VHC data from form ———
function collectVHCData() {
  const vhc = {};
  VHC_SECTIONS.forEach(sec => {
    sec.items.forEach(item => {
      const key = item.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const checked = document.querySelector(`input[name="vhc_${key}"]:checked`);
      if (checked) vhc[key] = checked.value;
    });
  });
  return vhc;
}

// ——— Render approvals tab ———
function renderApprovalsTab(approvals = []) {
  const container = getEl('jobApprovalsContent');
  if (!container) return;
  if (approvals.length === 0) {
    container.innerHTML = '<p class="td-muted" style="padding:16px">No photo approvals recorded for this job.</p>';
    return;
  }
  container.innerHTML = approvals.map((a, i) => `
    <div class="approval-item">
      <div class="approval-header">
        <span class="approval-type">${esc(a.type || 'Approval')}</span>
        <span class="approval-date td-muted">${formatDateTime(a.requestedAt)}</span>
        <span class="badge ${a.status === 'approved' ? 'badge-completed' : a.status === 'declined' ? 'badge-cancelled' : 'badge-new'}">${esc(a.status || 'pending')}</span>
      </div>
      ${a.photoUrl ? `<img src="${esc(a.photoUrl)}" alt="approval photo" class="approval-photo">` : ''}
      ${a.notes ? `<p class="approval-notes">${esc(a.notes)}</p>` : ''}
    </div>`).join('');
}

// ——— Render comms tab ———
function renderCommsTab(comms = []) {
  const container = getEl('jobCommsContent');
  if (!container) return;
  if (comms.length === 0) {
    container.innerHTML = '<p class="td-muted" style="padding:16px">No communications logged for this job.</p>';
    return;
  }
  container.innerHTML = comms.map(c => `
    <div class="comms-item">
      <div class="comms-meta">
        <span class="comms-type badge badge-new">${esc(c.type || 'note')}</span>
        <span class="td-muted">${formatDateTime(c.sentAt || c.createdAt)}</span>
        ${c.sentBy ? `<span class="td-muted">by ${esc(c.sentBy)}</span>` : ''}
      </div>
      <div class="comms-body">${esc(c.message || c.body || '')}</div>
    </div>`).join('');
}

// ——— Render labour tab ———
function renderLabourTab(j) {
  const container = getEl('jobLabourContent');
  if (!container) return;
  const s      = getSettings();
  const log    = j?.clockLog || [];
  const actual = j?.actualHours || 0;
  const est    = j?.estimatedHours || 0;

  container.innerHTML = `
    <div class="form-grid">
      <div class="form-group">
        <label>Estimated Hours</label>
        <input id="jobEstimatedHours" type="number" class="form-input" step="0.5" value="${est}" placeholder="e.g. 2.5">
      </div>
      <div class="form-group">
        <label>Actual Hours (from clock log)</label>
        <input id="jobLabourHours" type="number" class="form-input" step="0.25" value="${actual || log.reduce((t,e) => t + (e.hours || 0), 0)}" oninput="computeJobTotals()">
      </div>
      <div class="form-group">
        <label>Labour Rate (£/hr)</label>
        <input id="jobLabourRate" type="number" class="form-input" step="0.5" value="${j?.labourRate || s.labourRate || 65}" oninput="computeJobTotals()">
      </div>
    </div>
    ${log.length > 0 ? `
      <h4 style="margin:16px 0 8px;font-size:0.82rem;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim)">Clock Log</h4>
      <table style="width:100%;font-size:0.82rem;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left;padding:6px 10px;color:var(--text-dim)">Tech</th>
          <th style="padding:6px 10px;color:var(--text-dim)">Clock In</th>
          <th style="padding:6px 10px;color:var(--text-dim)">Clock Out</th>
          <th style="padding:6px 10px;color:var(--text-dim)">Hours</th>
        </tr></thead>
        <tbody>
          ${log.map(e => `
            <tr>
              <td style="padding:6px 10px">${esc(e.tech || '—')}</td>
              <td style="padding:6px 10px">${formatDateTime(e.clockIn)}</td>
              <td style="padding:6px 10px">${e.clockOut ? formatDateTime(e.clockOut) : '<span class="badge badge-new">Active</span>'}</td>
              <td style="padding:6px 10px;font-weight:600">${e.hours ? e.hours.toFixed(2) + 'h' : '—'}</td>
            </tr>`).join('')}
        </tbody>
      </table>` : '<p class="td-muted" style="padding:16px 0">No clock entries yet.</p>'}`;
}

// ——— Open job modal ———
async function openJobModal(id) {
  _openJobId = id;
  window._currentOpenJobId = id;   // expose for inline onclicks
  _activeJobTab = 'vehicle';
  _partRowIdx = 0;

  const modal = getEl('jobModal');
  if (!modal) return;

  let j = id ? (window._jobsData.find(x => x.id === id) || null) : null;

  // If id given but not in memory, fetch
  if (id && !j) {
    try {
      const snap = await garageDoc('jobs', id).get();
      if (snap.exists) j = { id: snap.id, ...snap.data() };
    } catch (e) {
      showToast('Failed to load job', 'error');
      return;
    }
  }

  const s = getSettings();
  const isNew = !j;

  // Heading
  setText('jobModalTitle', isNew ? 'New Job Card' : `Job Card — ${j.jobNumber || j.id}`);

  // Render tab bar
  const tabBar = getEl('jobTabBar');
  const tabNames = ['vehicle', 'job', 'parts', 'labour', 'vhc', 'approvals', 'comms'];
  const tabLabels = {
    vehicle: 'Vehicle', job: 'Job', parts: 'Parts', labour: 'Labour',
    vhc: 'VHC', approvals: 'Approvals', comms: 'Comms'
  };
  if (tabBar) {
    tabBar.innerHTML = tabNames.map(t => `
      <button class="tab-btn ${t === _activeJobTab ? 'active' : ''}" onclick="switchJobTab('${t}')">${tabLabels[t]}</button>`
    ).join('');
  }

  // Render vehicle tab
  renderVehicleTab(j, s);

  // Render other tabs
  renderJobDetailsTab(j, s);
  renderPartsTab(j);
  renderLabourTab(j);
  renderVHCTab(j?.vhcId ? {} : (j?.vhcData || {})); // embedded vhc data
  renderApprovalsTab(j?.approvals || []);
  renderCommsTab(j?.commLog || []);

  // Totals
  computeJobTotals();

  // Status banner
  const statusBanner = getEl('jobStatusBanner');
  if (statusBanner) {
    statusBanner.innerHTML = j
      ? `${statusBadgeHtml(j.status)} ${priorityBadgeHtml(j.priority)} <span class="td-muted" style="font-size:0.8rem">Created ${formatDate(j.createdAt)}</span>`
      : '';
  }

  // Populate clock display
  const timeDisplay = getEl('jobTimeDisplay');
  if (timeDisplay) {
    const actualH = j?.actualHours || 0;
    const quotedH = j?.estimatedHours || 0;
    const h = Math.floor(actualH);
    const m = Math.round((actualH - h) * 60);
    timeDisplay.textContent = `Total: ${h}h ${m}m | Quoted: ${quotedH}h`;
  }
  const clockLogList = getEl('clockLogList');
  if (clockLogList) {
    const log = j?.clockLog || [];
    clockLogList.innerHTML = log.length
      ? log.map(entry => {
          const start = entry.startTime?.toDate ? entry.startTime.toDate() : new Date(entry.startTime || 0);
          const dur   = entry.duration ? `${Math.floor(entry.duration / 60)}h ${entry.duration % 60}m` : '—';
          return `<div style="font-size:0.78rem;color:var(--text-dim);padding:3px 0">
            <i class="fas fa-user-hard-hat"></i> ${esc(entry.techName || '—')} &bull;
            ${start.toLocaleDateString('en-GB')} &bull; ${dur}
          </div>`;
        }).join('')
      : '<div style="font-size:0.78rem;color:var(--text-dim);padding:4px 0">No clock entries yet.</div>';
  }

  window.showModal('jobModal');
  switchJobTab('vehicle');
}

// ——— Render Vehicle Tab ———
function renderVehicleTab(j, s) {
  const container = getEl('jobVehicleContent');
  if (!container) return;
  container.innerHTML = `
    <div class="form-row" style="align-items:flex-end;gap:8px;margin-bottom:16px">
      <div class="form-group" style="flex:1">
        <label>Registration</label>
        <input id="jobReg" class="form-input" type="text" value="${esc(j?.reg || '')}" placeholder="e.g. AB21 XYZ" style="text-transform:uppercase;font-family:monospace;font-size:1.1rem;font-weight:700">
      </div>
      <button type="button" class="btn-sm btn-ghost-sm" onclick="triggerVRMLookup()" style="margin-bottom:2px"><i class="fas fa-search"></i> DVLA Lookup</button>
    </div>
    <div class="form-grid">
      <div class="form-group"><label>Make</label><input id="jobMake" class="form-input" type="text" value="${esc(j?.make || '')}" placeholder="e.g. Ford"></div>
      <div class="form-group"><label>Model</label><input id="jobModel" class="form-input" type="text" value="${esc(j?.model || '')}" placeholder="e.g. Focus"></div>
      <div class="form-group"><label>Year</label><input id="jobYear" class="form-input" type="number" value="${esc(j?.year || '')}" placeholder="e.g. 2019"></div>
      <div class="form-group"><label>Colour</label><input id="jobColour" class="form-input" type="text" value="${esc(j?.colour || '')}"></div>
      <div class="form-group"><label>Fuel Type</label>
        <select id="jobFuel" class="form-input">
          ${['Petrol','Diesel','Electric','Hybrid','LPG','Other'].map(f => `<option ${(j?.fuel||'')=== f ? 'selected' : ''}>${f}</option>`).join('')}
        </select>
      </div>
      <div class="form-group"><label>Engine CC</label><input id="jobEngineCC" class="form-input" type="number" value="${esc(j?.engineCC || '')}" placeholder="e.g. 1600"></div>
      <div class="form-group"><label>Mileage</label><input id="jobMileage" class="form-input" type="number" value="${esc(j?.mileage || '')}" placeholder="Current mileage"></div>
      <div class="form-group"><label>MOT Expiry</label><input id="jobMotExpiry" class="form-input" type="date" value="${esc(j?.motExpiry || '')}"></div>
    </div>
    <div class="form-grid">
      <div class="form-group">
        <label>Customer Name</label>
        <input id="jobCustomerName" class="form-input" type="text" value="${esc(j?.customerName || '')}" placeholder="Search customers…" oninput="searchJobCustomers(this.value)">
        <div id="jobCustomerDropdown" class="autocomplete-dropdown" style="display:none"></div>
      </div>
      <div class="form-group">
        <input id="jobCustomerId" type="hidden" value="${esc(j?.customerId || '')}">
      </div>
    </div>`;
}

// ——— Render Job Details Tab ———
function renderJobDetailsTab(j, s) {
  const container = getEl('jobDetailsContent');
  if (!container) return;
  container.innerHTML = `
    <div class="form-grid">
      <div class="form-group">
        <label>Service Type</label>
        <select id="jobServiceType" class="form-input">
          <option value="">— Select —</option>
          ${SERVICE_TYPES.map(st => `<option ${(j?.serviceType || '') === st ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Status</label>
        <select id="jobStatus" class="form-input">
          ${STATUSES.map(st => `<option value="${st}" ${(j?.status || 'waiting') === st ? 'selected' : ''}>${STATUS_LABELS[st]}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Priority</label>
        <select id="jobPriority" class="form-input">
          <option value="normal" ${(j?.priority || 'normal') === 'normal' ? 'selected' : ''}>Normal</option>
          <option value="high" ${(j?.priority || '') === 'high' ? 'selected' : ''}>High</option>
          <option value="urgent" ${(j?.priority || '') === 'urgent' ? 'selected' : ''}>Urgent</option>
        </select>
      </div>
      <div class="form-group">
        <label>Assigned Technician</label>
        <input id="jobAssignedTech" class="form-input" type="text" value="${esc(j?.assignedTech || '')}" placeholder="Tech name or initials">
      </div>
      <div class="form-group">
        <label>Bay</label>
        <select id="jobBay" class="form-input">
          <option value="">— Any —</option>
          ${[1,2,3,4].map(b => `<option ${(j?.bay || '') == b ? 'selected' : ''}>Bay ${b}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label>Fleet Job?</label>
        <select id="jobIsFleet" class="form-input">
          <option value="false" ${!(j?.isFleet) ? 'selected' : ''}>No</option>
          <option value="true" ${j?.isFleet ? 'selected' : ''}>Yes</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Description / Work Required</label>
      <textarea id="jobDescription" class="form-input" rows="4" placeholder="Describe the work required…">${esc(j?.description || '')}</textarea>
    </div>
    <div class="form-group">
      <label>Notes</label>
      <textarea id="jobNotes" class="form-input" rows="3" placeholder="Internal notes…">${esc(j?.notes || '')}</textarea>
    </div>`;
}

// ——— Render Parts Tab ———
function renderPartsTab(j) {
  const container = getEl('jobPartsTabContent');
  if (!container) return;
  container.innerHTML = `
    <div class="parts-search-bar" style="margin-bottom:12px">
      <input id="partsCatalogueSearch" class="form-input" type="text" placeholder="Search parts catalogue…" oninput="searchJobParts(this.value)">
      <div id="partsCatalogueResults" class="autocomplete-dropdown" style="display:none"></div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 80px 90px 100px 90px 36px;gap:6px;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);padding:0 4px;margin-bottom:4px">
      <span>Part Name</span><span>Qty</span><span>Cost</span><span>Sale Price</span><span>Total</span><span></span>
    </div>
    <div id="jobPartsRows"></div>
    <button type="button" class="btn-sm btn-ghost-sm" style="margin-top:8px" onclick="addPartRow()"><i class="fas fa-plus"></i> Add Part</button>`;

  // Pre-populate existing parts
  (j?.parts || []).forEach(p => addPartRow(p));
  computeJobTotals();
}

// ——— Customer search autocomplete ———
async function searchJobCustomers(q) {
  const dropdown = getEl('jobCustomerDropdown');
  if (!dropdown) return;
  if (!q || q.length < 2) { dropdown.style.display = 'none'; return; }
  const lower = q.toLowerCase();
  const matches = (window._customersData || [])
    .filter(c =>
      (c.name || '').toLowerCase().includes(lower) ||
      (c.reg || '').toLowerCase().includes(lower) ||
      (c.phone || '').includes(q)
    )
    .slice(0, 8);

  if (matches.length === 0) { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matches.map(c => `
    <div class="autocomplete-item" onclick="selectJobCustomer('${c.id}','${esc(c.name)}','${esc(c.reg||'')}')">
      <strong>${esc(c.name)}</strong>
      <span class="td-muted">${esc(c.reg || '—')} · ${esc(c.make || '')} ${esc(c.model || '')}</span>
    </div>`).join('');
  dropdown.style.display = '';
}

function selectJobCustomer(id, name, reg) {
  const nameEl = getEl('jobCustomerName');
  const idEl   = getEl('jobCustomerId');
  const regEl  = getEl('jobReg');
  if (nameEl) nameEl.value = name;
  if (idEl)   idEl.value   = id;
  if (regEl && reg && !regEl.value) regEl.value = reg;

  // Pre-fill vehicle fields from customer record
  const c = (window._customersData || []).find(x => x.id === id);
  if (c) {
    const fields = { jobMake: c.make, jobModel: c.model, jobYear: c.year, jobMotExpiry: c.motDue };
    Object.entries(fields).forEach(([elId, val]) => { const el = getEl(elId); if (el && val && !el.value) el.value = val; });
  }
  const dd = getEl('jobCustomerDropdown');
  if (dd) dd.style.display = 'none';
}

// ——— Parts catalogue search autocomplete ———
async function searchJobParts(q) {
  const dropdown = getEl('partsCatalogueResults');
  if (!dropdown) return;
  if (!q || q.length < 2) { dropdown.style.display = 'none'; return; }
  const parts = await searchPartsCatalogue(q);
  if (parts.length === 0) { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = parts.map(p => `
    <div class="autocomplete-item" onclick="addPartFromCatalogue('${p.id}')">
      <strong>${esc(p.name)}</strong>
      <span class="td-muted">Cost: £${(p.costPrice || 0).toFixed(2)} · Sale: £${(p.salePrice || 0).toFixed(2)}</span>
    </div>`).join('');
  dropdown.style.display = '';
  window._partsCatalogueCache = parts;
}

function addPartFromCatalogue(partId) {
  const parts  = window._partsCatalogueCache || [];
  const p = parts.find(x => x.id === partId);
  if (!p) return;
  addPartRow({ partId: p.id, name: p.name, qty: 1, costPrice: p.costPrice, salePrice: p.salePrice });
  const dd = getEl('partsCatalogueResults');
  if (dd) dd.style.display = 'none';
  const si = getEl('partsCatalogueSearch');
  if (si) si.value = '';
}

// ——— DVLA VRM lookup trigger ———
async function triggerVRMLookup() {
  const regEl = getEl('jobReg');
  if (!regEl || !regEl.value.trim()) { showToast('Enter a registration first', 'info'); return; }
  showToast('Looking up vehicle…', 'info');
  const data = await lookupVRM(regEl.value.trim());
  if (!data) { showToast('Vehicle not found or DVLA API error', 'error'); return; }
  const fields = {
    jobMake:      data.make,
    jobColour:    data.colour,
    jobFuel:      data.fuelType,
    jobEngineCC:  data.engineCapacity,
    jobMotExpiry: data.motExpiryDate ? data.motExpiryDate.split('T')[0] : ''
  };
  Object.entries(fields).forEach(([id, val]) => { const el = getEl(id); if (el && val) el.value = val; });
  if (data.yearOfManufacture) { const el = getEl('jobYear'); if (el) el.value = data.yearOfManufacture; }
  showToast('Vehicle details loaded from DVLA', 'success');
}

// ——— Switch tab ———
function switchJobTab(tab) {
  _activeJobTab = tab;
  document.querySelectorAll('#jobModal .job-tab-panel').forEach(p => p.classList.remove('active'));
  const panel = getEl(`jobTab_${tab}`);
  if (panel) panel.classList.add('active');
  document.querySelectorAll('#jobModal .tab-btn').forEach(b => {
    b.classList.toggle('active', b.onclick?.toString().includes(`'${tab}'`));
  });
}

// ——— Collect form data ———
function collectJobFormData() {
  const s    = getSettings();
  const tots = computeJobTotals();
  const parts = collectParts();
  const vhcData = collectVHCData();

  return {
    reg:           (getEl('jobReg')?.value || '').toUpperCase().trim(),
    make:          getEl('jobMake')?.value?.trim()         || '',
    model:         getEl('jobModel')?.value?.trim()        || '',
    year:          getEl('jobYear')?.value?.trim()         || '',
    colour:        getEl('jobColour')?.value?.trim()       || '',
    fuel:          getEl('jobFuel')?.value                 || '',
    engineCC:      getEl('jobEngineCC')?.value             || '',
    mileage:       getEl('jobMileage')?.value              || '',
    motExpiry:     getEl('jobMotExpiry')?.value            || '',
    customerName:  getEl('jobCustomerName')?.value?.trim() || '',
    customerId:    getEl('jobCustomerId')?.value           || '',
    serviceType:   getEl('jobServiceType')?.value          || '',
    description:   getEl('jobDescription')?.value?.trim()  || '',
    assignedTech:  getEl('jobAssignedTech')?.value?.trim() || '',
    bay:           getEl('jobBay')?.value                  || '',
    status:        getEl('jobStatus')?.value               || 'waiting',
    priority:      getEl('jobPriority')?.value             || 'normal',
    isFleet:       getEl('jobIsFleet')?.value === 'true',
    notes:         getEl('jobNotes')?.value?.trim()        || '',
    estimatedHours: parseFloat(getEl('jobEstimatedHours')?.value) || 0,
    parts,
    labourHours:   tots.labourHours,
    labourRate:    tots.labourRate,
    labourTotal:   tots.labourTotal,
    partsTotal:    tots.partsTotal,
    subtotal:      tots.subtotal,
    vatAmount:     tots.vatAmount,
    total:         tots.total,
    vhcData,
    clockLog:      collectClockLog()
  };
}

// ——— Save job ———
async function saveJob() {
  const data = collectJobFormData();
  if (!data.customerName) { showToast('Customer name is required', 'error'); return; }
  if (!data.reg)          { showToast('Registration is required', 'error'); return; }

  const wasComplete = _openJobId && (window._jobsData.find(j => j.id === _openJobId)?.status !== 'complete') && data.status === 'complete';

  const payload = {
    ...data,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    if (_openJobId) {
      await fsUpdate('jobs', _openJobId, payload);
      const idx = window._jobsData.findIndex(j => j.id === _openJobId);
      if (idx !== -1) Object.assign(window._jobsData[idx], payload);
      showToast('Job card updated', 'success');
    } else {
      payload.jobNumber   = await generateJobNumber();
      payload.garageId    = sessionStorage.getItem('garageId') || '';
      payload.status      = data.status || 'waiting';
      payload.photos      = [];
      payload.approvals   = [];
      payload.commLog     = [];
      payload.invoiceId   = '';
      payload.vhcId       = '';
      payload.createdAt   = firebase.firestore.FieldValue.serverTimestamp();
      const newId = await fsAdd('jobs', payload);
      window._jobsData.unshift({ id: newId, ...payload });
      _openJobId = newId;
      setText('jobModalTitle', `Job Card — ${payload.jobNumber}`);
      showToast(`Job card ${payload.jobNumber} created`, 'success');
    }

    // Update customer on completion
    if (wasComplete && data.customerId) {
      try {
        await fsUpdate('customers', data.customerId, {
          lastVisit:     firebase.firestore.FieldValue.serverTimestamp(),
          lifetimeSpend: firebase.firestore.FieldValue.increment(data.total || 0),
          updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch { /* non-critical */ }
    }

    if (_jobView === 'kanban') renderKanban(window._jobsData);
    else renderJobList(window._jobsData);

  } catch (err) {
    console.error('saveJob', err);
    showToast('Failed to save job card', 'error');
  }
}

// ——— Delete job ———
async function deleteJob(id) {
  if (!confirm('Delete this job card? This cannot be undone.')) return;
  try {
    await fsDel('jobs', id);
    window._jobsData = window._jobsData.filter(j => j.id !== id);
    if (_jobView === 'kanban') renderKanban(window._jobsData);
    else renderJobList(window._jobsData);
    window.closeModal('jobModal');
    showToast('Job card deleted', 'info');
  } catch (err) {
    showToast('Failed to delete job', 'error');
  }
}

// ——— Change job status ———
async function changeJobStatus(id, status) {
  const updates = {
    status,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (status === 'complete') updates.completedAt = firebase.firestore.FieldValue.serverTimestamp();
  await fsUpdate('jobs', id, updates);
  const idx = window._jobsData.findIndex(j => j.id === id);
  if (idx !== -1) Object.assign(window._jobsData[idx], updates);
  showToast(`Status → ${STATUS_LABELS[status]}`, 'success');
  if (_jobView === 'kanban') renderKanban(window._jobsData);
  else renderJobList(window._jobsData);
}

// ——— Print job card ———
function printJobCard(id) {
  const j = window._jobsData.find(x => x.id === id);
  if (!j) return;
  const s = getSettings();
  const partsRows = (j.parts || []).map(p =>
    `<tr><td>${esc(p.name)}</td><td>${p.qty}</td><td>£${parseFloat(p.costPrice || p.cost || 0).toFixed(2)}</td><td>£${parseFloat(p.salePrice || p.cost || 0).toFixed(2)}</td><td>£${(p.qty * (p.salePrice || p.cost || 0)).toFixed(2)}</td></tr>`
  ).join('');
  const vatRow = j.vatAmount > 0 ? `<tr><td colspan="4" style="text-align:right">VAT (20%)</td><td>£${parseFloat(j.vatAmount).toFixed(2)}</td></tr>` : '';

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Job Card — ${esc(j.jobNumber || j.id)}</title>
  <style>
    body{font-family:Arial,sans-serif;max-width:800px;margin:20px auto;color:#111;font-size:13px}
    h1{font-size:20px;margin:0}
    .sub{font-size:12px;color:#666;margin-top:4px}
    table{width:100%;border-collapse:collapse;margin:12px 0}
    th,td{border:1px solid #ddd;padding:8px 10px;text-align:left}
    th{background:#f5f5f5;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:0.5px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}
    .field label{font-size:10px;color:#888;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:2px}
    .field p{font-size:13px;font-weight:600;margin:0}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;background:#1e40af;color:#fff}
    tfoot td{font-weight:700}
    @media print{.no-print{display:none}}
  </style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #222;padding-bottom:12px;margin-bottom:16px">
    <div><h1>${esc(s.garageName)}</h1><div class="sub">${esc(s.address)}<br>${esc(s.phone)} | ${esc(s.email)}</div></div>
    <div style="text-align:right"><div style="font-size:20px;font-weight:900">JOB CARD</div><div style="font-size:15px;font-weight:700;color:#1e40af">${esc(j.jobNumber || '—')}</div><div class="sub">Created: ${formatDate(j.createdAt)}</div></div>
  </div>
  <div class="grid">
    <div>
      <div class="field"><label>Customer</label><p>${esc(j.customerName)}</p></div>
      <div class="field" style="margin-top:8px"><label>Status</label><p><span class="badge">${STATUS_LABELS[j.status] || j.status}</span></p></div>
    </div>
    <div>
      <div class="field"><label>Registration</label><p style="font-family:monospace;font-size:16px">${esc(j.reg || '—')}</p></div>
      <div class="field" style="margin-top:8px"><label>Vehicle</label><p>${esc(j.year || '')} ${esc(j.make || '')} ${esc(j.model || '')}</p></div>
    </div>
    <div><div class="field"><label>Service</label><p>${esc(j.serviceType || '—')}</p></div></div>
    <div><div class="field"><label>Technician</label><p>${esc(j.assignedTech || '—')}</p></div></div>
    <div><div class="field"><label>Bay</label><p>${esc(j.bay || '—')}</p></div></div>
    <div><div class="field"><label>MOT Expiry</label><p>${formatDate(j.motExpiry)}</p></div></div>
    <div><div class="field"><label>Mileage</label><p>${esc(j.mileage ? j.mileage + ' miles' : '—')}</p></div></div>
  </div>
  <div style="margin:12px 0"><strong>Work Description:</strong><p style="color:#444;margin-top:4px">${esc(j.description || j.workRequired || '—')}</p></div>
  <table>
    <thead><tr><th>Part</th><th>Qty</th><th>Cost</th><th>Sale</th><th>Total</th></tr></thead>
    <tbody>${partsRows || '<tr><td colspan="5" style="color:#999;text-align:center">No parts recorded</td></tr>'}</tbody>
    <tfoot>
      <tr><td colspan="4" style="text-align:right">Parts Total</td><td>£${parseFloat(j.partsTotal || 0).toFixed(2)}</td></tr>
      <tr><td colspan="4" style="text-align:right">Labour (${j.labourHours || 0}hrs @ £${j.labourRate || 0}/hr)</td><td>£${parseFloat(j.labourTotal || 0).toFixed(2)}</td></tr>
      <tr><td colspan="4" style="text-align:right">Subtotal</td><td>£${parseFloat(j.subtotal || 0).toFixed(2)}</td></tr>
      ${vatRow}
      <tr><td colspan="4" style="text-align:right;font-size:14px">TOTAL</td><td style="font-size:14px">£${parseFloat(j.total || 0).toFixed(2)}</td></tr>
    </tfoot>
  </table>
  ${j.notes ? `<div style="margin-top:12px;padding:10px;background:#f9f9f9;border-radius:4px"><strong>Notes:</strong> ${esc(j.notes)}</div>` : ''}
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #eee;font-size:10px;color:#aaa;text-align:center">
    Customer signature: _______________________________ Date: _____________
  </div>
  <button class="no-print" onclick="window.print()" style="margin-top:20px;padding:10px 20px;background:#111;color:#fff;border:none;border-radius:4px;font-size:13px;cursor:pointer">Print</button>
  <script>window.onload=()=>window.print();<\/script>
  </body></html>`);
  win.document.close();
}

// ——— Create invoice from job (cross-module hook) ———
async function createInvoiceFromJob(jobId) {
  if (typeof window.openInvoiceModal === 'function') {
    window.openInvoiceModal(null, jobId);
    window.closeModal('jobModal');
  } else {
    showToast('Invoice module not loaded', 'error');
  }
}

// ——— View toggle ———
function setJobView(view) {
  _jobView = view;
  const kanban = getEl('jobKanbanBoard');
  const list   = getEl('jobsTableWrap');
  const btnList   = getEl('jobViewList');
  const btnKanban = getEl('jobViewKanban');
  if (kanban) kanban.style.display = view === 'kanban' ? '' : 'none';
  if (list)   list.style.display   = view === 'list'   ? '' : 'none';
  btnList?.classList.toggle('active',   view === 'list');
  btnKanban?.classList.toggle('active', view === 'kanban');
  if (view === 'kanban') renderKanban(window._jobsData);
  else renderJobList(window._jobsData);
}

// ——— Sort table columns ———
function sortJobList(field) {
  if (_jobSortField === field) _jobSortDir = _jobSortDir === 'asc' ? 'desc' : 'asc';
  else { _jobSortField = field; _jobSortDir = 'asc'; }
  renderJobList(window._jobsData);
}

// ——— Init ———
export function initJobs() {
  // Event listeners (guards against missing elements during lazy load)
  getEl('jobSearch')?.addEventListener('input', e => { _jobSearch = e.target.value; renderJobList(window._jobsData); });
  getEl('jobStatusFilter')?.addEventListener('change', e => { _jobStatusFilter = e.target.value; renderJobList(window._jobsData); });
  getEl('jobViewList')?.addEventListener('click', () => setJobView('list'));
  getEl('jobViewKanban')?.addEventListener('click', () => setJobView('kanban'));
  getEl('newJobBtn')?.addEventListener('click', () => openJobModal(null));
  getEl('saveJobBtn')?.addEventListener('click', saveJob);

  // Modal close is handled globally by ui.js data-modal delegated handler

  getEl('jobDeleteBtn')?.addEventListener('click', () => { if (_openJobId) deleteJob(_openJobId); });
  getEl('jobPrintBtn')?.addEventListener('click', () => { if (_openJobId) printJobCard(_openJobId); });
  getEl('jobInvoiceBtn')?.addEventListener('click', () => { if (_openJobId) createInvoiceFromJob(_openJobId); });

  // Save VHC — persists checklist data as part of the job record
  getEl('saveVhcBtn')?.addEventListener('click', saveJob);

  // Add note to comms log
  getEl('addJobNoteBtn')?.addEventListener('click', async () => {
    const text = getEl('jobNoteText')?.value?.trim();
    if (!text || !_openJobId) return;
    const note = {
      type:    'note',
      message: text,
      sentAt:  new Date().toISOString(),
      sentBy:  window._currentUser?.email?.split('@')[0] || 'Staff'
    };
    try {
      await fsUpdate('jobs', _openJobId, {
        commLog:   firebase.firestore.FieldValue.arrayUnion(note),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      const j = window._jobsData.find(x => x.id === _openJobId);
      if (j) { j.commLog = j.commLog || []; j.commLog.push(note); renderCommsTab(j.commLog); }
      const el = getEl('jobNoteText'); if (el) el.value = '';
      showToast('Note added', 'success');
    } catch (e) {
      showToast('Failed to add note', 'error');
    }
  });

  // Clock On
  getEl('clockOnBtn')?.addEventListener('click', () => {
    if (!_openJobId) return;
    const user     = window._currentUser || {};
    const techName = user.displayName || user.email?.split('@')[0] || 'Technician';
    const techId   = user.uid || 'unknown';
    window.clockOn?.(_openJobId, techId, techName);
  });

  // Clock Off — find the active session for this job
  getEl('clockOffBtn')?.addEventListener('click', async () => {
    if (!_openJobId) return;
    try {
      const snap = await garageRef('technician_sessions')
        .where('jobId', '==', _openJobId).where('endTime', '==', null).limit(1).get();
      if (snap.empty) { showToast('No active clock session for this job', 'info'); return; }
      window.clockOff?.(snap.docs[0].id, _openJobId);
    } catch { showToast('Failed to clock off', 'error'); }
  });

  loadJobs();
}

// ——— Section loader hook ———
window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaders['jobs'] = initJobs;

// ——— Global exports ———
Object.assign(window, {
  openJobModal,
  saveJob,
  deleteJob,
  changeJobStatus,
  printJobCard,
  createInvoiceFromJob,
  switchJobTab,
  addPartRow,
  addPartFromCatalogue,
  computeJobTotals,
  searchJobCustomers,
  selectJobCustomer,
  searchJobParts,
  triggerVRMLookup,
  sortJobList,
  setJobView,
  loadJobs
});
