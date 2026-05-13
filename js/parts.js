/* ===========================
   GarageOS — Parts & Stock Control
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatCurrency, esc, debounce } from './utils.js';
import { showConfirm } from './ui.js';

const FieldValue = firebase.firestore.FieldValue;
let allParts     = [];
let allSuppliers = [];

export async function initParts() {
  await Promise.all([loadParts(), loadSuppliers()]);
  setupPartsUI();
}

async function loadParts() {
  try {
    const snap = await garageRef('parts').orderBy('name').get();
    allParts = docsToArr(snap);
    renderPartsStats();
    renderPartsTable(allParts);
  } catch (err) {
    showToast('Failed to load parts', 'error');
  }
}

async function loadSuppliers() {
  try {
    const snap = await garageRef('suppliers').orderBy('name').get();
    allSuppliers = docsToArr(snap);
    renderSuppliersList();
  } catch {}
}

function setupPartsUI() {
  document.getElementById('newPartBtn')?.addEventListener('click', () => openPartModal(null));
  document.getElementById('newSupplierBtn')?.addEventListener('click', () => openSupplierModal(null));
  document.getElementById('reorderListBtn')?.addEventListener('click', showReorderList);

  const search   = document.getElementById('partsSearch');
  const category = document.getElementById('partsCategoryFilter');
  const doFilter = debounce(() => {
    let result = [...allParts];
    const q = search?.value.trim().toLowerCase();
    const c = category?.value;
    if (q) result = result.filter(p => p.name?.toLowerCase().includes(q) || p.partNumber?.toLowerCase().includes(q));
    if (c) result = result.filter(p => p.category === c);
    renderPartsTable(result);
  }, 200);
  search?.addEventListener('input', doFilter);
  category?.addEventListener('change', doFilter);
}

// ——— Stats ———
function renderPartsStats() {
  const low  = allParts.filter(p => p.stockQty <= p.reorderLevel && p.stockQty > 0);
  const out  = allParts.filter(p => p.stockQty <= 0);
  const val  = allParts.reduce((s, p) => s + (p.costPrice || 0) * (p.stockQty || 0), 0);
  setText('partsTotal', allParts.length);
  setText('partsLow',   low.length);
  setText('partsOut',   out.length);
  setText('partsValue', formatCurrency(val));
}

// ——— Table ———
function renderPartsTable(parts) {
  const tbody = document.getElementById('partsTbody');
  if (!tbody) return;
  if (!parts.length) { tbody.innerHTML = '<tr><td colspan="11" class="empty-cell">No parts found. Add parts to your catalogue.</td></tr>'; return; }
  tbody.innerHTML = parts.map(p => {
    const stockStatus = p.stockQty <= 0 ? 'stock-out' : p.stockQty <= (p.reorderLevel||0) ? 'stock-low' : 'stock-ok';
    const stockLabel  = p.stockQty <= 0 ? 'Out' : p.stockQty <= (p.reorderLevel||0) ? 'Low' : 'OK';
    return `<tr>
      <td>${esc(p.name)}</td>
      <td>${esc(p.partNumber||'—')}</td>
      <td>${esc(p.category||'')}</td>
      <td>${esc(p.supplierName||'—')}</td>
      <td>${formatCurrency(p.costPrice||0)}</td>
      <td>${formatCurrency(p.salePrice||0)}</td>
      <td>${p.stockQty || 0}</td>
      <td>${p.reorderLevel || 0}</td>
      <td>${esc(p.shelfLocation||'—')}</td>
      <td><span class="stock-badge ${stockStatus}">${stockLabel}</span></td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="openPartById('${p.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-icon" onclick="adjustPartStock('${p.id}', 1)" title="Add stock"><i class="fas fa-plus"></i></button>
        <button class="btn-icon" onclick="adjustPartStock('${p.id}', -1)" title="Remove stock"><i class="fas fa-minus"></i></button>
        <button class="btn-icon btn-danger-icon" onclick="deletePart('${p.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// ——— Part modal ———
window.openPartById = (id) => openPartModal(id);

async function openPartModal(id) {
  const p = id ? allParts.find(x => x.id === id) : {};
  const name     = prompt('Part name:',           p?.name || '');
  if (name === null) return;
  const partNum  = prompt('Part number:',         p?.partNumber || '');
  const category = prompt('Category (brakes/tyres/filters/oils/electrical/exhaust/suspension/consumables/other):', p?.category || 'other');
  const cost     = parseFloat(prompt('Cost price £:', p?.costPrice || '0') || '0');
  const sale     = parseFloat(prompt('Sale price £:', p?.salePrice || '0') || '0');
  const stock    = parseInt(prompt('Stock qty:', p?.stockQty ?? '0') || '0', 10);
  const reorder  = parseInt(prompt('Reorder level:', p?.reorderLevel ?? '2') || '2', 10);
  const location = prompt('Shelf location (e.g. B3):', p?.shelfLocation || '');

  const data = { name, partNumber: partNum||'', category: category||'other', costPrice: cost, salePrice: sale, stockQty: stock, reorderLevel: reorder, shelfLocation: location||'', updatedAt: FieldValue.serverTimestamp() };

  try {
    if (id) {
      await garageDoc('parts', id).update(data);
      const idx = allParts.findIndex(x => x.id === id);
      if (idx > -1) allParts[idx] = { ...allParts[idx], ...data };
    } else {
      data.createdAt = FieldValue.serverTimestamp();
      const ref = await garageRef('parts').add(data);
      allParts.push({ id: ref.id, ...data });
    }
    showToast('Part saved', 'success');
    renderPartsStats();
    renderPartsTable(allParts);
  } catch (err) {
    showToast('Failed to save part', 'error');
  }
}

window.adjustPartStock = async (id, delta) => {
  const reason = delta > 0 ? 'Restock' : 'Adjustment';
  const p = allParts.find(x => x.id === id);
  if (!p) return;
  const newQty = Math.max(0, (p.stockQty || 0) + delta);
  try {
    await garageDoc('parts', id).update({ stockQty: newQty, updatedAt: FieldValue.serverTimestamp() });
    await garageRef('stock_movements').add({ partId: id, partName: p.name, delta, newQty, reason, createdAt: FieldValue.serverTimestamp() });
    p.stockQty = newQty;
    renderPartsStats();
    renderPartsTable(allParts);
    showToast(`Stock updated: ${p.name} = ${newQty}`, 'success');
  } catch (err) {
    showToast('Failed to update stock', 'error');
  }
};

window.deletePart = async (id) => {
  const ok = await showConfirm({ title: 'Delete Part', message: 'Remove this part from the catalogue?', confirmText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await garageDoc('parts', id).delete();
    allParts = allParts.filter(p => p.id !== id);
    renderPartsStats();
    renderPartsTable(allParts);
    showToast('Part deleted', 'success');
  } catch { showToast('Failed to delete part', 'error'); }
};

// ——— Suppliers ———
function renderSuppliersList() {
  const el = document.getElementById('suppliersList');
  if (!el) return;
  if (!allSuppliers.length) { el.innerHTML = '<p class="text-muted">No suppliers added yet.</p>'; return; }
  el.innerHTML = `<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Account #</th><th>Actions</th></tr></thead><tbody>${
    allSuppliers.map(s => `<tr>
      <td>${esc(s.name)}</td>
      <td>${s.phone ? `<a href="tel:${esc(s.phone)}">${esc(s.phone)}</a>` : '—'}</td>
      <td>${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '—'}</td>
      <td>${esc(s.accountNumber||'—')}</td>
      <td class="actions-cell">
        <button class="btn-icon" onclick="openSupplierById('${s.id}')"><i class="fas fa-pen"></i></button>
        <button class="btn-icon btn-wa" onclick="orderFromSupplier('${s.id}')" title="Order via WhatsApp"><i class="fab fa-whatsapp"></i></button>
      </td>
    </tr>`).join('')
  }</tbody></table></div>`;
}

window.openSupplierById = (id) => openSupplierModal(id);

async function openSupplierModal(id) {
  const s = id ? allSuppliers.find(x => x.id === id) : {};
  const name    = prompt('Supplier name:', s?.name || '');
  if (!name) return;
  const phone   = prompt('Phone:', s?.phone || '');
  const email   = prompt('Email:', s?.email || '');
  const account = prompt('Account number:', s?.accountNumber || '');

  const data = { name, phone: phone||'', email: email||'', accountNumber: account||'', updatedAt: FieldValue.serverTimestamp() };
  try {
    if (id) {
      await garageDoc('suppliers', id).update(data);
      const idx = allSuppliers.findIndex(x => x.id === id);
      if (idx > -1) allSuppliers[idx] = { ...allSuppliers[idx], ...data };
    } else {
      data.createdAt = FieldValue.serverTimestamp();
      const ref = await garageRef('suppliers').add(data);
      allSuppliers.push({ id: ref.id, ...data });
    }
    showToast('Supplier saved', 'success');
    renderSuppliersList();
  } catch { showToast('Failed to save supplier', 'error'); }
}

window.orderFromSupplier = (id) => {
  const s = allSuppliers.find(x => x.id === id);
  if (!s?.phone) { showToast('No phone for this supplier', 'warning'); return; }
  const lowStock = allParts.filter(p => p.supplierId === id || p.supplierName === s.name).filter(p => p.stockQty <= (p.reorderLevel||0));
  const msg = `Hi ${s.name},\n\nPlease supply the following parts:\n${lowStock.map(p => `- ${p.name} (${p.partNumber||'no #'}): Qty ${(p.reorderLevel||2) * 2}`).join('\n') || '(please discuss)'}\n\nThank you.`;
  const phone = s.phone.replace(/\s/g,'').replace(/^0/,'44');
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
};

// ——— Reorder list ———
function showReorderList() {
  const low = allParts.filter(p => p.stockQty <= (p.reorderLevel||0));
  if (!low.length) { showToast('No parts need reordering', 'success'); return; }
  const list = low.map(p => `${p.name}: ${p.stockQty} remaining (reorder at ${p.reorderLevel})`).join('\n');
  alert(`Parts to reorder:\n\n${list}`);
}

// ——— Search for job card autocomplete ———
export function searchPartsCatalogue(query) {
  const q = query.toLowerCase();
  return allParts.filter(p => p.name?.toLowerCase().includes(q) || p.partNumber?.toLowerCase().includes(q)).slice(0, 10);
}

// ——— Deduct on job complete ———
export async function deductPartsFromJob(parts) {
  for (const p of parts) {
    if (!p.partId) continue;
    const existing = allParts.find(x => x.id === p.partId);
    if (!existing) continue;
    const newQty = Math.max(0, (existing.stockQty || 0) - (p.qty || 1));
    await garageDoc('parts', p.partId).update({ stockQty: newQty, updatedAt: FieldValue.serverTimestamp() });
    existing.stockQty = newQty;
  }
}

// ——— Low stock for overview ———
export function getLowStockAlerts() {
  return allParts.filter(p => p.stockQty <= (p.reorderLevel||0));
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

export { allParts, allSuppliers };
