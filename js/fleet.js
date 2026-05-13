/* ===========================
   GarageOS — Fleet Management
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, formatCurrency, esc, countdown } from './utils.js';
import { showModal } from './ui.js';

const FieldValue = firebase.firestore.FieldValue;
let fleetCustomers = [];

export async function initFleet() {
  await loadFleetCustomers();
}

async function loadFleetCustomers() {
  try {
    const snap = await garageRef('customers').where('isFleet','==',true).orderBy('name').get();
    fleetCustomers = docsToArr(snap);
    renderFleetDashboard(fleetCustomers);
  } catch (err) {
    showToast('Failed to load fleet data', 'error');
  }
}

function renderFleetDashboard(customers) {
  const el = document.getElementById('fleetDashboard');
  if (!el) return;
  if (!customers.length) {
    el.innerHTML = `<div class="empty-state"><i class="fas fa-truck fa-3x"></i><h3>No fleet customers</h3><p>Mark a customer as "Fleet" in their profile to manage their vehicles here.</p></div>`;
    return;
  }

  el.innerHTML = customers.map(c => {
    const vehicles = c.vehicles || [];
    const allDue   = vehicles.filter(v => {
      if (!v.motDue) return false;
      const cd = countdown(v.motDue);
      return cd.status !== 'ok';
    });
    return `<div class="fleet-customer-card card">
      <div class="fleet-customer-header">
        <div>
          <h3>${esc(c.name)}</h3>
          ${c.fleetName ? `<span class="text-muted">${esc(c.fleetName)}</span>` : ''}
        </div>
        <div class="fleet-actions">
          <span class="fleet-vehicle-count">${vehicles.length} vehicles</span>
          <button class="btn-sm btn-wa" onclick="fleetBulkWhatsApp('${c.id}')"><i class="fab fa-whatsapp"></i> Bulk Reminder</button>
          <button class="btn-sm btn-secondary" onclick="viewFleetCustomer('${c.id}')"><i class="fas fa-eye"></i> View All</button>
        </div>
      </div>
      <div class="fleet-vehicles-grid">
        ${vehicles.map(v => renderFleetVehicle(v)).join('')}
      </div>
      ${allDue.length ? `<div class="fleet-alert"><i class="fas fa-exclamation-triangle"></i> ${allDue.length} vehicle${allDue.length>1?'s':''} need attention</div>` : ''}
    </div>`;
  }).join('');
}

function renderFleetVehicle(v) {
  const mot = v.motDue ? countdown(v.motDue) : null;
  return `<div class="fleet-vehicle-card mot-${mot?.status||'ok'}">
    <span class="uk-plate">${esc(v.reg||'—')}</span>
    <span class="fleet-vehicle-info">${esc(v.year||'')} ${esc(v.make||'')} ${esc(v.model||'')}</span>
    ${mot ? `<span class="mot-badge mot-${mot.status}">MOT: ${mot.label}</span>` : ''}
  </div>`;
}

window.viewFleetCustomer = (id) => {
  if (window.openCustomerById) window.openCustomerById(id);
};

window.fleetBulkWhatsApp = async (customerId) => {
  const c = fleetCustomers.find(x => x.id === customerId);
  if (!c?.phone) { showToast('No phone number for this fleet customer', 'warning'); return; }
  const dueVehicles = (c.vehicles||[]).filter(v => {
    if (!v.motDue) return false;
    return countdown(v.motDue).status !== 'ok';
  });
  if (!dueVehicles.length) { showToast('No vehicles requiring attention', 'info'); return; }

  const lines = dueVehicles.map(v => `• ${v.reg}: MOT ${formatDate(v.motDue)} (${countdown(v.motDue).label})`).join('\n');
  const msg   = `Hi ${c.name.split(' ')[0]},\n\nPlease note the following vehicles in your fleet require attention:\n\n${lines}\n\nPlease contact us to arrange bookings.\n— Your Garage`;
  const phone = c.phone.replace(/\s/g,'').replace(/^0/,'44');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
};

// ——— Fleet statement generation ———
export async function generateFleetStatement(customerId, dateFrom, dateTo) {
  try {
    const [custSnap, jobsSnap] = await Promise.all([
      garageDoc('customers', customerId).get(),
      garageRef('jobs').where('customerId','==',customerId).where('status','==','complete').get()
    ]);
    const c = { id: custSnap.id, ...custSnap.data() };
    const jobs = docsToArr(jobsSnap).filter(j => {
      const d = j.completedAt?.toDate ? j.completedAt.toDate() : new Date(j.completedAt||0);
      return d >= new Date(dateFrom) && d <= new Date(dateTo);
    });
    const total = jobs.reduce((s, j) => s + (j.total||0), 0);
    return { customer: c, jobs, total, dateFrom, dateTo };
  } catch (err) {
    console.error(err);
    return null;
  }
}
