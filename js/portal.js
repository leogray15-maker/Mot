/* ===========================
   GarageOS — Customer Portal
   =========================== */

import { db } from './firebase.js';
import { showToast, formatDate, formatCurrency, esc, countdown } from './utils.js';

const params   = new URLSearchParams(window.location.search);
const garageId = params.get('garage');
let customerData = null;

document.addEventListener('DOMContentLoaded', () => {
  if (!garageId) {
    showPortalError('Invalid portal link. Please contact your garage for the correct link.');
    return;
  }
  loadGarageBranding();
  setupPortalUI();
});

// ——— Branding ———
async function loadGarageBranding() {
  try {
    const doc = await db.collection('accounts').doc(garageId).get();
    if (!doc.exists) { showPortalError('Garage not found.'); return; }
    const g = doc.data();
    document.getElementById('portalGarageName')?.textContent && (document.getElementById('portalGarageName').textContent = g.garageName || 'Your Garage');
    document.getElementById('portalTitle').textContent = `${g.garageName || 'Garage'} — Customer Portal`;
    document.title = `${g.garageName || 'Garage'} — Customer Portal`;
    // Apply branding colour if set
    if (g.primaryColour) {
      document.documentElement.style.setProperty('--portal-primary', g.primaryColour);
    }
  } catch {}
}

// ——— UI setup ———
function setupPortalUI() {
  document.getElementById('portalFindBtn')?.addEventListener('click', findCustomer);
  document.getElementById('portalEmailInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') findCustomer(); });
  document.getElementById('portalRegInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') findCustomer(); });

  document.querySelectorAll('.portal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.portal-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      document.querySelectorAll('.portal-tab-content').forEach(c => c.style.display = c.id === `portal-${target}` ? '' : 'none');
    });
  });
}

// ——— Find customer ———
async function findCustomer() {
  const email = document.getElementById('portalEmailInput')?.value.trim().toLowerCase();
  const reg   = document.getElementById('portalRegInput')?.value.trim().toUpperCase().replace(/\s/g,'');

  if (!email && !reg) { showToast('Enter your email or vehicle registration', 'warning'); return; }

  const btn = document.getElementById('portalFindBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Searching…'; }

  try {
    let customer = null;

    // Search by email
    if (email) {
      const snap = await db.collection('garages').doc(garageId).collection('customers').where('email','==',email).limit(1).get();
      if (!snap.empty) customer = { id: snap.docs[0].id, ...snap.docs[0].data() };
    }

    // If not found by email, try by reg in vehicles array
    if (!customer && reg) {
      const snap = await db.collection('garages').doc(garageId).collection('customers').get();
      for (const doc of snap.docs) {
        const c = doc.data();
        if ((c.vehicles||[]).some(v => v.reg?.replace(/\s/g,'').toUpperCase() === reg)) {
          customer = { id: doc.id, ...c };
          break;
        }
      }
    }

    if (!customer) {
      showToast('No records found. Please check your details and try again.', 'error');
      return;
    }

    customerData = customer;
    showCustomerDashboard(customer);

  } catch (err) {
    console.error(err);
    showToast('Search failed. Please try again.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Find My Records'; }
  }
}

// ——— Customer dashboard ———
async function showCustomerDashboard(customer) {
  document.getElementById('portalVerify').style.display = 'none';
  document.getElementById('portalDash').style.display   = '';

  // Greeting
  const firstName = customer.name?.split(' ')[0] || 'there';
  const greetingEl = document.getElementById('portalGreeting');
  if (greetingEl) greetingEl.textContent = `Welcome back, ${firstName}!`;

  // Vehicle info
  const vehicles = customer.vehicles || [];
  renderPortalVehicle(vehicles[0]);

  // Load history
  await Promise.all([
    loadPortalHistory(customer.id),
    loadPortalInvoices(customer.id),
    loadPortalVhcReports(customer.id)
  ]);
}

function renderPortalVehicle(v) {
  const el = document.getElementById('portal-vehicle');
  if (!el || !v) return;
  const mot = v.motDue ? countdown(v.motDue) : null;
  el.innerHTML = `
    <div class="portal-vehicle-card">
      <div class="portal-reg uk-plate">${esc(v.reg||'—')}</div>
      <div class="portal-vehicle-info">${esc(v.year||'')} ${esc(v.make||'')} ${esc(v.model||'')}</div>
      ${v.motDue ? `<div class="portal-mot mot-${mot?.status}">
        <span class="portal-mot-label">MOT Due:</span>
        <span class="portal-mot-date">${formatDate(v.motDue)}</span>
        <span class="portal-mot-countdown">${mot?.label || ''}</span>
      </div>` : ''}
    </div>`;
}

async function loadPortalHistory(customerId) {
  const el = document.getElementById('portal-history');
  if (!el) return;
  try {
    const snap = await db.collection('garages').doc(garageId).collection('jobs')
      .where('customerId','==',customerId).where('status','==','complete').orderBy('completedAt','desc').limit(20).get();
    const jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!jobs.length) { el.innerHTML = '<p class="portal-empty">No service history yet.</p>'; return; }
    el.innerHTML = `<table class="portal-table"><thead><tr><th>Date</th><th>Service</th><th>Description</th><th>Cost</th></tr></thead><tbody>${
      jobs.map(j => `<tr><td>${j.completedAt?.toDate ? formatDate(j.completedAt.toDate().toISOString()) : '—'}</td><td>${esc(j.serviceType||j.service||'')}</td><td>${esc((j.description||'').slice(0,60))}</td><td>${formatCurrency(j.total||0)}</td></tr>`).join('')
    }</tbody></table>`;
  } catch {}
}

async function loadPortalInvoices(customerId) {
  const el = document.getElementById('portal-invoices');
  if (!el) return;
  try {
    const snap = await db.collection('garages').doc(garageId).collection('invoices')
      .where('customerId','==',customerId).orderBy('createdAt','desc').limit(20).get();
    const invs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!invs.length) { el.innerHTML = '<p class="portal-empty">No invoices on record.</p>'; return; }
    el.innerHTML = `<table class="portal-table"><thead><tr><th>Invoice #</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead><tbody>${
      invs.map(i => `<tr><td>${esc(i.invoiceNumber||'—')}</td><td>${i.createdAt?.toDate ? formatDate(i.createdAt.toDate().toISOString()) : '—'}</td><td>${formatCurrency(i.total||0)}</td><td><span class="portal-status portal-status-${i.status}">${esc(i.status||'')}</span></td></tr>`).join('')
    }</tbody></table>`;
  } catch {}
}

async function loadPortalVhcReports(customerId) {
  const el = document.getElementById('portal-vhc');
  if (!el) return;
  try {
    const snap = await db.collection('garages').doc(garageId).collection('vhc_reports')
      .where('customerId','==',customerId).orderBy('createdAt','desc').limit(3).get();
    const reports = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!reports.length) { el.innerHTML = '<p class="portal-empty">No VHC reports on record.</p>'; return; }
    el.innerHTML = reports.map(r => {
      const url = `/vhc.html?job=${r.jobId}&garage=${garageId}`;
      const expired = new Date(r.expiresAt) < new Date();
      return `<div class="portal-vhc-card${expired ? ' expired' : ''}">
        <div class="portal-vhc-date">${formatDate(r.inspectionDate)}</div>
        <div class="portal-vhc-summary">
          <span class="vhc-dot vhc-green">${r.summary?.green||0} ✅</span>
          <span class="vhc-dot vhc-amber">${r.summary?.amber||0} ⚠️</span>
          <span class="vhc-dot vhc-red">${r.summary?.red||0} 🔴</span>
        </div>
        ${expired ? '<p class="portal-expired">Report expired</p>' : `<a href="${url}" class="portal-vhc-link" target="_blank">View Report →</a>`}
      </div>`;
    }).join('');
  } catch {}
}

function showPortalError(msg) {
  document.getElementById('portalVerify').innerHTML = `<div class="portal-error"><i class="fas fa-exclamation-triangle"></i><h2>Oops!</h2><p>${esc(msg)}</p></div>`;
}
