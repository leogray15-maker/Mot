/* ===========================
   Premier MOT — Revenue Dashboard (Firebase)
   =========================== */

import { db, garageRef, showSpinner, hideSpinner } from './firebase.js';
import { showToast, formatDate, esc } from './utils.js';

let revenueCharts = {};

function jobDate(j) {
  if (!j.createdAt) return j.dateIn ? new Date(j.dateIn) : new Date(0);
  if (j.createdAt.toDate) return j.createdAt.toDate();
  return new Date(j.createdAt);
}

function jobVal(j) {
  return parseFloat(j.total || j.jobValue || 0);
}

async function loadRevenue() {
  showSpinner('page-revenue');
  let jobs = [];
  try {
    const snap = await garageRef('jobs').where('status', 'in', ['complete', 'Complete', 'completed', 'Completed']).get();
    jobs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    showToast('Failed to load revenue data', 'error');
  }
  hideSpinner('page-revenue');

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const thisMonth = jobs.filter(j => jobDate(j) >= thisMonthStart);

  const sum = arr => arr.reduce((t, j) => t + jobVal(j), 0);

  const thisMonthRev = sum(thisMonth);
  const avgJobVal    = jobs.length > 0 ? sum(jobs) / jobs.length : 0;

  setText('revTotal',       '£' + thisMonthRev.toFixed(2));
  setText('revJobs',        thisMonth.length);
  setText('revAvg',         '£' + avgJobVal.toFixed(2));
  setText('revOutstanding', '£' + (sum(jobs) - sum(thisMonth)).toFixed(2));

  renderMonthlyChart(jobs);
  renderServiceChart(jobs);
  renderRevenueTable(jobs);
}

function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }

function renderMonthlyChart(jobs) {
  const canvas = document.getElementById('revenueChart');
  if (!canvas) return;
  if (revenueCharts.line) revenueCharts.line.destroy();

  const now = new Date();
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return { label: d.toLocaleString('en-GB', { month: 'short', year: '2-digit' }), year: d.getFullYear(), month: d.getMonth() };
  });

  const data = months.map(m =>
    jobs.filter(j => { const d = jobDate(j); return d.getFullYear() === m.year && d.getMonth() === m.month; })
      .reduce((t, j) => t + jobVal(j), 0)
  );

  revenueCharts.line = new Chart(canvas, {
    type: 'line',
    data: {
      labels: months.map(m => m.label),
      datasets: [{ label: 'Revenue (£)', data, borderColor: '#e02020', backgroundColor: 'rgba(224,32,32,0.08)', tension: 0.4, fill: true, pointBackgroundColor: '#e02020', pointRadius: 5, pointHoverRadius: 7 }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ' £' + ctx.raw.toFixed(2) } } },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#909090' } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#909090', callback: v => '£' + v } }
      }
    }
  });
}

function renderServiceChart(jobs) {
  const canvas = document.getElementById('serviceChart');
  if (!canvas) return;
  if (revenueCharts.donut) revenueCharts.donut.destroy();

  const serviceMap = {};
  jobs.forEach(j => { const k = j.serviceType || 'Other'; serviceMap[k] = (serviceMap[k] || 0) + jobVal(j); });

  const labels = Object.keys(serviceMap);
  if (labels.length === 0) return;

  revenueCharts.donut = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: labels.map(l => serviceMap[l]), backgroundColor: ['#e02020','#f59e0b','#22c55e','#3b82f6','#a78bfa','#f97316','#06b6d4'], borderColor: '#171717', borderWidth: 3 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#a0a0a0', padding: 16, boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: £${ctx.raw.toFixed(2)}` } }
      }
    }
  });
}

function renderRevenueTable(jobs) {
  const tbody = document.getElementById('recentJobsTbody');
  if (!tbody) return;
  const recent = [...jobs].sort((a, b) => jobDate(b) - jobDate(a)).slice(0, 15);
  if (recent.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="table-empty"><i class="fas fa-chart-bar"></i>No completed jobs yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = recent.map(j => `
    <tr>
      <td class="td-muted">${formatDate(jobDate(j).toISOString())}</td>
      <td class="td-name">${esc(j.customerName || '—')}</td>
      <td>${esc(j.serviceType || '—')}</td>
      <td class="td-mono">${esc(j.reg || '—')}</td>
      <td style="color:var(--green);font-weight:700">£${jobVal(j).toFixed(2)}</td>
    </tr>`).join('');
}

window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaders['revenue'] = loadRevenue;
