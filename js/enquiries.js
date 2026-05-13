/* ===========================
   GarageOS — Enquiries (Multi-Tenant)
   =========================== */

import { getGarageId, garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, formatDateTime, esc, debounce } from './utils.js';
import { updateBadge, showEmptyState, showConfirm, showModal, closeModal } from './ui.js';

const FieldValue = firebase.firestore.FieldValue;
let _unsubscribe = null;
let allEnquiries = [];

export function initEnquiries() {
  setupEnquiryUI();
  subscribeEnquiries();
}

export function stopEnquiries() {
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
}

// ——— Real-time listener ———
function subscribeEnquiries() {
  if (_unsubscribe) _unsubscribe();
  try {
    _unsubscribe = garageRef('enquiries')
      .orderBy('createdAt', 'desc')
      .limit(200)
      .onSnapshot(snap => {
        allEnquiries = docsToArr(snap);
        const newCount = allEnquiries.filter(e => e.status === 'new').length;
        updateBadge('enquiryBadge', newCount);
        applyEnquiryFilters();
      }, err => console.error('Enquiries listener error:', err));
  } catch (err) {
    console.error(err);
  }
}

// ——— UI setup ———
function setupEnquiryUI() {
  document.getElementById('newEnquiryBtn')?.addEventListener('click', () => openEnquiryModal(null));

  const search = document.getElementById('enquirySearch');
  const status = document.getElementById('enquiryStatusFilter');
  const date   = document.getElementById('enquiryDateFilter');

  const doFilter = debounce(applyEnquiryFilters, 200);
  search?.addEventListener('input', doFilter);
  status?.addEventListener('change', doFilter);
  date?.addEventListener('change', doFilter);
}

function applyEnquiryFilters() {
  let result = [...allEnquiries];
  const q = document.getElementById('enquirySearch')?.value.trim().toLowerCase();
  const s = document.getElementById('enquiryStatusFilter')?.value;
  const d = document.getElementById('enquiryDateFilter')?.value;
  if (q) result = result.filter(e =>
    e.name?.toLowerCase().includes(q) || e.phone?.includes(q) ||
    e.email?.toLowerCase().includes(q) || e.reg?.toLowerCase().includes(q)
  );
  if (s) result = result.filter(e => e.status === s);
  if (d) result = result.filter(e => (e.date || e.preferredDate || '').startsWith(d));
  renderEnquiriesTable(result);
}

// ——— Table ———
function renderEnquiriesTable(enquiries) {
  const tbody = document.getElementById('enquiriesTbody');
  if (!tbody) return;
  if (!enquiries.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No enquiries found.</td></tr>';
    return;
  }
  tbody.innerHTML = enquiries.map(e => {
    const statusMap = { new: 'badge-blue', contacted: 'badge-warning', booked: 'badge-success', not_interested: 'badge-secondary' };
    const date = e.createdAt?.toDate ? formatDateTime(e.createdAt.toDate().toISOString()) : (e.date ? formatDate(e.date) : '—');
    return `<tr${e.status === 'new' ? ' class="row-new"' : ''}>
      <td>${date}</td>
      <td>${esc(e.name)}</td>
      <td><a href="tel:${esc(e.phone)}">${esc(e.phone)}</a></td>
      <td><a href="mailto:${esc(e.email)}">${esc(e.email)}</a></td>
      <td>${e.reg ? `<span class="reg-chip">${esc(e.reg)}</span>` : '—'}</td>
      <td>${esc(e.service || e.serviceType || '—')}</td>
      <td>
        <select class="status-select" onchange="updateEnquiryStatus('${e.id}', this.value)">
          <option value="new" ${e.status==='new'?'selected':''}>New</option>
          <option value="contacted" ${e.status==='contacted'?'selected':''}>Contacted</option>
          <option value="booked" ${e.status==='booked'?'selected':''}>Booked</option>
          <option value="not_interested" ${e.status==='not_interested'?'selected':''}>Not Interested</option>
        </select>
      </td>
      <td class="actions-cell">
        <button class="btn-icon" title="View" onclick="openEnquiryById('${e.id}')"><i class="fas fa-eye"></i></button>
        <button class="btn-icon btn-wa" title="WhatsApp" onclick="waEnquiry('${e.id}')"><i class="fab fa-whatsapp"></i></button>
        <button class="btn-icon" title="Convert to Booking" onclick="convertEnquiryToBooking('${e.id}')"><i class="fas fa-calendar-plus"></i></button>
        <button class="btn-icon btn-danger-icon" title="Delete" onclick="deleteEnquiry('${e.id}')"><i class="fas fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// ——— Status update ———
window.updateEnquiryStatus = async (id, status) => {
  try {
    await garageDoc('enquiries', id).update({ status, updatedAt: FieldValue.serverTimestamp() });
  } catch (err) {
    showToast('Failed to update status', 'error');
  }
};

// ——— Enquiry modal ———
window.openEnquiryById = (id) => openEnquiryModal(id);

async function openEnquiryModal(id) {
  const modal = document.getElementById('enquiryModal');
  if (!modal) {
    // Inline simple view: fallback
    const e = allEnquiries.find(x => x.id === id);
    if (e) alert(`${e.name}\n${e.phone}\n${e.service}\n${e.message || ''}`);
    return;
  }
  if (id) {
    const e = allEnquiries.find(x => x.id === id);
    if (e) populateEnquiryModal(e);
  }
  showModal('enquiryModal');
}

function populateEnquiryModal(e) {
  ['name','phone','email','reg','service','message'].forEach(f => {
    const el = document.getElementById(`enq${f.charAt(0).toUpperCase()}${f.slice(1)}`);
    if (el) el.value = e[f] || '';
  });
  document.getElementById('enqId').value = e.id;
}

// ——— Create manually ———
window.openEnquiryManual = () => openEnquiryModal(null);

// ——— Convert to booking ———
window.convertEnquiryToBooking = (id) => {
  const e = allEnquiries.find(x => x.id === id);
  if (!e) return;
  // Pre-fill booking modal
  document.getElementById('bookingCustomerSearch').value = e.name || '';
  document.getElementById('bookingReg').value    = e.reg || '';
  document.getElementById('bookingService').value = e.service || 'MOT';
  document.getElementById('bookingNotes').value   = e.message || '';
  if (e.preferredDate) document.getElementById('bookingDate').value = e.preferredDate;
  showModal('bookingModal');
  // Mark enquiry as booked
  garageDoc('enquiries', id).update({ status: 'booked', updatedAt: FieldValue.serverTimestamp() });
};

// ——— Delete ———
window.deleteEnquiry = async (id) => {
  const ok = await showConfirm({ title: 'Delete Enquiry', message: 'Delete this enquiry permanently?', confirmText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await garageDoc('enquiries', id).delete();
    showToast('Enquiry deleted', 'success');
  } catch {
    showToast('Failed to delete', 'error');
  }
};

// ——— WhatsApp ———
window.waEnquiry = (id) => {
  const e = allEnquiries.find(x => x.id === id);
  if (!e?.phone) return showToast('No phone number', 'warning');
  const phone = e.phone.replace(/\s/g,'').replace(/^0/,'44');
  const msg   = encodeURIComponent(`Hi ${e.name}, thanks for your enquiry about ${e.service || 'your vehicle'}. When would you like to book?`);
  window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
};

export { allEnquiries };
