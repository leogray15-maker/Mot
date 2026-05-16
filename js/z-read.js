/* ===========================
   GarageOS — Z-Read / End of Day
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, formatCurrency, esc } from './utils.js';

const FieldValue = firebase.firestore.FieldValue;

export function initZRead() {
  setupZReadUI();
  checkCloseOfDayVisibility();
  setInterval(checkCloseOfDayVisibility, 60000);
  loadZReadHistory();
  // Set default date to today
  const dateEl = document.getElementById('zreadDate');
  if (dateEl) dateEl.value = getTodayStr();
}

function checkCloseOfDayVisibility() {
  const hour = new Date().getHours();
  const btn  = document.getElementById('closeOfDayBtn');
  if (btn) btn.style.display = hour >= 16 ? '' : 'none';
}

function setupZReadUI() {
  document.getElementById('generateZreadBtn')?.addEventListener('click', () => {
    const date = document.getElementById('zreadDate')?.value || getTodayStr();
    generateZRead(date);
  });
  document.getElementById('closeOfDayBtn')?.addEventListener('click', () => {
    generateZRead(getTodayStr());
    if (window.openSection) window.openSection('zread');
  });
}

// ——— Generate Z-Read ———
export async function generateZRead(date) {
  const btn = document.getElementById('generateZreadBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Generating…'; }

  try {
    const tomorrow = new Date(date);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const [jobsSnap, invoicesSnap, noShowsSnap, tomorrowSnap] = await Promise.all([
      garageRef('jobs').where('status','==','complete').get(),
      garageRef('invoices').get(),
      garageRef('bookings').where('date','==',date).where('status','==','no_show').get(),
      garageRef('bookings').where('date','==',tomorrowStr).orderBy('time').get()
    ]);

    const allJobs     = docsToArr(jobsSnap);
    const allInvoices = docsToArr(invoicesSnap);
    const noShows     = docsToArr(noShowsSnap);
    const tomorrow_bks= docsToArr(tomorrowSnap);

    // Jobs completed today
    const todayJobs = allJobs.filter(j => {
      const d = j.completedAt?.toDate ? j.completedAt.toDate() : (j.updatedAt?.toDate ? j.updatedAt.toDate() : null);
      return d && d.toISOString().split('T')[0] === date;
    });

    // Invoices for today
    const todayInvoices = allInvoices.filter(i => (i.date||'').startsWith(date));
    const paidInvoices  = todayInvoices.filter(i => ['paid','partially_paid'].includes(i.status));

    const totalInvoiced = todayInvoices.reduce((s,i) => s+(i.total||0), 0);
    const outstanding   = todayInvoices.filter(i => !['paid'].includes(i.status)).reduce((s,i) => s+(i.balance||0), 0);

    // Payment breakdown
    let cashTotal = 0, cardTotal = 0, transferTotal = 0, totalCollected = 0;
    paidInvoices.forEach(i => {
      (i.payments || []).forEach(p => {
        const amt = p.amount || 0;
        totalCollected += amt;
        if (p.method === 'cash')     cashTotal += amt;
        else if (p.method === 'card') cardTotal += amt;
        else if (p.method === 'transfer') transferTotal += amt;
      });
    });

    const vatCollected = paidInvoices.reduce((s,i) => s+(i.vatAmount||0), 0);

    const summary = {
      completed: todayJobs.length,
      totalInvoiced,
      cashTotal,
      cardTotal,
      transferTotal,
      totalCollected,
      outstanding,
      vatCollected,
      noShowCount: noShows.length
    };

    // Render
    const html = renderZReadHtml({ date, summary, jobs: todayJobs, noShows, tomorrowBookings: tomorrow_bks });
    const outputEl = document.getElementById('zreadOutput');
    if (outputEl) outputEl.innerHTML = html;

    // Save to Firestore
    const user = firebase.auth().currentUser;
    await garageRef('z_reads').add({
      date,
      summary,
      jobs: todayJobs.map(j => ({ id: j.id, reg: j.reg, service: j.serviceType||j.service, total: j.total||0 })),
      noShows: noShows.map(n => ({ id: n.id, customerName: n.customerName, reg: n.reg, service: n.service })),
      tomorrowBookings: tomorrow_bks.map(b => ({ time: b.time, customerName: b.customerName, service: b.service, reg: b.reg })),
      generatedAt: FieldValue.serverTimestamp(),
      generatedBy: user?.email || 'unknown'
    });

    showToast('Z-Read generated', 'success');
    loadZReadHistory();

  } catch (err) {
    console.error(err);
    showToast('Failed to generate Z-Read', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-cash-register"></i> Generate Z-Read'; }
  }
}

function renderZReadHtml({ date, summary, jobs, noShows, tomorrowBookings }) {
  const { getSettings } = window;
  const s = (getSettings ? getSettings() : {});
  return `
    <div class="zread-report card">
      <div class="zread-header">
        <div><h2>${esc(s.garageName || 'Garage')} — End of Day Report</h2><p>${formatDate(date)}</p></div>
        <button class="btn-secondary" onclick="window.print()"><i class="fas fa-print"></i> Print</button>
      </div>

      <div class="zread-section">
        <h3>Jobs Completed Today (${summary.completed})</h3>
        ${jobs.length ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Reg</th><th>Service</th><th>Total</th></tr></thead>
          <tbody>${jobs.map(j => `<tr><td>${esc(j.reg||'')}</td><td>${esc(j.serviceType||j.service||'')}</td><td>${formatCurrency(j.total||0)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="text-muted">No jobs completed today.</p>'}
      </div>

      <div class="zread-section">
        <h3>Payment Summary</h3>
        <div class="zread-totals">
          <div class="zread-total-row"><span>Total Invoiced</span><strong>${formatCurrency(summary.totalInvoiced)}</strong></div>
          <div class="zread-total-row"><span>Cash Collected</span><strong>${formatCurrency(summary.cashTotal)}</strong></div>
          <div class="zread-total-row"><span>Card Collected</span><strong>${formatCurrency(summary.cardTotal)}</strong></div>
          <div class="zread-total-row"><span>Bank Transfer</span><strong>${formatCurrency(summary.transferTotal)}</strong></div>
          <div class="zread-total-row zread-total-main"><span>Total Collected</span><strong>${formatCurrency(summary.totalCollected)}</strong></div>
          <div class="zread-total-row ${summary.outstanding > 0 ? 'zread-outstanding' : ''}"><span>Outstanding</span><strong>${formatCurrency(summary.outstanding)}</strong></div>
          <div class="zread-total-row"><span>VAT Collected</span><strong>${formatCurrency(summary.vatCollected)}</strong></div>
        </div>
      </div>

      ${noShows.length ? `<div class="zread-section">
        <h3>No-Shows Today (${noShows.length})</h3>
        <ul>${noShows.map(n => `<li>${esc(n.customerName||'—')} — ${esc(n.reg||'—')} — ${esc(n.service||'')}</li>`).join('')}</ul>
      </div>` : ''}

      <div class="zread-section">
        <h3>Tomorrow's Bookings (${tomorrowBookings.length})</h3>
        ${tomorrowBookings.length ? `<div class="table-wrap"><table class="data-table">
          <thead><tr><th>Time</th><th>Customer</th><th>Service</th><th>Reg</th></tr></thead>
          <tbody>${tomorrowBookings.map(b => `<tr><td>${b.time||'—'}</td><td>${esc(b.customerName||'')}</td><td>${esc(b.service||b.serviceLabel||'')}</td><td>${esc(b.reg||'')}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="text-muted">No bookings for tomorrow.</p>'}
      </div>
    </div>`;
}

// ——— History ———
async function loadZReadHistory() {
  try {
    const snap  = await garageRef('z_reads').orderBy('date','desc').limit(30).get();
    const zreads = docsToArr(snap);
    renderZReadHistoryTable(zreads);
  } catch {}
}

function renderZReadHistoryTable(zreads) {
  const tbody = document.getElementById('zreadHistoryTbody');
  if (!tbody) return;
  if (!zreads.length) { tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No Z-reads generated yet.</td></tr>'; return; }
  tbody.innerHTML = zreads.map(z => `<tr>
    <td>${formatDate(z.date)}</td>
    <td>${z.summary?.completed||0}</td>
    <td>${formatCurrency(z.summary?.totalInvoiced||0)}</td>
    <td>${formatCurrency(z.summary?.totalCollected||0)}</td>
    <td>${formatCurrency(z.summary?.outstanding||0)}</td>
    <td>${esc(z.generatedBy||'—')}</td>
    <td><button class="btn-sm btn-secondary" onclick="viewZRead('${z.id}')"><i class="fas fa-eye"></i></button></td>
  </tr>`).join('');
}

window.viewZRead = async (id) => {
  try {
    const doc = await garageDoc('z_reads', id).get();
    if (!doc.exists) return;
    const z = doc.data();
    const html = renderZReadHtml({ date: z.date, summary: z.summary||{}, jobs: z.jobs||[], noShows: z.noShows||[], tomorrowBookings: z.tomorrowBookings||[] });
    const outputEl = document.getElementById('zreadOutput');
    if (outputEl) { outputEl.innerHTML = html; outputEl.scrollIntoView({ behavior:'smooth' }); }
  } catch (err) {
    showToast('Failed to load Z-Read', 'error');
  }
};

function getTodayStr() { return new Date().toISOString().split('T')[0]; }
