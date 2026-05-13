/* ===========================
   GarageOS — Super Admin Dashboard
   =========================== */

import firebase, { auth, db, SUPER_ADMIN_UID } from './firebase.js';
import { showToast, formatDate, formatCurrency, esc, debounce } from './utils.js';

const FieldValue = firebase.firestore.FieldValue;

let allGarages   = [];
let allLeads     = [];
let activeSection = 'admin-overview';

// ——— Init ———
auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'login.html'; return; }
  if (user.uid !== SUPER_ADMIN_UID) { window.location.href = 'login.html'; return; }
  document.getElementById('appLoader')?.remove();
  document.getElementById('adminUserName')?.textContent && (document.getElementById('adminUserName').textContent = user.email);
  initAdminNav();
  loadAdminOverview();
});

// ——— Navigation ———
function initAdminNav() {
  document.querySelectorAll('.admin-nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const section = btn.dataset.section;
      switchSection(section);
    });
  });
  document.getElementById('adminLogout')?.addEventListener('click', () => {
    auth.signOut().then(() => { window.location.href = 'login.html'; });
  });
}

function switchSection(name) {
  activeSection = name;
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');
  document.querySelectorAll('.admin-nav-link').forEach(b => b.classList.toggle('active', b.dataset.section === name));
  const titles = {
    'admin-overview': 'Overview', 'admin-garages': 'Garages',
    'admin-crm': 'Sales CRM', 'admin-revenue': 'Revenue', 'admin-settings': 'Settings'
  };
  document.getElementById('adminBreadcrumb').textContent = titles[name] || name;

  if (name === 'admin-garages' && !allGarages.length) loadGarages();
  if (name === 'admin-crm' && !allLeads.length) loadCRM();
  if (name === 'admin-revenue') renderRevenueStats();
}

// ——— Overview ———
async function loadAdminOverview() {
  try {
    const snap = await db.collection('accounts').get();
    allGarages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const now  = new Date();

    const total   = allGarages.length;
    const trials  = allGarages.filter(g => g.status === 'trial').length;
    const active  = allGarages.filter(g => g.status === 'active').length;
    const expiring = allGarages.filter(g => {
      if (g.status !== 'trial' || !g.trialEndsAt) return false;
      const end = g.trialEndsAt.toDate ? g.trialEndsAt.toDate() : new Date(g.trialEndsAt);
      return (end - now) / 86400000 <= 7;
    }).length;

    const mrr = computeMRR(allGarages);

    setText('adminStatTotal',    total);
    setText('adminStatTrials',   trials);
    setText('adminStatPaying',   active);
    setText('adminStatExpiring', expiring);
    setText('adminStatMRR',      formatCurrency(mrr));

    // Recent signups
    const recent = [...allGarages].sort((a,b) => {
      const ta = a.createdAt?.seconds || 0, tb = b.createdAt?.seconds || 0;
      return tb - ta;
    }).slice(0, 10);
    renderRecentActivity(recent);

  } catch (err) {
    console.error(err);
    showToast('Failed to load admin data', 'error');
  }
}

function computeMRR(garages) {
  const prices = { starter: 49, pro: 79, enterprise: 129 };
  return garages
    .filter(g => g.status === 'active')
    .reduce((sum, g) => sum + (prices[g.plan] || 0), 0);
}

function renderRecentActivity(garages) {
  const el = document.getElementById('adminRecentActivity');
  if (!el) return;
  if (!garages.length) { el.innerHTML = '<p class="text-muted">No garages yet.</p>'; return; }
  el.innerHTML = garages.map(g => `
    <div class="activity-row">
      <div class="activity-info">
        <strong>${esc(g.garageName)}</strong>
        <span class="text-muted">${esc(g.ownerEmail)}</span>
      </div>
      <div class="activity-meta">
        ${planBadge(g.plan)} ${statusBadge(g)}
        <span class="text-muted">${g.createdAt ? formatDate(g.createdAt.toDate ? g.createdAt.toDate().toISOString() : g.createdAt) : '—'}</span>
      </div>
    </div>`).join('');
}

// ——— Garages table ———
async function loadGarages() {
  try {
    if (!allGarages.length) {
      const snap = await db.collection('accounts').get();
      allGarages = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    renderGaragesTable(allGarages);
    setupGarageFilters();
  } catch (err) {
    showToast('Failed to load garages', 'error');
  }
}

function renderGaragesTable(garages) {
  const tbody = document.getElementById('garagesTbody');
  if (!tbody) return;
  if (!garages.length) { tbody.innerHTML = '<tr><td colspan="9" class="empty-cell">No garages found.</td></tr>'; return; }
  tbody.innerHTML = garages.map(g => {
    const trialDays = getTrialDaysLeft(g);
    return `<tr>
      <td><strong>${esc(g.garageName)}</strong></td>
      <td>${esc(g.ownerName)}</td>
      <td><a href="mailto:${esc(g.ownerEmail)}">${esc(g.ownerEmail)}</a></td>
      <td>${planBadge(g.plan)}</td>
      <td>${statusBadge(g)}</td>
      <td>${trialDays !== null ? `${trialDays}d` : '—'}</td>
      <td>${g.createdAt ? formatDate(g.createdAt.toDate ? g.createdAt.toDate().toISOString() : g.createdAt) : '—'}</td>
      <td>—</td>
      <td class="actions-cell">
        <button class="btn-sm btn-secondary" onclick="adminExtendTrial('${g.id}')"><i class="fas fa-clock"></i></button>
        <button class="btn-sm btn-secondary" onclick="adminChangePlan('${g.id}')"><i class="fas fa-arrow-up"></i></button>
        <button class="btn-sm btn-success" onclick="adminMarkPaid('${g.id}')"><i class="fas fa-check"></i></button>
        <button class="btn-sm btn-danger" onclick="adminSuspend('${g.id}')"><i class="fas fa-ban"></i></button>
      </td>
    </tr>`;
  }).join('');
}

function setupGarageFilters() {
  const search = document.getElementById('garageSearch');
  const status = document.getElementById('garageStatusFilter');
  const doFilter = debounce(() => {
    let result = [...allGarages];
    const q = search?.value.trim().toLowerCase();
    const s = status?.value;
    if (q) result = result.filter(g =>
      g.garageName?.toLowerCase().includes(q) || g.ownerEmail?.toLowerCase().includes(q)
    );
    if (s) result = result.filter(g => {
      if (s === 'expiring') {
        const d = getTrialDaysLeft(g);
        return d !== null && d <= 7;
      }
      return g.status === s;
    });
    renderGaragesTable(result);
  }, 250);
  search?.addEventListener('input', doFilter);
  status?.addEventListener('change', doFilter);
}

function getTrialDaysLeft(g) {
  if (g.status !== 'trial' || !g.trialEndsAt) return null;
  const end = g.trialEndsAt.toDate ? g.trialEndsAt.toDate() : new Date(g.trialEndsAt);
  return Math.ceil((end - Date.now()) / 86400000);
}

// ——— Garage actions (exposed on window) ———
window.adminExtendTrial = async (garageId) => {
  const days = prompt('Extend trial by how many days? (7, 14, or 30)');
  if (!days || isNaN(days)) return;
  try {
    const g = allGarages.find(x => x.id === garageId);
    if (!g) return;
    const current = g.trialEndsAt?.toDate ? g.trialEndsAt.toDate() : new Date(g.trialEndsAt || Date.now());
    const newEnd = new Date(current);
    newEnd.setDate(newEnd.getDate() + parseInt(days, 10));
    await db.collection('accounts').doc(garageId).update({
      trialEndsAt: firebase.firestore.Timestamp.fromDate(newEnd),
      updatedAt: FieldValue.serverTimestamp()
    });
    showToast(`Trial extended by ${days} days`, 'success');
    await loadAdminOverview();
    renderGaragesTable(allGarages);
  } catch (err) {
    showToast('Failed to extend trial', 'error');
  }
};

window.adminChangePlan = async (garageId) => {
  const plan = prompt('New plan? (starter / pro / enterprise)');
  if (!['starter','pro','enterprise'].includes(plan)) return;
  try {
    await db.collection('accounts').doc(garageId).update({ plan, updatedAt: FieldValue.serverTimestamp() });
    showToast(`Plan changed to ${plan}`, 'success');
    const idx = allGarages.findIndex(x => x.id === garageId);
    if (idx > -1) allGarages[idx].plan = plan;
    renderGaragesTable(allGarages);
  } catch (err) {
    showToast('Failed to change plan', 'error');
  }
};

window.adminMarkPaid = async (garageId) => {
  const plan = prompt('Mark as paid on which plan? (starter / pro / enterprise)');
  if (!['starter','pro','enterprise'].includes(plan)) return;
  const end = new Date(); end.setDate(end.getDate() + 30);
  try {
    await db.collection('accounts').doc(garageId).update({
      status: 'active', plan,
      currentPeriodEnd: firebase.firestore.Timestamp.fromDate(end),
      updatedAt: FieldValue.serverTimestamp()
    });
    showToast('Marked as active', 'success');
    const idx = allGarages.findIndex(x => x.id === garageId);
    if (idx > -1) { allGarages[idx].status = 'active'; allGarages[idx].plan = plan; }
    renderGaragesTable(allGarages);
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
};

window.adminSuspend = async (garageId) => {
  if (!confirm('Suspend this garage?')) return;
  try {
    await db.collection('accounts').doc(garageId).update({ status: 'suspended', updatedAt: FieldValue.serverTimestamp() });
    showToast('Garage suspended', 'warning');
    const idx = allGarages.findIndex(x => x.id === garageId);
    if (idx > -1) allGarages[idx].status = 'suspended';
    renderGaragesTable(allGarages);
  } catch (err) {
    showToast('Failed to suspend', 'error');
  }
};

window.adminDeleteGarage = async (garageId) => {
  const confirm_str = prompt('Type DELETE to confirm deletion:');
  if (confirm_str !== 'DELETE') { showToast('Deletion cancelled.', 'info'); return; }
  try {
    await db.collection('accounts').doc(garageId).delete();
    allGarages = allGarages.filter(g => g.id !== garageId);
    showToast('Garage deleted', 'success');
    renderGaragesTable(allGarages);
  } catch (err) {
    showToast('Failed to delete', 'error');
  }
};

// ——— CRM (Sales Pipeline) ———
async function loadCRM() {
  try {
    const snap = await db.collection('admin_leads').orderBy('createdAt', 'desc').get();
    allLeads = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLeadKanban(allLeads);
  } catch (err) {
    showToast('Failed to load CRM', 'error');
  }
}

function renderLeadKanban(leads) {
  const stages = ['Lead','Demo Sent','Trial','Paying','Churned'];
  const kanban = document.getElementById('leadsKanban');
  if (!kanban) return;

  kanban.innerHTML = stages.map(stage => {
    const stageleads = leads.filter(l => (l.status || 'Lead') === stage);
    return `
      <div class="kanban-column">
        <div class="kanban-col-header">
          <span>${stage}</span>
          <span class="kanban-count">${stageleads.length}</span>
        </div>
        <div class="kanban-cards" data-stage="${stage}">
          ${stageleads.map(l => renderLeadCard(l)).join('')}
        </div>
      </div>`;
  }).join('');
}

function renderLeadCard(l) {
  const followUp = l.followUpDate ? new Date(l.followUpDate) : null;
  const overdue  = followUp && followUp < new Date();
  return `
    <div class="kanban-card${overdue ? ' overdue' : ''}" onclick="openLeadModal('${l.id}')">
      <div class="lead-name">${esc(l.garageName)}</div>
      <div class="lead-meta">${esc(l.ownerName)}</div>
      <div class="lead-phone"><i class="fas fa-phone"></i> ${esc(l.phone)}</div>
      ${l.followUpDate ? `<div class="follow-up-badge${overdue ? ' overdue' : ''}"><i class="fas fa-calendar"></i> ${l.followUpDate}</div>` : ''}
    </div>`;
}

window.openLeadModal = async (id) => {
  const lead = allLeads.find(l => l.id === id) || {};
  document.getElementById('leadId').value = id || '';
  document.getElementById('leadGarageName').value  = lead.garageName || '';
  document.getElementById('leadOwnerName').value   = lead.ownerName || '';
  document.getElementById('leadPhone').value       = lead.phone || '';
  document.getElementById('leadEmail').value       = lead.email || '';
  document.getElementById('leadStatus').value      = lead.status || 'Lead';
  document.getElementById('leadNotes').value       = lead.notes || '';
  document.getElementById('leadFollowUp').value    = lead.followUpDate || '';
  document.getElementById('leadModalTitle').textContent = id ? 'Edit Lead' : 'New Lead';
  document.getElementById('leadModal').style.display = '';
};

document.getElementById('newLeadBtn')?.addEventListener('click', () => openLeadModal(null));

document.getElementById('saveLeadBtn')?.addEventListener('click', async () => {
  const id   = document.getElementById('leadId')?.value;
  const data = {
    garageName:   document.getElementById('leadGarageName')?.value.trim(),
    ownerName:    document.getElementById('leadOwnerName')?.value.trim(),
    phone:        document.getElementById('leadPhone')?.value.trim(),
    email:        document.getElementById('leadEmail')?.value.trim(),
    status:       document.getElementById('leadStatus')?.value,
    notes:        document.getElementById('leadNotes')?.value.trim(),
    followUpDate: document.getElementById('leadFollowUp')?.value,
    updatedAt:    FieldValue.serverTimestamp()
  };
  try {
    if (id) {
      await db.collection('admin_leads').doc(id).update(data);
    } else {
      data.createdAt = FieldValue.serverTimestamp();
      await db.collection('admin_leads').add(data);
    }
    showToast('Lead saved', 'success');
    document.getElementById('leadModal').style.display = 'none';
    loadCRM();
  } catch (err) {
    showToast('Failed to save lead', 'error');
  }
});

// ——— Revenue stats ———
function renderRevenueStats() {
  if (!allGarages.length) return;
  const prices = { starter: 49, pro: 79, enterprise: 129 };
  const active = allGarages.filter(g => g.status === 'active');
  const mrr    = computeMRR(allGarages);
  const arr    = mrr * 12;
  const byPlan = {};
  ['starter','pro','enterprise'].forEach(p => {
    byPlan[p] = active.filter(g => g.plan === p).length;
  });

  setText('adminRevMRR',       formatCurrency(mrr));
  setText('adminRevARR',       formatCurrency(arr));
  setText('adminRevStarterCount', byPlan.starter || 0);
  setText('adminRevProCount',     byPlan.pro || 0);
  setText('adminRevEntCount',     byPlan.enterprise || 0);
}

// ——— Helpers ———
function planBadge(plan) {
  const colors = { starter:'badge-secondary', pro:'badge-blue', enterprise:'badge-gold' };
  return `<span class="badge-status ${colors[plan]||'badge-secondary'}">${plan||'—'}</span>`;
}

function statusBadge(g) {
  const map = { active:'badge-success', trial:'badge-warning', expired:'badge-danger', suspended:'badge-dark', cancelled:'badge-dark' };
  const s   = g.status || 'unknown';
  const d   = getTrialDaysLeft(g);
  const label = s === 'trial' && d !== null ? `Trial (${Math.max(0,d)}d)` : s;
  return `<span class="badge-status ${map[s]||''}">${label}</span>`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Expose on window
window.switchAdminSection = switchSection;
