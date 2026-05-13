/* ===========================
   GarageOS — Opportunities Pipeline
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, formatCurrency, esc, debounce } from './utils.js';
import { showModal, closeModal, showConfirm } from './ui.js';

const FieldValue = firebase.firestore.FieldValue;
let allOpportunities = [];
let editingOppId     = null;

export async function initOpportunities() {
  await loadOpportunities();
  setupOpportunitiesUI();
}

async function loadOpportunities() {
  try {
    const snap = await garageRef('opportunities').orderBy('createdAt','desc').get();
    allOpportunities = docsToArr(snap);
    renderOpportunitiesKanban(allOpportunities);
    renderStats(allOpportunities);
  } catch (err) {
    showToast('Failed to load opportunities', 'error');
  }
}

function setupOpportunitiesUI() {
  document.getElementById('newOpportunityBtn')?.addEventListener('click', () => openOpportunityModal(null));
  document.querySelectorAll('[data-section="opportunities"] .view-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      document.querySelectorAll('[data-section="opportunities"] .view-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('opportunitiesKanban').style.display = view === 'kanban' ? '' : 'none';
      document.getElementById('opportunitiesListView').style.display = view === 'list' ? '' : 'none';
      if (view === 'list') renderOpportunitiesList(allOpportunities);
    });
  });
}

function renderStats(opps) {
  const now   = new Date();
  const open  = opps.filter(o => !['won','lost'].includes(o.status));
  const won   = opps.filter(o => o.status === 'won');
  const month = opps.filter(o => {
    const d = o.createdAt?.toDate ? o.createdAt.toDate() : new Date(o.createdAt || 0);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const wonMonth = month.filter(o => o.status === 'won');
  const winRate  = month.length ? Math.round(wonMonth.length / month.length * 100) : 0;
  const pipeline = open.reduce((s, o) => s + (o.value || 0), 0);

  const totalEl    = document.getElementById('pipelineTotal');
  const winRateEl  = document.getElementById('pipelineWinRate');
  if (totalEl)   totalEl.textContent   = `${formatCurrency(pipeline)} in open opportunities`;
  if (winRateEl) winRateEl.textContent = `${winRate}% conversion this month`;

  // Update overview stat too
  const el = document.getElementById('statPipeline');
  if (el) el.textContent = formatCurrency(pipeline);
}

// ——— Kanban ———
const STAGES = ['new','quoted','approved','booked','won','lost'];
const STAGE_LABELS = { new:'New', quoted:'Quoted', approved:'Approved', booked:'Booked', won:'Won', lost:'Lost' };

function renderOpportunitiesKanban(opps) {
  const board = document.getElementById('opportunitiesKanban');
  if (!board) return;
  board.innerHTML = STAGES.map(stage => {
    const items = opps.filter(o => (o.status || 'new') === stage);
    const value = items.reduce((s, o) => s + (o.value || 0), 0);
    const notContacted = items.filter(o => {
      if (!o.lastContactDate) return true;
      const d = new Date(o.lastContactDate);
      return (Date.now() - d) / 86400000 > 7;
    });
    return `<div class="kanban-column">
      <div class="kanban-col-header">
        <span>${STAGE_LABELS[stage]}</span>
        <span class="kanban-count">${items.length}</span>
        ${value ? `<span class="kanban-value">${formatCurrency(value)}</span>` : ''}
      </div>
      <div class="kanban-cards">
        ${items.map(o => renderOppCard(o, notContacted.some(n=>n.id===o.id))).join('')}
      </div>
    </div>`;
  }).join('');
}

function renderOppCard(o, stale) {
  const priorityClass = { high:'priority-high', medium:'priority-medium', low:'priority-low' }[o.priority] || '';
  return `<div class="kanban-card opp-card ${priorityClass}" onclick="openOppById('${o.id}')">
    <div class="opp-customer">${esc(o.customerName)}</div>
    ${o.reg ? `<span class="reg-chip">${esc(o.reg)}</span>` : ''}
    <div class="opp-issue">${esc(o.issue)}</div>
    <div class="opp-footer">
      <span class="opp-value">${formatCurrency(o.value || 0)}</span>
      <span class="source-badge">${esc(o.source || 'manual')}</span>
    </div>
    ${stale ? '<div class="stale-warning"><i class="fas fa-clock"></i> Not contacted 7+ days</div>' : ''}
    ${o.followUpDate && new Date(o.followUpDate) < new Date() ? '<div class="overdue-badge"><i class="fas fa-exclamation"></i> Follow-up overdue</div>' : ''}
    <div class="opp-actions" onclick="event.stopPropagation()">
      <button class="btn-icon btn-wa" title="Send Quote via WhatsApp" onclick="oppSendQuote('${o.id}')"><i class="fab fa-whatsapp"></i></button>
    </div>
  </div>`;
}

// ——— List view ———
function renderOpportunitiesList(opps) {
  const tbody = document.getElementById('opportunitiesTbody');
  if (!tbody) return;
  tbody.innerHTML = opps.map(o => `<tr>
    <td>${esc(o.customerName)}</td>
    <td>${o.reg ? `<span class="reg-chip">${esc(o.reg)}</span>` : '—'}</td>
    <td>${esc(o.issue)}</td>
    <td>${formatCurrency(o.value||0)}</td>
    <td><span class="priority-dot priority-${o.priority}">${esc(o.priority||'medium')}</span></td>
    <td><span class="badge-status badge-${o.status}">${esc(o.status||'new')}</span></td>
    <td>${esc(o.source||'manual')}</td>
    <td>${o.followUpDate ? formatDate(o.followUpDate) : '—'}</td>
    <td class="actions-cell">
      <button class="btn-icon" onclick="openOppById('${o.id}')"><i class="fas fa-pen"></i></button>
      <button class="btn-icon btn-wa" onclick="oppSendQuote('${o.id}')"><i class="fab fa-whatsapp"></i></button>
      <button class="btn-icon btn-danger-icon" onclick="deleteOpp('${o.id}')"><i class="fas fa-trash"></i></button>
    </td>
  </tr>`).join('') || '<tr><td colspan="9" class="empty-cell">No opportunities found.</td></tr>';
}

// ——— Modal ———
window.openOppById = (id) => openOpportunityModal(id);

async function openOpportunityModal(id) {
  editingOppId = id || null;
  const o = id ? allOpportunities.find(x => x.id === id) : {};
  // Simple inline prompt for now
  const title   = prompt('Issue / description:', o?.issue || '');
  if (title === null) return;
  const valueStr = prompt('Estimated value £:', o?.value || '0');
  const status   = prompt('Status (new/quoted/approved/booked/won/lost):', o?.status || 'new');

  const data = {
    issue:        title,
    value:        parseFloat(valueStr) || 0,
    status:       status || 'new',
    customerName: o?.customerName || '',
    customerId:   o?.customerId || '',
    reg:          o?.reg || '',
    source:       o?.source || 'manual',
    priority:     o?.priority || 'medium',
    updatedAt:    FieldValue.serverTimestamp()
  };

  try {
    if (id) {
      await garageDoc('opportunities', id).update(data);
      const idx = allOpportunities.findIndex(x => x.id === id);
      if (idx > -1) allOpportunities[idx] = { ...allOpportunities[idx], ...data };
    } else {
      data.createdAt = FieldValue.serverTimestamp();
      const ref = await garageRef('opportunities').add(data);
      allOpportunities.unshift({ id: ref.id, ...data });
    }
    showToast('Opportunity saved', 'success');
    renderOpportunitiesKanban(allOpportunities);
    renderStats(allOpportunities);
  } catch (err) {
    showToast('Failed to save opportunity', 'error');
  }
}

window.deleteOpp = async (id) => {
  const ok = await showConfirm({ title: 'Delete Opportunity', message: 'Delete this opportunity?', confirmText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await garageDoc('opportunities', id).delete();
    allOpportunities = allOpportunities.filter(o => o.id !== id);
    renderOpportunitiesKanban(allOpportunities);
    renderStats(allOpportunities);
    showToast('Deleted', 'success');
  } catch { showToast('Failed to delete', 'error'); }
};

// ——— WhatsApp quote ———
window.oppSendQuote = async (id) => {
  const o = allOpportunities.find(x => x.id === id);
  if (!o) return;
  const { getSettings } = await import('./utils.js');
  const s = getSettings();
  const msg = `Hi ${esc(o.customerName)}, we have a quote for your ${o.reg ? `${o.reg}` : 'vehicle'}:\n\n${esc(o.issue)}\nEstimated cost: ${formatCurrency(o.value||0)}\n\nReply YES to proceed or call ${s.phone||'us'}.\n— ${s.garageName||'Your Garage'}`;
  // Get customer phone
  if (o.customerId) {
    const doc = await garageDoc('customers', o.customerId).get();
    const phone = doc.data()?.phone;
    if (phone) {
      const p = phone.replace(/\s/g,'').replace(/^0/,'44');
      window.open(`https://wa.me/${p}?text=${encodeURIComponent(msg)}`, '_blank');
      await garageRef('comms_log').add({ customerId: o.customerId, type: 'whatsapp', direction: 'outbound', content: msg, createdAt: FieldValue.serverTimestamp() });
      garageDoc('opportunities', id).update({ lastContactDate: new Date().toISOString().split('T')[0], updatedAt: FieldValue.serverTimestamp() });
      return;
    }
  }
  showToast('No phone number for this customer', 'warning');
};

// ——— Create from VHC (called by vhc.js) ———
export async function createOpportunityFromVhc(jobData, item) {
  try {
    await garageRef('opportunities').add({
      customerId:   jobData.customerId || '',
      customerName: jobData.customerName || '',
      reg:          jobData.reg || '',
      issue:        `${item.category}: ${item.name}`,
      description:  item.notes || '',
      value:        0,
      priority:     item.status === 'red' ? 'high' : 'medium',
      status:       'new',
      source:       'vhc',
      vhcItemId:    item.id || '',
      createdAt:    FieldValue.serverTimestamp(),
      updatedAt:    FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Failed to create opportunity from VHC:', err);
  }
}

export { allOpportunities };
