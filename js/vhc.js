/* ===========================
   MOT Car Repairs — VHC Dashboard Logic + Public Report
   =========================== */

import { db, garageRef, garageDoc, getGarageId, docsToArr, fsAdd, fsUpdate, showSpinner, hideSpinner } from './firebase.js';
import firebase from 'firebase/compat/app';

// ——— VHC Checklist Definition ———

const VHC_CHECKLIST = [
  { category: 'BRAKES',     items: ['Front Pads','Rear Pads','Front Discs','Rear Discs','Handbrake','Brake Fluid Level','Brake Fluid Condition'] },
  { category: 'TYRES',      items: ['NSF Tread','OSF Tread','NSR Tread','OSR Tread','Spare Tyre','Tyre Pressures','Sidewall Condition'] },
  { category: 'LIGHTS',     items: ['Headlights','Rear Lights','Brake Lights','Front Indicators','Rear Indicators','Hazards','Reverse','Fog'] },
  { category: 'FLUIDS',     items: ['Engine Oil Level','Oil Condition','Coolant','Power Steering Fluid','Washer Fluid','Gearbox Oil'] },
  { category: 'VISUAL',     items: ['Wipers','Horn','Mirrors','Seatbelts','Warning Lights','Battery','Air Filter'] },
  { category: 'SUSPENSION', items: ['Front Shocks','Rear Shocks','Front Bushes','Rear Bushes','CV Joints','Wheel Bearings','Steering'] },
  { category: 'EXHAUST',    items: ['Condition','Security','Emissions','Catalyst'] },
  { category: 'BODYWORK',   items: ['Corrosion','Screen Chips','Wiper Mechanism'] }
];

const CATEGORY_ICONS = {
  BRAKES: 'fa-circle-stop', TYRES: 'fa-tire', LIGHTS: 'fa-lightbulb',
  FLUIDS: 'fa-droplet', VISUAL: 'fa-eye', SUSPENSION: 'fa-car-shock',
  EXHAUST: 'fa-smog', BODYWORK: 'fa-car-side'
};

// Build a flat default items array from the checklist definition
function buildDefaultItems() {
  const items = [];
  VHC_CHECKLIST.forEach(cat => {
    cat.items.forEach(name => {
      items.push({ category: cat.category, name, status: 'green', notes: '', photoUrl: '' });
    });
  });
  return items;
}

// ——— Utility ———
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.includes('T') ? iso : iso + 'T12:00:00');
  if (isNaN(d)) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function buildWAPhone(phone) {
  if (!phone) return '';
  return phone.replace(/[\s\-\(\)\+]/g,'').replace(/^0/,'44');
}
function getSettings() { return window._settings || {}; }

// ——— Dashboard: VHC Section ———

window._vhcData = [];

export function initVhcSection() {
  loadVhcList();
}

export async function loadVhcList() {
  showSpinner('page-vhc');
  try {
    const snap = await garageRef('vhc_reports').orderBy('createdAt','desc').get();
    window._vhcData = docsToArr(snap);
    renderVhcList();
  } catch (e) {
    console.error('loadVhcList', e);
    if (typeof showToast === 'function') showToast('Failed to load VHC reports', 'error');
  } finally {
    hideSpinner('page-vhc');
  }
}

function renderVhcList() {
  const tbody = document.getElementById('vhcTbody');
  if (!tbody) return;
  if (window._vhcData.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fas fa-clipboard-check"></i>No VHC reports yet. Open a job card and run the VHC checklist.</td></tr>`;
    return;
  }
  tbody.innerHTML = window._vhcData.map(v => {
    const sum = v.summary || {};
    return `
    <tr>
      <td class="td-muted">${formatDate(v.inspectionDate)}</td>
      <td class="td-name">${esc(v.customerName || '—')}</td>
      <td class="td-mono">${esc(v.reg || '—')}</td>
      <td class="td-muted">${esc(v.make || '')} ${esc(v.model || '')}</td>
      <td>
        <span style="color:var(--green);font-weight:700">${sum.green || 0}G</span>
        <span style="color:#f59e0b;font-weight:700;margin:0 4px">${sum.amber || 0}A</span>
        <span style="color:var(--red-light);font-weight:700">${sum.red || 0}R</span>
      </td>
      <td><span class="badge ${v.status === 'complete' ? 'badge-completed' : 'badge-new'}">${esc(v.status || 'draft')}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="openVhcModal('${esc(v.jobId)}')" title="View/Edit"><i class="fas fa-clipboard-check"></i></button>
          <button class="action-btn success" onclick="sendVhcReport('${esc(v.jobId)}','${esc(v.customerName)}','${esc(v.customerPhone || '')}')" title="Send WhatsApp"><i class="fab fa-whatsapp"></i></button>
          <button class="action-btn" onclick="openVhcPublic('${esc(v.id)}')" title="View public report"><i class="fas fa-external-link-alt"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

// ——— VHC Modal ———

let _vhcModalJobId = null;
let _vhcItems = [];

export function openVhcModal(jobId) {
  _vhcModalJobId = jobId;

  // Try to load existing VHC report for this job
  const existing = window._vhcData.find(v => v.jobId === jobId);
  _vhcItems = existing ? JSON.parse(JSON.stringify(existing.items)) : buildDefaultItems();

  const overlay = document.getElementById('vhcModal');
  const content = document.getElementById('vhcModalContent');
  if (!overlay || !content) return;

  // Find job details
  const job = (window._jobsData || []).find(j => j.id === jobId) || {};

  content.innerHTML = `
    <div style="margin-bottom:20px">
      <div style="font-size:1.1rem;font-weight:700;color:var(--white);margin-bottom:4px">VHC — ${esc(job.customerName || 'Customer')} &bull; <span style="font-family:monospace">${esc(job.reg || '—')}</span></div>
      <div style="font-size:0.82rem;color:var(--text-dim)">${esc(job.make || '')} ${esc(job.model || '')} &bull; Job: ${esc(jobId)}</div>
    </div>
    <div id="vhcChecklistBody">${renderVhcChecklist(_vhcItems)}</div>
    <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border);display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn-sm btn-primary-sm" onclick="saveVhcReport('${esc(jobId)}')"><i class="fas fa-save"></i> Save &amp; Complete</button>
      <button class="btn-sm btn-ghost-sm" onclick="document.getElementById('vhcModal').classList.remove('open')">Cancel</button>
    </div>`;

  overlay.classList.add('open');
  attachVhcListeners();
}

function renderVhcChecklist(items) {
  const byCategory = {};
  items.forEach(item => {
    if (!byCategory[item.category]) byCategory[item.category] = [];
    byCategory[item.category].push(item);
  });

  return Object.entries(byCategory).map(([cat, catItems]) => `
    <div class="vhc-section" style="margin-bottom:20px">
      <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text-dim);margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border)">
        <i class="fas ${CATEGORY_ICONS[cat] || 'fa-wrench'}"></i> ${cat}
      </div>
      ${catItems.map((item, idx) => {
        const globalIdx = items.indexOf(item);
        return `
        <div class="vhc-item" style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;margin-bottom:10px;padding:8px;background:var(--dark-3);border-radius:var(--radius);border:1px solid var(--border)">
          <div style="font-size:0.88rem;color:var(--white);font-weight:500">${esc(item.name)}</div>
          <div class="vhc-traffic-btns" style="display:flex;gap:4px">
            <button class="vhc-tl-btn ${item.status === 'green' ? 'active' : ''}" data-idx="${globalIdx}" data-status="green" title="Satisfactory" style="width:32px;height:32px;border-radius:50%;border:2px solid ${item.status === 'green' ? '#22c55e' : 'var(--border)'};background:${item.status === 'green' ? '#22c55e' : 'transparent'};cursor:pointer;transition:all 0.15s"></button>
            <button class="vhc-tl-btn ${item.status === 'amber' ? 'active' : ''}" data-idx="${globalIdx}" data-status="amber" title="Advisory" style="width:32px;height:32px;border-radius:50%;border:2px solid ${item.status === 'amber' ? '#f59e0b' : 'var(--border)'};background:${item.status === 'amber' ? '#f59e0b' : 'transparent'};cursor:pointer;transition:all 0.15s"></button>
            <button class="vhc-tl-btn ${item.status === 'red' ? 'active' : ''}" data-idx="${globalIdx}" data-status="red" title="Action Required" style="width:32px;height:32px;border-radius:50%;border:2px solid ${item.status === 'red' ? '#ef4444' : 'var(--border)'};background:${item.status === 'red' ? '#ef4444' : 'transparent'};cursor:pointer;transition:all 0.15s"></button>
            <button class="vhc-tl-btn ${item.status === 'na' ? 'active' : ''}" data-idx="${globalIdx}" data-status="na" title="Not Applicable" style="width:32px;height:32px;border-radius:50%;border:2px solid ${item.status === 'na' ? '#6b7280' : 'var(--border)'};background:${item.status === 'na' ? '#6b7280' : 'transparent'};cursor:pointer;transition:all 0.15s;font-size:0.65rem;color:var(--text-dim)">N/A</button>
          </div>
          <button onclick="toggleVhcNotes(${globalIdx})" style="background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:0.75rem;padding:4px" title="Add notes">
            <i class="fas fa-comment-alt"></i>
          </button>
        </div>
        <div id="vhc-notes-${globalIdx}" style="display:${item.notes ? 'block' : 'none'};margin:-4px 0 10px 0;padding:0 8px">
          <input type="text" class="vhc-notes-input" data-idx="${globalIdx}" value="${esc(item.notes)}" placeholder="Notes…"
            style="width:100%;background:var(--dark-3);border:1px solid var(--border);border-radius:var(--radius);padding:8px 10px;color:var(--white);font-size:0.82rem;box-sizing:border-box">
        </div>`;
      }).join('')}
    </div>`).join('');
}

function attachVhcListeners() {
  // Traffic light buttons
  document.querySelectorAll('.vhc-tl-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const status = btn.dataset.status;
      _vhcItems[idx].status = status;
      // Re-render just the checklist
      const body = document.getElementById('vhcChecklistBody');
      if (body) {
        body.innerHTML = renderVhcChecklist(_vhcItems);
        attachVhcListeners();
      }
    });
  });

  // Notes inputs
  document.querySelectorAll('.vhc-notes-input').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = parseInt(inp.dataset.idx);
      _vhcItems[idx].notes = inp.value;
    });
  });
}

window.toggleVhcNotes = function(idx) {
  const el = document.getElementById(`vhc-notes-${idx}`);
  if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

// ——— Save VHC Report ———

export async function saveVhcReport(jobId, extraData = {}) {
  const job = (window._jobsData || []).find(j => j.id === jobId) || {};
  const garageId = getGarageId();
  const user = window._currentUser || {};
  const mechanicName = extraData.mechanicName || user.email?.split('@')[0] || 'Technician';
  const mechanicId   = extraData.mechanicId   || user.uid || '';

  const items = _vhcItems.length > 0 ? _vhcItems : buildDefaultItems();
  const summary = {
    green: items.filter(i => i.status === 'green').length,
    amber: items.filter(i => i.status === 'amber').length,
    red:   items.filter(i => i.status === 'red').length
  };

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  // Check if existing report for this job
  const existing = window._vhcData.find(v => v.jobId === jobId);

  const data = {
    garageId,
    jobId,
    customerId:     job.customerId     || extraData.customerId     || '',
    customerName:   job.customerName   || extraData.customerName   || '',
    customerPhone:  job.customerPhone  || extraData.customerPhone  || '',
    reg:            job.reg            || extraData.reg            || '',
    make:           job.make           || extraData.make           || '',
    model:          job.model          || extraData.model          || '',
    inspectionDate: now.toISOString().split('T')[0],
    mechanicName,
    mechanicId,
    items,
    summary,
    status: 'complete',
    expiresAt: expiresAt.toISOString(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  };

  try {
    let vhcId;
    if (existing) {
      await garageDoc('vhc_reports', existing.id).update(data);
      vhcId = existing.id;
      const idx = window._vhcData.findIndex(v => v.id === existing.id);
      if (idx !== -1) Object.assign(window._vhcData[idx], data);
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await garageRef('vhc_reports').add(data);
      vhcId = ref.id;
      data.publicUrl = generatePublicUrl(jobId, garageId);
      await garageDoc('vhc_reports', vhcId).update({ publicUrl: data.publicUrl });
      window._vhcData.unshift({ id: vhcId, ...data });
    }

    // Auto-create opportunities for amber/red items
    await createOpportunitiesFromVhc(vhcId, items, job, garageId);

    document.getElementById('vhcModal')?.classList.remove('open');
    renderVhcList();
    if (typeof showToast === 'function') showToast('VHC report saved', 'success');
    if (typeof addNotification === 'function') addNotification('info', `VHC completed for ${data.customerName}`, 'vhc');

    return vhcId;
  } catch (err) {
    console.error('saveVhcReport', err);
    if (typeof showToast === 'function') showToast('Failed to save VHC report', 'error');
    return null;
  }
}
window.saveVhcReport = saveVhcReport;

async function createOpportunitiesFromVhc(vhcId, items, job, garageId) {
  const needsAction = items.filter(i => i.status === 'amber' || i.status === 'red');
  if (!needsAction.length) return;

  const batch = db.batch();
  needsAction.forEach(item => {
    const ref = garageRef('opportunities').doc();
    batch.set(ref, {
      garageId,
      customerId:    job.customerId    || '',
      customerName:  job.customerName  || '',
      reg:           job.reg           || '',
      make:          job.make          || '',
      model:         job.model         || '',
      issue:         item.name,
      description:   item.notes || `${item.name} flagged as ${item.status} on VHC`,
      value:         0,
      priority:      item.status === 'red' ? 'high' : 'medium',
      status:        'new',
      source:        'vhc',
      vhcItemId:     vhcId,
      followUpDate:  new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      lastContactDate: '',
      notes:         '',
      createdAt:     firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
    });
  });
  await batch.commit();
}

export function generatePublicUrl(jobId, garageId) {
  const gid = garageId || getGarageId();
  return `/vhc.html?job=${jobId}&garage=${gid}`;
}
window.generatePublicUrl = generatePublicUrl;

export function sendVhcReport(jobId, customerName, phone) {
  const garageId = getGarageId();
  const url = generatePublicUrl(jobId, garageId);
  const fullUrl = `${window.location.origin}${url}`;
  const s = getSettings();
  const firstName = (customerName || 'there').split(' ')[0];
  const msg = `Hi ${firstName}, your Vehicle Health Check report is ready! You can view it here: ${fullUrl}\n\nIf you have any questions or would like to book any repairs, please call us on ${s.phone || '07749 207399'}. — ${s.garageName || 'MOT Car Repairs'}`;
  const num = buildWAPhone(phone);
  if (!num) {
    if (typeof showToast === 'function') showToast('No phone number — copy the link manually', 'info');
    prompt('Share this VHC report link:', fullUrl);
    return;
  }
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  if (typeof showToast === 'function') showToast('WhatsApp opened with VHC report link', 'success');
}
window.sendVhcReport = sendVhcReport;

window.openVhcPublic = function(vhcId) {
  const v = window._vhcData.find(x => x.id === vhcId);
  if (!v || !v.publicUrl) { if (typeof showToast === 'function') showToast('No public URL — save the report first', 'info'); return; }
  window.open(v.publicUrl, '_blank', 'noopener');
};

// ——— Modal wiring for dashboard ———
document.getElementById('closeVhcModal')?.addEventListener('click', () => document.getElementById('vhcModal')?.classList.remove('open'));
document.getElementById('vhcModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });

window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaders['vhc'] = initVhcSection;

Object.assign(window, { initVhcSection, loadVhcList, openVhcModal });

// ===========================================================
// PUBLIC REPORT SIDE (vhc.html)
// ===========================================================

if (document.getElementById('vhcLoading')) {
  initPublicVhc();
}

export async function initPublicVhc() {
  const params = new URLSearchParams(window.location.search);
  const jobId   = params.get('job');
  const garageId = params.get('garage');

  if (!jobId || !garageId) {
    showVhcError('Invalid Link', 'This VHC report link is missing required parameters. Please contact your garage.');
    return;
  }

  try {
    // Load garage account (public) + VHC report
    const [accountSnap, reportsSnap] = await Promise.all([
      db.collection('accounts').doc(garageId).get(),
      db.collection(`garages/${garageId}/vhc_reports`).where('jobId','==',jobId).limit(1).get()
    ]);

    if (reportsSnap.empty) {
      showVhcError('Report Not Found', 'We couldn\'t find a VHC report for this job. Please contact your garage.');
      return;
    }

    const report  = { id: reportsSnap.docs[0].id, ...reportsSnap.docs[0].data() };
    const account = accountSnap.exists ? accountSnap.data() : {};

    // Apply branding
    applyVhcBranding(account);

    // Check expiry
    if (report.expiresAt) {
      const expires = new Date(report.expiresAt.toDate ? report.expiresAt.toDate() : report.expiresAt);
      if (Date.now() > expires.getTime()) {
        document.getElementById('vhcExpiryNotice').style.display = 'flex';
      }
    }

    // Populate hero
    document.getElementById('heroReg').textContent     = report.reg || '—';
    document.getElementById('heroVehicle').textContent = [report.make, report.model].filter(Boolean).join(' ') || '—';
    document.getElementById('heroYear').textContent    = report.year || '—';
    document.getElementById('heroDate').textContent    = formatDate(report.inspectionDate);
    document.getElementById('heroMileage').textContent = report.mileage ? report.mileage.toLocaleString('en-GB') + ' mi' : '—';
    document.getElementById('heroJobRef').textContent  = report.jobId || '—';

    // Summary
    const sum = report.summary || { green: 0, amber: 0, red: 0 };
    document.getElementById('tlGreenCount').textContent = sum.green;
    document.getElementById('tlAmberCount').textContent = sum.amber;
    document.getElementById('tlRedCount').textContent   = sum.red;
    const total = (sum.green || 0) + (sum.amber || 0) + (sum.red || 0) || 1;
    document.getElementById('gaugeGreen').style.width = ((sum.green / total) * 100) + '%';
    document.getElementById('gaugeAmber').style.width = ((sum.amber / total) * 100) + '%';
    document.getElementById('gaugeRed').style.width   = ((sum.red   / total) * 100) + '%';

    // Sign-off
    document.getElementById('signoffName').textContent      = report.mechanicName || 'Technician';
    document.getElementById('signoffTimestamp').textContent = formatDateTime(report.inspectionDate);

    // Category sections
    const categories = document.getElementById('vhcCategories');
    if (categories && report.items) {
      const grouped = {};
      report.items.forEach(item => {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push(item);
      });
      categories.innerHTML = Object.entries(grouped)
        .map(([cat, items]) => renderVhcSection(cat, items))
        .join('');
    }

    // Lightbox
    document.querySelectorAll('[data-photo]').forEach(el => {
      el.addEventListener('click', () => {
        document.getElementById('lightboxImg').src = el.dataset.photo;
        document.getElementById('vhcLightbox').classList.add('open');
      });
    });
    document.getElementById('lightboxClose')?.addEventListener('click', () => {
      document.getElementById('vhcLightbox').classList.remove('open');
    });
    document.getElementById('vhcLightbox')?.addEventListener('click', e => {
      if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
    });

    // CTA buttons
    const bookUrl = `/booking.html?garage=${garageId}&service=Repairs`;
    document.getElementById('ctaBookBtn').href = bookUrl;
    document.getElementById('ctaCallBtn').href = `tel:${account.phone || ''}`;

    // Footer
    document.getElementById('footerGarage').textContent = account.garageName || 'Your Garage';
    document.getElementById('footerDate').textContent   = formatDate(report.inspectionDate);
    document.title = `VHC Report — ${report.reg || 'Vehicle'}`;

    // WhatsApp share
    document.getElementById('ctaWhatsappBtn')?.addEventListener('click', () => shareVhcReport(account));

    // Book repairs CTA
    document.getElementById('ctaBookBtn')?.addEventListener('click', e => {
      e.preventDefault();
      bookRepairs(garageId);
    });

    // Show report
    document.getElementById('vhcLoading').style.display = 'none';
    document.getElementById('vhcMain').style.display    = '';

  } catch (err) {
    console.error('initPublicVhc', err);
    showVhcError('Error Loading Report', 'Failed to load the VHC report. Please check your connection and try again.');
  }
}

function applyVhcBranding(account) {
  const name = account.garageName || 'Your Garage';
  document.getElementById('topbarName').textContent    = name;
  document.getElementById('topbarPhoneText').textContent = account.phone || '';
  const phoneLink = document.getElementById('topbarPhone');
  if (phoneLink && account.phone) phoneLink.href = `tel:${account.phone}`;

  if (account.logoUrl) {
    document.getElementById('topbarLogoWrap').innerHTML = `<img src="${account.logoUrl}" alt="${esc(name)}" style="height:40px;border-radius:6px;object-fit:contain">`;
  }

  if (account.brandColour) {
    document.documentElement.style.setProperty('--vhc-brand', account.brandColour);
  }
}

export function renderVhcSection(category, items) {
  const statusLabel = { green: 'Satisfactory', amber: 'Advisory', red: 'Action Required', na: 'N/A' };
  const statusIcon  = { green: 'fa-circle-check', amber: 'fa-circle-exclamation', red: 'fa-circle-xmark', na: 'fa-circle-minus' };
  const statusStyle = {
    green: 'color:#22c55e',
    amber: 'color:#f59e0b',
    red:   'color:#ef4444',
    na:    'color:#6b7280'
  };

  const hasIssues = items.some(i => i.status === 'amber' || i.status === 'red');

  return `
    <section class="vhc-cat-section" style="background:var(--vhc-card,#1c1c2e);border-radius:12px;margin-bottom:16px;overflow:hidden;border:1px solid rgba(255,255,255,0.06)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.02)">
        <div style="display:flex;align-items:center;gap:10px;font-size:0.95rem;font-weight:700;color:#fff">
          <i class="fas ${CATEGORY_ICONS[category] || 'fa-wrench'}" style="${hasIssues ? 'color:#f59e0b' : 'color:#22c55e'}"></i>
          ${esc(category)}
        </div>
        <div style="font-size:0.75rem;color:rgba(255,255,255,0.4)">${items.length} items</div>
      </div>
      <div style="padding:8px 0">
        ${items.map(item => `
          <div style="display:flex;align-items:flex-start;justify-content:space-between;padding:10px 18px;border-bottom:1px solid rgba(255,255,255,0.04)">
            <div style="flex:1;min-width:0">
              <div style="font-size:0.88rem;color:rgba(255,255,255,0.85);font-weight:500">${esc(item.name)}</div>
              ${item.notes ? `<div style="font-size:0.78rem;color:rgba(255,255,255,0.45);margin-top:3px">${esc(item.notes)}</div>` : ''}
              ${item.photoUrl ? `<button data-photo="${esc(item.photoUrl)}" style="background:none;border:none;color:#60a5fa;font-size:0.75rem;cursor:pointer;padding:0;margin-top:4px"><i class="fas fa-image"></i> View photo</button>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;margin-left:12px">
              <i class="fas ${statusIcon[item.status] || statusIcon.na}" style="${statusStyle[item.status] || statusStyle.na};font-size:1.1rem"></i>
              <span style="font-size:0.75rem;font-weight:600;${statusStyle[item.status] || statusStyle.na}">${statusLabel[item.status] || 'N/A'}</span>
            </div>
          </div>`).join('')}
      </div>
    </section>`;
}

export function shareVhcReport(account) {
  const url = window.location.href;
  const garageName = (account && account.garageName) || 'the garage';
  const msg = `Here is my Vehicle Health Check report from ${garageName}: ${url}`;
  if (navigator.share) {
    navigator.share({ title: 'VHC Report', text: msg, url }).catch(() => {});
  } else {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  }
}

export function bookRepairs(garageId) {
  window.location.href = `/booking.html?garage=${garageId}&service=Repairs`;
}

function showVhcError(title, msg) {
  document.getElementById('vhcLoading').style.display = 'none';
  document.getElementById('vhcError').style.display   = 'flex';
  const titleEl = document.getElementById('vhcErrorTitle');
  const msgEl   = document.getElementById('vhcErrorMsg');
  if (titleEl) titleEl.textContent = title;
  if (msgEl)   msgEl.textContent   = msg;
}
