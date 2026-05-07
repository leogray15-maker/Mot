/* ===========================
   Premier MOT — Invoices
   =========================== */

const INVOICES_KEY = 'premier_invoices';
const INV_COUNTER_KEY = 'premier_invoice_counter';

function getInvoices() { return JSON.parse(localStorage.getItem(INVOICES_KEY) || '[]'); }
function saveInvoices(data) { localStorage.setItem(INVOICES_KEY, JSON.stringify(data)); }

function getNextInvoiceNumber() {
  const n = parseInt(localStorage.getItem(INV_COUNTER_KEY) || '0') + 1;
  localStorage.setItem(INV_COUNTER_KEY, String(n));
  return 'INV-' + String(n).padStart(4, '0');
}

function loadInvoicesSection() {
  renderInvoicesList();
}

function renderInvoicesList() {
  const invoices = getInvoices().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const tbody = document.getElementById('invoicesBody');
  if (!tbody) return;
  if (invoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-empty"><i class="fas fa-file-invoice-pound"></i>No invoices yet. Create one from a completed job card.</td></tr>`;
    return;
  }
  tbody.innerHTML = invoices.map(inv => `
    <tr>
      <td class="td-mono" style="font-weight:600">${esc(inv.invoiceNumber)}</td>
      <td class="td-muted">${formatDate(inv.date)}</td>
      <td class="td-name">${esc(inv.customerName||'—')}</td>
      <td>${esc(inv.service||'—')}</td>
      <td style="font-weight:700;color:var(--white)">£${parseFloat(inv.total||0).toFixed(2)}</td>
      <td>
        <select class="status-select" onchange="updateInvoiceStatus(${inv.id},this.value)">
          ${['Unpaid','Paid','Overdue'].map(s=>`<option value="${s}"${inv.paymentStatus===s?' selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="viewInvoiceModal(${inv.id})" title="View"><i class="fas fa-eye"></i></button>
          <button class="action-btn" onclick="printInvoice(${inv.id})" title="Print / PDF"><i class="fas fa-print"></i></button>
          <button class="action-btn success" onclick="sendInvoiceWA(${inv.id})" title="Send via WhatsApp"><i class="fab fa-whatsapp"></i></button>
          <button class="action-btn danger" onclick="deleteInvoice(${inv.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function createInvoiceFromJob(jobId) {
  const jobs = getJobs ? getJobs() : JSON.parse(localStorage.getItem('premier_jobs') || '[]');
  const j = jobs.find(x => x.id === jobId);
  if (!j) { showToast('Job not found', 'error'); return; }

  const s = getSettings();
  const invoiceNum = getNextInvoiceNumber();
  const customers = getCustomers();
  const cust = customers.find(c => c.id === j.customerId) || {};
  const vatRate = s.vatRegistered ? 0.2 : 0;
  const subtotal = parseFloat(j.jobValue || 0);
  const vatAmount = subtotal * vatRate;
  const total = subtotal + vatAmount;

  const invoice = {
    id: Date.now(),
    invoiceNumber: invoiceNum,
    jobId,
    customerId: j.customerId,
    customerName: j.customerName,
    customerPhone: cust.phone || '',
    customerEmail: cust.email || '',
    reg: j.reg,
    service: j.serviceType,
    date: j.dateIn || new Date().toISOString().split('T')[0],
    items: [
      ...(j.parts || []).map(p => ({ desc: p.name, qty: p.qty, unit: p.cost, total: p.total })),
      { desc: `Labour (${j.labourHours}hrs @ £${j.labourRate}/hr)`, qty: 1, unit: (j.labourHours||0)*(j.labourRate||0), total: (j.labourHours||0)*(j.labourRate||0) }
    ],
    subtotal,
    vatApplied: s.vatRegistered,
    vatRate: s.vatRegistered ? 20 : 0,
    vatAmount,
    total,
    paymentStatus: 'Unpaid',
    notes: j.notes || '',
    createdAt: new Date().toISOString()
  };

  const invoices = getInvoices();
  invoices.push(invoice);
  saveInvoices(invoices);
  addNotification('invoice_overdue', `Invoice ${invoiceNum} created for ${j.customerName}`, 'invoices');
  showToast(`Invoice ${invoiceNum} created`, 'success');
  if (typeof navigate === 'function') navigate('invoices');
}

function updateInvoiceStatus(id, status) {
  const invoices = getInvoices();
  const idx = invoices.findIndex(i => i.id === id);
  if (idx !== -1) { invoices[idx].paymentStatus = status; saveInvoices(invoices); showToast('Payment status updated', 'success'); }
}

function deleteInvoice(id) {
  if (!confirm('Delete this invoice?')) return;
  saveInvoices(getInvoices().filter(i => i.id !== id));
  renderInvoicesList();
  showToast('Invoice deleted', 'info');
}

function viewInvoiceModal(id) {
  const inv = getInvoices().find(x => x.id === id);
  if (!inv) return;
  const overlay = document.getElementById('invoiceDetailModal');
  const content = document.getElementById('invoiceDetailContent');
  if (!overlay || !content) return;
  const s = getSettings();
  const statusColors = { Paid: 'badge-completed', Unpaid: 'badge-new', Overdue: 'badge-cancelled' };

  content.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid var(--border)">
      <div>
        <div style="font-size:1.4rem;font-weight:900;color:var(--white)">${esc(inv.invoiceNumber)}</div>
        <div style="font-size:0.82rem;color:var(--text-dim);margin-top:2px">Issued: ${formatDate(inv.date)}</div>
      </div>
      <span class="badge ${statusColors[inv.paymentStatus]||'badge-new'}">${esc(inv.paymentStatus)}</span>
    </div>
    <div class="detail-grid" style="margin-bottom:16px">
      <div class="detail-item"><label>Customer</label><p>${esc(inv.customerName)}</p></div>
      <div class="detail-item"><label>Vehicle Reg</label><p class="mono">${esc(inv.reg||'—')}</p></div>
      <div class="detail-item"><label>Phone</label><p>${esc(inv.customerPhone||'—')}</p></div>
      <div class="detail-item"><label>Email</label><p>${esc(inv.customerEmail||'—')}</p></div>
    </div>
    <table style="width:100%;font-size:0.82rem;border-collapse:collapse;margin-bottom:16px">
      <thead><tr>
        <th style="text-align:left;padding:8px 10px;background:var(--dark-3);color:var(--text-dim);font-size:0.72rem;text-transform:uppercase">Description</th>
        <th style="padding:8px 10px;background:var(--dark-3);color:var(--text-dim);font-size:0.72rem;text-transform:uppercase">Qty</th>
        <th style="padding:8px 10px;background:var(--dark-3);color:var(--text-dim);font-size:0.72rem;text-transform:uppercase">Unit</th>
        <th style="padding:8px 10px;background:var(--dark-3);color:var(--text-dim);font-size:0.72rem;text-transform:uppercase">Total</th>
      </tr></thead>
      <tbody>${(inv.items||[]).map(item=>`<tr><td style="padding:8px 10px;border-bottom:1px solid var(--border)">${esc(item.desc)}</td><td style="padding:8px 10px;border-bottom:1px solid var(--border);text-align:center">${item.qty}</td><td style="padding:8px 10px;border-bottom:1px solid var(--border)">£${parseFloat(item.unit).toFixed(2)}</td><td style="padding:8px 10px;border-bottom:1px solid var(--border);font-weight:600">£${parseFloat(item.total).toFixed(2)}</td></tr>`).join('')}</tbody>
    </table>
    <div style="text-align:right;font-size:0.9rem">
      <div style="display:flex;justify-content:flex-end;gap:40px;padding:6px 0;color:var(--text-muted)"><span>Subtotal</span><span>£${parseFloat(inv.subtotal||0).toFixed(2)}</span></div>
      ${inv.vatApplied?`<div style="display:flex;justify-content:flex-end;gap:40px;padding:6px 0;color:var(--text-muted)"><span>VAT (${inv.vatRate||20}%)</span><span>£${parseFloat(inv.vatAmount||0).toFixed(2)}</span></div>`:''}
      <div style="display:flex;justify-content:flex-end;gap:40px;padding:10px 0;border-top:1px solid var(--border);font-size:1.1rem;font-weight:900;color:var(--white)"><span>Total</span><span style="color:var(--green)">£${parseFloat(inv.total||0).toFixed(2)}</span></div>
    </div>
    ${s.bankDetails?`<div style="margin-top:12px;padding:12px;background:var(--dark-3);border-radius:var(--radius);font-size:0.82rem;color:var(--text-muted)"><strong style="color:var(--text)">Bank Details:</strong> ${esc(s.bankDetails)}</div>`:''}
    <div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap">
      <button class="btn-sm btn-ghost-sm" onclick="printInvoice(${inv.id})"><i class="fas fa-print"></i> Print / PDF</button>
      <button class="btn-sm btn-success-sm" onclick="sendInvoiceWA(${inv.id})"><i class="fab fa-whatsapp"></i> Send via WhatsApp</button>
    </div>`;
  overlay.classList.add('open');
}

function sendInvoiceWA(id) {
  const inv = getInvoices().find(x => x.id === id);
  if (!inv) return;
  const customers = getCustomers();
  const cust = customers.find(c => c.id === inv.customerId) || { phone: inv.customerPhone, name: inv.customerName };
  if (!cust.phone) { showToast('No phone number for this customer', 'error'); return; }
  const msg = buildInvoiceWhatsAppMessage(inv);
  openWhatsApp(cust.phone, msg);
}

function printInvoice(id) {
  const inv = getInvoices().find(x => x.id === id);
  if (!inv) return;
  const s = getSettings();
  const itemRows = (inv.items||[]).map(i=>`<tr><td>${esc(i.desc)}</td><td>${i.qty}</td><td>£${parseFloat(i.unit).toFixed(2)}</td><td>£${parseFloat(i.total).toFixed(2)}</td></tr>`).join('');
  const statusColors = { Paid:'#065f46', Unpaid:'#1e40af', Overdue:'#991b1b' };
  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>${esc(inv.invoiceNumber)}</title>
  <style>body{font-family:Arial,sans-serif;max-width:800px;margin:30px auto;color:#111;font-size:13px}
  h1{font-size:22px;margin:0;color:#e02020}
  table{width:100%;border-collapse:collapse;margin:16px 0}th,td{border:1px solid #ddd;padding:9px 12px;text-align:left}
  th{background:#f5f5f5;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.5px}
  .totals{width:320px;margin-left:auto;border-collapse:collapse}
  .totals td{border:none;padding:6px 12px;font-size:13px}
  .totals tr.grand td{border-top:2px solid #e02020;font-weight:700;font-size:16px;color:#e02020}
  .status-badge{display:inline-block;padding:4px 12px;border-radius:4px;font-size:12px;font-weight:700;color:#fff;background:${statusColors[inv.paymentStatus]||'#1e40af'}}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:20px 0}
  .field label{font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.5px;display:block;margin-bottom:2px}
  .field p{font-weight:600;margin:0}
  @media print{.no-print{display:none}}</style></head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #e02020;margin-bottom:24px">
    <div><h1>${esc(s.garageName)}</h1><div style="font-size:12px;color:#666;margin-top:4px">${esc(s.address)}<br>${esc(s.phone)} | ${esc(s.email)}${s.vatRegistered&&s.vatNumber?'<br>VAT: '+esc(s.vatNumber):''}</div></div>
    <div style="text-align:right"><div style="font-size:24px;font-weight:900;color:#111">INVOICE</div><div style="font-size:18px;font-weight:700;color:#e02020;margin:4px 0">${esc(inv.invoiceNumber)}</div><div style="font-size:12px;color:#888">Date: ${formatDate(inv.date)}</div><div style="margin-top:8px"><span class="status-badge">${esc(inv.paymentStatus)}</span></div></div>
  </div>
  <div class="grid">
    <div><h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:12px">Bill To</h3><div class="field"><p>${esc(inv.customerName)}</p></div><div style="color:#666;font-size:12px;margin-top:4px">${esc(inv.customerPhone||'')}${inv.customerEmail?'<br>'+esc(inv.customerEmail):''}</div></div>
    <div><h3 style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:#888;margin-bottom:12px">Vehicle</h3><div class="field"><label>Registration</label><p style="font-family:monospace;font-size:16px">${esc(inv.reg||'—')}</p></div></div>
  </div>
  <table><thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${itemRows}</tbody></table>
  <table class="totals">
    <tr><td>Subtotal</td><td style="text-align:right">£${parseFloat(inv.subtotal||0).toFixed(2)}</td></tr>
    ${inv.vatApplied?`<tr><td>VAT (${inv.vatRate||20}%)</td><td style="text-align:right">£${parseFloat(inv.vatAmount||0).toFixed(2)}</td></tr>`:''}
    <tr class="grand"><td>TOTAL DUE</td><td style="text-align:right">£${parseFloat(inv.total||0).toFixed(2)}</td></tr>
  </table>
  ${s.bankDetails?`<div style="margin-top:24px;padding:12px;background:#f9f9f9;border-radius:4px"><strong>Payment Details:</strong> ${esc(s.bankDetails)}</div>`:''}
  ${inv.notes?`<div style="margin-top:12px;color:#666">Notes: ${esc(inv.notes)}</div>`:''}
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center">Thank you for choosing ${esc(s.garageName)}. Please retain this invoice for your records.</div>
  <button class="no-print" onclick="window.print()" style="margin-top:24px;padding:10px 20px;background:#e02020;color:#fff;border:none;border-radius:4px;font-size:14px;cursor:pointer">Print / Save PDF</button>
  <script>window.onload=()=>window.print();</script></body></html>`);
  win.document.close();
}

document.getElementById('closeInvoiceModal')?.addEventListener('click', () => document.getElementById('invoiceDetailModal')?.classList.remove('open'));
document.getElementById('invoiceDetailModal')?.addEventListener('click', e => { if(e.target===e.currentTarget) e.currentTarget.classList.remove('open'); });

window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaders['invoices'] = loadInvoicesSection;
