/* ===========================
   GarageOS — Reports Suite
   =========================== */

import { garageRef, docsToArr } from './firebase.js';
import { showToast, formatDate, formatCurrency, esc } from './utils.js';

let currentReportData = [];
let currentReportCols = [];
let currentReportTitle = '';

export function initReports() {
  setupReportsUI();
}

function setupReportsUI() {
  document.querySelectorAll('.report-card').forEach(card => {
    card.addEventListener('click', () => {
      const type = card.dataset.report;
      runReport(type);
    });
  });
  document.getElementById('exportReportBtn')?.addEventListener('click', exportCurrentReport);
  document.getElementById('printReportBtn')?.addEventListener('click', printCurrentReport);
}

async function runReport(type) {
  const from = document.getElementById('reportDateFrom')?.value;
  const to   = document.getElementById('reportDateTo')?.value;
  const dateRange = { from: from || getMonthStart(), to: to || getTodayStr() };

  showToast('Generating report…', 'info');
  try {
    let result;
    switch (type) {
      case 'dailyRevenue':    result = await dailyRevenue(dateRange); break;
      case 'weeklySummary':   result = await weeklySummary(dateRange); break;
      case 'monthlyPnL':      result = await monthlyPnL(dateRange); break;
      case 'vatReport':       result = await vatReport(dateRange); break;
      case 'techPerformance': result = await technicianPerformance(dateRange); break;
      case 'motPassFail':     result = await motPassFail(dateRange); break;
      case 'popularServices': result = await popularServices(dateRange); break;
      case 'retention':       result = await customerRetention(dateRange); break;
      case 'noShows':         result = await noShowReport(dateRange); break;
      case 'opportunities':   result = await opportunitiesReport(dateRange); break;
      case 'agedDebt':        result = await agedDebtors(); break;
      case 'stockMovement':   result = await stockMovement(dateRange); break;
      case 'heatmap':         result = await busyHeatmap(dateRange); break;
      case 'zReadHistory':    result = await zReadHistory(dateRange); break;
      case 'topCustomers':    result = await topCustomers(); break;
      default: showToast('Unknown report type', 'error'); return;
    }
    renderReportOutput(result.title, result.data, result.columns);
  } catch (err) {
    console.error(err);
    showToast('Failed to generate report', 'error');
  }
}

function renderReportOutput(title, data, columns) {
  currentReportTitle = title;
  currentReportData  = data;
  currentReportCols  = columns;

  document.getElementById('reportTitle').textContent = title;
  const content = document.getElementById('reportContent');
  if (!content) return;

  if (!data.length) { content.innerHTML = '<p class="text-muted">No data for the selected date range.</p>'; }
  else {
    content.innerHTML = `<div class="table-wrap"><table class="data-table">
      <thead><tr>${columns.map(c => `<th>${esc(c.label)}</th>`).join('')}</tr></thead>
      <tbody>${data.map(row => `<tr>${columns.map(c => `<td>${esc(String(row[c.key]??'—'))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }
  document.getElementById('reportOutput').style.display = '';
  document.getElementById('reportOutput').scrollIntoView({ behavior: 'smooth' });
}

// ——— Individual report functions ———

async function dailyRevenue(range) {
  const invs = await getInvoices(range);
  const byDate = {};
  invs.filter(i => i.status === 'paid').forEach(i => {
    const d = i.paidAt?.toDate ? i.paidAt.toDate().toISOString().split('T')[0] : (i.date||'');
    byDate[d] = (byDate[d]||0) + (i.total||0);
  });
  return {
    title: `Daily Revenue (${range.from} to ${range.to})`,
    columns: [{ key:'date', label:'Date' }, { key:'revenue', label:'Revenue' }],
    data: Object.entries(byDate).sort().map(([date,revenue]) => ({ date: formatDate(date), revenue: formatCurrency(revenue) }))
  };
}

async function weeklySummary(range) {
  const [invs, jobs, bookings] = await Promise.all([getInvoices(range), getJobs(range), getBookings(range)]);
  const paid = invs.filter(i => i.status === 'paid');
  return {
    title: `Weekly Summary (${range.from} to ${range.to})`,
    columns: [{ key:'metric', label:'Metric' }, { key:'value', label:'Value' }],
    data: [
      { metric:'Total Revenue', value: formatCurrency(paid.reduce((s,i)=>s+(i.total||0),0)) },
      { metric:'Invoices Raised', value: invs.length },
      { metric:'Jobs Completed', value: jobs.filter(j=>j.status==='complete').length },
      { metric:'Bookings', value: bookings.length },
      { metric:'No Shows', value: bookings.filter(b=>b.status==='no_show').length },
      { metric:'Avg Job Value', value: formatCurrency(paid.length ? paid.reduce((s,i)=>s+(i.total||0),0)/paid.length : 0) }
    ]
  };
}

async function monthlyPnL(range) {
  const invs = await getInvoices(range);
  const paid = invs.filter(i => i.status === 'paid');
  const income    = paid.reduce((s,i)=>s+(i.total||0), 0);
  const partsCost = paid.reduce((s,i)=>s+(i.partsCost||0), 0);
  const labour    = paid.reduce((s,i)=>s+(i.labourTotal||0), 0);
  const vat       = paid.reduce((s,i)=>s+(i.vatAmount||0), 0);
  return {
    title: `Monthly P&L (${range.from} to ${range.to})`,
    columns: [{ key:'item', label:'Item' }, { key:'amount', label:'Amount' }],
    data: [
      { item:'Total Income', amount: formatCurrency(income) },
      { item:'Parts Cost', amount: formatCurrency(partsCost) },
      { item:'Labour Revenue', amount: formatCurrency(labour) },
      { item:'VAT Collected', amount: formatCurrency(vat) },
      { item:'Gross Profit', amount: formatCurrency(income - partsCost) }
    ]
  };
}

async function vatReport(range) {
  const invs = await getInvoices(range);
  const paid = invs.filter(i => i.status === 'paid');
  const netSales = paid.reduce((s,i)=>s+((i.total||0)-(i.vatAmount||0)), 0);
  const vatOut   = paid.reduce((s,i)=>s+(i.vatAmount||0), 0);
  return {
    title: `VAT Report (${range.from} to ${range.to})`,
    columns: [{ key:'description', label:'Description' }, { key:'net', label:'Net' }, { key:'vat', label:'VAT' }, { key:'gross', label:'Gross' }],
    data: [
      { description:'Standard Rated Sales (20%)', net: formatCurrency(netSales), vat: formatCurrency(vatOut), gross: formatCurrency(netSales+vatOut) },
      { description:'TOTAL', net: formatCurrency(netSales), vat: formatCurrency(vatOut), gross: formatCurrency(netSales+vatOut) }
    ]
  };
}

async function technicianPerformance(range) {
  const jobs = await getJobs(range);
  const complete = jobs.filter(j => j.status === 'complete');
  const byTech = {};
  complete.forEach(j => {
    const t = j.assignedTech || 'Unassigned';
    if (!byTech[t]) byTech[t] = { jobs: 0, revenue: 0, hours: 0 };
    byTech[t].jobs++;
    byTech[t].revenue += j.total || 0;
    byTech[t].hours   += j.actualHours || j.estimatedHours || 0;
  });
  return {
    title: `Technician Performance (${range.from} to ${range.to})`,
    columns: [{ key:'tech', label:'Technician' }, { key:'jobs', label:'Jobs' }, { key:'revenue', label:'Revenue' }, { key:'hours', label:'Hours' }, { key:'avgValue', label:'Avg Value' }],
    data: Object.entries(byTech).map(([tech, d]) => ({ tech, jobs: d.jobs, revenue: formatCurrency(d.revenue), hours: d.hours.toFixed(1), avgValue: formatCurrency(d.jobs ? d.revenue/d.jobs : 0) }))
  };
}

async function motPassFail(range) {
  const jobs = await getJobs(range);
  const mots  = jobs.filter(j => (j.serviceType||j.service||'').toLowerCase().includes('mot'));
  const pass  = mots.filter(j => j.motResult === 'pass').length;
  const fail  = mots.filter(j => j.motResult === 'fail').length;
  const other = mots.length - pass - fail;
  return {
    title: `MOT Pass/Fail (${range.from} to ${range.to})`,
    columns: [{ key:'result', label:'Result' }, { key:'count', label:'Count' }, { key:'percent', label:'%' }],
    data: [
      { result:'Pass', count: pass, percent: mots.length ? Math.round(pass/mots.length*100)+'%' : '—' },
      { result:'Fail', count: fail, percent: mots.length ? Math.round(fail/mots.length*100)+'%' : '—' },
      { result:'Advisory/Other', count: other, percent: '—' },
      { result:'Total MOTs', count: mots.length, percent: '100%' }
    ]
  };
}

async function popularServices(range) {
  const jobs = await getJobs(range);
  const counts = {};
  jobs.forEach(j => {
    const s = j.serviceType || j.service || 'Other';
    if (!counts[s]) counts[s] = { count: 0, revenue: 0 };
    counts[s].count++;
    counts[s].revenue += j.total || 0;
  });
  const sorted = Object.entries(counts).sort((a,b) => b[1].count - a[1].count);
  return {
    title: `Popular Services (${range.from} to ${range.to})`,
    columns: [{ key:'service', label:'Service' }, { key:'count', label:'Count' }, { key:'revenue', label:'Revenue' }],
    data: sorted.map(([service, d]) => ({ service, count: d.count, revenue: formatCurrency(d.revenue) }))
  };
}

async function customerRetention(range) {
  const [customers, jobs] = await Promise.all([
    garageRef('customers').get().then(s => docsToArr(s)),
    getJobs(range)
  ]);
  const jobCustomerIds = new Set(jobs.map(j => j.customerId).filter(Boolean));
  const returning = [...jobCustomerIds].filter(id => {
    const c = customers.find(x => x.id === id);
    return c && c.createdAt?.toDate ? c.createdAt.toDate() < new Date(range.from) : false;
  }).length;
  const newCust = [...jobCustomerIds].length - returning;
  return {
    title: `Customer Retention (${range.from} to ${range.to})`,
    columns: [{ key:'metric', label:'Metric' }, { key:'value', label:'Value' }],
    data: [
      { metric:'Returning Customers', value: returning },
      { metric:'New Customers', value: newCust },
      { metric:'Total Active', value: jobCustomerIds.size },
      { metric:'Retention Rate', value: jobCustomerIds.size ? Math.round(returning/jobCustomerIds.size*100)+'%' : '—' }
    ]
  };
}

async function noShowReport(range) {
  const bookings = await getBookings(range);
  const noShows  = bookings.filter(b => b.status === 'no_show');
  const avgValue = 85; // estimate
  return {
    title: `No-Show Report (${range.from} to ${range.to})`,
    columns: [{ key:'date', label:'Date' }, { key:'customer', label:'Customer' }, { key:'service', label:'Service' }, { key:'reg', label:'Reg' }],
    data: [
      ...noShows.map(b => ({ date: b.date||'—', customer: b.customerName||'—', service: b.service||b.serviceLabel||'—', reg: b.reg||'—' })),
      { date:'TOTAL', customer: `${noShows.length} no-shows`, service: '', reg: `Est. lost: ${formatCurrency(noShows.length * avgValue)}` }
    ]
  };
}

async function opportunitiesReport(range) {
  const snap = await garageRef('opportunities').get();
  const opps = docsToArr(snap);
  const won   = opps.filter(o => o.status === 'won');
  const lost  = opps.filter(o => o.status === 'lost');
  const wonValue = won.reduce((s,o)=>s+(o.value||0), 0);
  return {
    title: `Opportunities Report`,
    columns: [{ key:'metric', label:'Metric' }, { key:'value', label:'Value' }],
    data: [
      { metric:'Total Opportunities', value: opps.length },
      { metric:'Won', value: won.length },
      { metric:'Lost', value: lost.length },
      { metric:'Win Rate', value: (won.length+lost.length) ? Math.round(won.length/(won.length+lost.length)*100)+'%' : '—' },
      { metric:'Revenue Won', value: formatCurrency(wonValue) },
      { metric:'Avg Won Value', value: formatCurrency(won.length ? wonValue/won.length : 0) }
    ]
  };
}

async function agedDebtors() {
  const invs = await garageRef('invoices').where('status','in',['sent','overdue','partially_paid']).get().then(s => docsToArr(s));
  const now = Date.now();
  const aged = { '0-30': [], '31-60': [], '60+': [] };
  invs.forEach(i => {
    const due = i.dueDate ? new Date(i.dueDate).getTime() : now;
    const days = Math.max(0, Math.floor((now - due) / 86400000));
    if (days <= 30) aged['0-30'].push(i);
    else if (days <= 60) aged['31-60'].push(i);
    else aged['60+'].push(i);
  });
  return {
    title: 'Aged Debtors',
    columns: [{ key:'band', label:'Age Band' }, { key:'count', label:'Invoices' }, { key:'total', label:'Amount Due' }],
    data: Object.entries(aged).map(([band, items]) => ({ band: `${band} days`, count: items.length, total: formatCurrency(items.reduce((s,i)=>s+(i.balance||0),0)) }))
  };
}

async function stockMovement(range) {
  const snap = await garageRef('stock_movements').orderBy('createdAt','desc').limit(200).get();
  const moves = docsToArr(snap).filter(m => {
    const d = m.createdAt?.toDate ? m.createdAt.toDate().toISOString().split('T')[0] : '';
    return d >= range.from && d <= range.to;
  });
  return {
    title: `Stock Movement (${range.from} to ${range.to})`,
    columns: [{ key:'date', label:'Date' }, { key:'partName', label:'Part' }, { key:'delta', label:'Change' }, { key:'newQty', label:'New Stock' }, { key:'reason', label:'Reason' }],
    data: moves.map(m => ({ date: m.createdAt?.toDate ? formatDate(m.createdAt.toDate().toISOString()) : '—', partName: m.partName||'—', delta: (m.delta>0?'+':'')+m.delta, newQty: m.newQty, reason: m.reason||'—' }))
  };
}

async function busyHeatmap(range) {
  const bookings = await getBookings(range);
  const grid = {};
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  days.forEach(d => grid[d] = {});
  bookings.forEach(b => {
    if (!b.date || !b.time) return;
    const dow = days[(new Date(b.date).getDay()+6)%7];
    const hour = b.time.split(':')[0];
    grid[dow][hour] = (grid[dow][hour]||0)+1;
  });
  const hours = Array.from({length:10}, (_,i) => String(i+8).padStart(2,'0'));
  return {
    title: `Busy Times Heatmap (${range.from} to ${range.to})`,
    columns: [{ key:'day', label:'Day' }, ...hours.map(h => ({ key:h, label:`${h}:00` }))],
    data: days.map(d => { const row={day:d}; hours.forEach(h => { row[h]=grid[d][h]||0; }); return row; })
  };
}

async function zReadHistory(range) {
  const snap = await garageRef('z_reads').orderBy('date','desc').get();
  const zreads = docsToArr(snap).filter(z => z.date >= range.from && z.date <= range.to);
  return {
    title: `Z-Read History (${range.from} to ${range.to})`,
    columns: [{ key:'date', label:'Date' }, { key:'jobs', label:'Jobs' }, { key:'invoiced', label:'Invoiced' }, { key:'collected', label:'Collected' }, { key:'outstanding', label:'Outstanding' }],
    data: zreads.map(z => ({ date: z.date, jobs: z.summary?.completed||0, invoiced: formatCurrency(z.summary?.totalInvoiced||0), collected: formatCurrency(z.summary?.totalCollected||0), outstanding: formatCurrency(z.summary?.outstanding||0) }))
  };
}

async function topCustomers() {
  const snap = await garageRef('customers').orderBy('lifetimeSpend','desc').limit(10).get();
  const custs = docsToArr(snap);
  return {
    title: 'Top 10 Customers by Spend',
    columns: [{ key:'rank', label:'#' }, { key:'name', label:'Name' }, { key:'phone', label:'Phone' }, { key:'vehicles', label:'Vehicles' }, { key:'spend', label:'Lifetime Spend' }, { key:'lastVisit', label:'Last Visit' }],
    data: custs.map((c,i) => ({ rank:i+1, name: c.name||'—', phone: c.phone||'—', vehicles: (c.vehicles||[]).map(v=>v.reg).join(', ')||'—', spend: formatCurrency(c.lifetimeSpend||0), lastVisit: c.lastVisit ? formatDate(c.lastVisit) : '—' }))
  };
}

// ——— Helpers ———
async function getInvoices(range) {
  const snap = await garageRef('invoices').where('date','>=',range.from).where('date','<=',range.to).get();
  return docsToArr(snap);
}

async function getJobs(range) {
  const snap = await garageRef('jobs').where('createdAt','>=',new Date(range.from)).where('createdAt','<=',new Date(range.to+'T23:59:59')).get();
  return docsToArr(snap);
}

async function getBookings(range) {
  const snap = await garageRef('bookings').where('date','>=',range.from).where('date','<=',range.to).get();
  return docsToArr(snap);
}

function docsToArr(snap) {
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function getMonthStart() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().split('T')[0];
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

function exportCurrentReport() {
  if (!currentReportData.length) { showToast('Run a report first', 'warning'); return; }
  const rows  = [currentReportCols.map(c => c.label), ...currentReportData.map(row => currentReportCols.map(c => row[c.key] ?? ''))];
  const csv   = rows.map(r => r.map(f => `"${String(f).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a     = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
  a.download  = `${currentReportTitle.replace(/[^a-z0-9]/gi,'_')}.csv`; a.click();
}

function printCurrentReport() {
  window.print();
}
