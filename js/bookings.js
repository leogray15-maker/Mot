/* ===========================
   Premier MOT — Bookings (Firebase)
   =========================== */

import { db, docsToArr, fsAdd, fsUpdate, fsDel, showSpinner, hideSpinner } from './firebase.js';
window._bookingsData = window._bookingsData || [];

function genBookingRef() {
  const n = String(Date.now()).slice(-6);
  return 'PMB-' + n;
}

function getAvailableSlots(dateStr) {
  const s = getSettings();
  const wh      = s.workingHours || {};
  const blocked = s.blockedDates  || [];
  const maxPerSlot = s.maxBookingsPerSlot || 2;

  if (blocked.includes(dateStr)) return [];
  const d = new Date(dateStr + 'T12:00:00');
  const dayName = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'][d.getDay()];
  const dayConfig = wh[dayName] || {};
  if (!dayConfig.open) return [];

  const start = dayConfig.start || '08:00';
  const end   = dayConfig.end   || '18:00';
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);

  const slots = [];
  let cur = sh * 60 + sm;
  const endMin = eh * 60 + em;
  while (cur < endMin) {
    const hh = String(Math.floor(cur / 60)).padStart(2, '0');
    const mm = String(cur % 60).padStart(2, '0');
    slots.push(hh + ':' + mm);
    cur += 60;
  }

  return slots.map(t => {
    const count = window._bookingsData.filter(b => b.date === dateStr && b.time === t && b.status !== 'Cancelled').length;
    return { time: t, available: count < maxPerSlot };
  });
}

// ===========================
// PUBLIC BOOKING PAGE
// ===========================
if (document.getElementById('publicBookingPage')) {
  let bkStep = 1;
  let bkData = { service: '', date: '', time: '', name: '', phone: '', email: '', reg: '', make: '', model: '', year: '', notes: '' };

  function esc(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') : ''; }

  // Load settings + existing bookings for slot availability
  async function initPublicBooking() {
    const defaultWH = {
      monday:    { open: true,  start: '08:00', end: '18:00' },
      tuesday:   { open: true,  start: '08:00', end: '18:00' },
      wednesday: { open: true,  start: '08:00', end: '18:00' },
      thursday:  { open: true,  start: '08:00', end: '18:00' },
      friday:    { open: true,  start: '08:00', end: '18:00' },
      saturday:  { open: true,  start: '08:00', end: '17:00' },
      sunday:    { open: false, start: '09:00', end: '13:00' }
    };
    try {
      const [settingsSnap, bookingsSnap] = await Promise.all([
        db.collection('settings').doc('config').get(),
        db.collection('bookings').get()
      ]);
      const stored = settingsSnap.exists ? settingsSnap.data() : {};
      // Deep-merge so missing/empty workingHours always falls back to sensible defaults
      window._settings = Object.assign({ blockedDates: [], maxBookingsPerSlot: 2 }, stored);
      window._settings.workingHours = Object.assign({}, defaultWH, stored.workingHours || {});
      window._bookingsData = bookingsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const phoneEl = document.getElementById('confirmPhone');
      if (phoneEl && window._settings.phone) phoneEl.textContent = window._settings.phone;
    } catch (e) {
      window._settings = { workingHours: defaultWH, blockedDates: [], maxBookingsPerSlot: 2 };
      window._bookingsData = [];
    }
  }

  function goStep(n) {
    bkStep = n;
    document.querySelectorAll('.booking-panel').forEach((p, i) => p.classList.toggle('active', i + 1 === n));
    document.querySelectorAll('.booking-step').forEach((s, i) => {
      s.classList.toggle('active', i + 1 === n);
      s.classList.toggle('done', i + 1 < n);
    });
    if (n === 2) renderTimeSlots();
    if (n === 4) renderSummary();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Step 1 — Service
  document.querySelectorAll('.service-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.service-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      bkData.service = opt.dataset.service;
      document.getElementById('nextStep1').disabled = false;
    });
  });
  document.getElementById('nextStep1')?.addEventListener('click', () => { if (bkData.service) goStep(2); });

  // Step 2 — Date/Time
  const dateInput = document.getElementById('bookingDate');
  if (dateInput) {
    dateInput.min = new Date().toISOString().split('T')[0];
    dateInput.addEventListener('change', () => { bkData.date = dateInput.value; bkData.time = ''; renderTimeSlots(); });
  }

  function renderTimeSlots() {
    const wrap = document.getElementById('timeSlotsWrap');
    if (!wrap) return;
    if (!bkData.date) { wrap.innerHTML = '<p class="no-slots">Please select a date first.</p>'; return; }
    const slots = getAvailableSlots(bkData.date);
    if (slots.length === 0) {
      wrap.innerHTML = '<p class="no-slots">No availability on this date. Please choose another day.</p>';
      return;
    }
    wrap.innerHTML = slots.map(s =>
      `<div class="time-slot${!s.available ? ' full' : ''}${bkData.time === s.time ? ' selected' : ''}" data-time="${s.time}" ${!s.available ? 'title="Fully booked"' : ''}>${s.time}${!s.available ? ' (Full)' : ''}</div>`
    ).join('');
    wrap.querySelectorAll('.time-slot:not(.full)').forEach(el => {
      el.addEventListener('click', () => {
        wrap.querySelectorAll('.time-slot').forEach(t => t.classList.remove('selected'));
        el.classList.add('selected');
        bkData.time = el.dataset.time;
      });
    });
  }

  document.getElementById('nextStep2')?.addEventListener('click', () => {
    if (!bkData.date || !bkData.time) { alert('Please select a date and time slot.'); return; }
    goStep(3);
  });
  document.getElementById('prevStep2')?.addEventListener('click', () => goStep(1));

  // Step 3 — Details
  document.getElementById('bookingDetailsForm')?.addEventListener('submit', e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    bkData.name  = fd.get('name'); bkData.phone = fd.get('phone');
    bkData.email = fd.get('email'); bkData.reg  = (fd.get('reg') || '').toUpperCase();
    bkData.make  = fd.get('make'); bkData.model = fd.get('model');
    bkData.year  = fd.get('year'); bkData.notes = fd.get('notes');
    goStep(4);
  });
  document.getElementById('prevStep3')?.addEventListener('click', () => goStep(2));

  // Step 4 — Confirm
  function renderSummary() {
    const rows = [
      ['Service', bkData.service], ['Date', bkData.date], ['Time', bkData.time],
      ['Name', bkData.name], ['Phone', bkData.phone],
      ['Vehicle Reg', bkData.reg || '—'], ['Make / Model', (bkData.make + ' ' + bkData.model).trim() || '—'],
      ['Notes', bkData.notes || 'None']
    ];
    const container = document.getElementById('bookingSummaryRows');
    if (container) container.innerHTML = rows.map(([l, v]) => `<div class="summary-row"><span class="label">${l}</span><span class="value">${esc(v)}</span></div>`).join('');
  }

  document.getElementById('prevStep4')?.addEventListener('click', () => goStep(3));

  document.getElementById('confirmBookingBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('confirmBookingBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Confirming…'; }

    const ref = genBookingRef();
    const booking = { ref, ...bkData, status: 'Confirmed', createdAt: new Date().toISOString() };
    try {
      await db.collection('bookings').add(booking);
      const s = window._settings || {};
      const refEl = document.getElementById('bookingRefDisplay');
      if (refEl) refEl.textContent = ref;
      const phoneEl = document.getElementById('confirmPhone');
      if (phoneEl) phoneEl.textContent = s.phone || '01234 567890';

      // WA confirmation to customer
      const custNum = bkData.phone.replace(/[\s\-\(\)]/g,'').replace(/^0/,'44');
      setTimeout(() => window.open(
        `https://wa.me/${custNum}?text=${encodeURIComponent('Thanks for booking with us! Your ' + bkData.service + ' booking (Ref: ' + ref + ') is confirmed for ' + bkData.date + ' at ' + bkData.time + '. We\'ll call you within 1 hour. — ' + (s.garageName || 'Premier MOT'))}`,
        '_blank', 'noopener'
      ), 600);

      goStep(5);
    } catch (e) {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-calendar-check"></i> Confirm Booking'; }
      alert('Failed to save booking. Please try again or call us directly.');
    }
  });

  // Init — load settings, then apply URL param pre-selection
  initPublicBooking().then(() => {
    goStep(1);
    const preService = new URLSearchParams(window.location.search).get('service');
    if (preService) {
      const opt = document.querySelector(`.service-option[data-service="${preService}"]`);
      if (opt) { opt.click(); opt.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  });
}

// ===========================
// DASHBOARD BOOKINGS SECTION
// ===========================
let dashBookingView   = 'list';
let dashBookingSearch = '';
let dashBookingFilter = 'all';
let _bookingsUnsub    = null;

function loadBookingsSection() {
  updateBookingsBadge();
  if (_bookingsUnsub) {
    // Listener already running — just re-render
    if (dashBookingView === 'calendar') renderBookingCalendar();
    else renderBookingsList();
    return;
  }
  showSpinner('page-bookings');
  _bookingsUnsub = db.collection('bookings')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      window._bookingsData = docsToArr(snap);
      hideSpinner('page-bookings');
      updateBookingsBadge();
      if (dashBookingView === 'calendar') renderBookingCalendar();
      else renderBookingsList();
    }, err => {
      hideSpinner('page-bookings');
      showToast('Failed to load bookings', 'error');
    });
}

function updateBookingsBadge() {
  const badge = document.getElementById('bookingsBadge');
  if (!badge) return;
  const count = window._bookingsData.filter(b => b.status === 'Confirmed').length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function renderBookingsList() {
  const q = dashBookingSearch.toLowerCase();
  const filtered = window._bookingsData.filter(b => {
    const matchStatus = dashBookingFilter === 'all' || b.status === dashBookingFilter;
    const matchSearch = !q || (b.name||'').toLowerCase().includes(q) || (b.phone||'').includes(q) || (b.reg||'').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  }).sort((a, b) => (a.date + ' ' + a.time).localeCompare(b.date + ' ' + b.time));

  const tbody = document.getElementById('bookingsBody');
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i class="fas fa-calendar-days"></i>No bookings found. Customers book via the <a href="booking.html" style="color:var(--red-light)">online booking page</a>.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td class="td-muted">${b.date}</td>
      <td style="font-weight:600;color:var(--white)">${b.time}</td>
      <td class="td-name">${esc(b.name)}</td>
      <td>${esc(b.phone)}</td>
      <td>${esc(b.service)}</td>
      <td class="td-mono">${esc(b.reg||'—')}</td>
      <td>
        <select class="status-select" onchange="updateBookingStatus('${b.id}',this.value)">
          ${['Confirmed','Completed','Cancelled','No Show'].map(s => `<option value="${s}"${b.status === s ? ' selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="viewBookingModal('${b.id}')" title="View"><i class="fas fa-eye"></i></button>
          <button class="action-btn success" onclick="convertBookingToCustomer('${b.id}')" title="Save as customer"><i class="fas fa-user-plus"></i></button>
          <button class="action-btn danger" onclick="deleteBooking('${b.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function renderBookingCalendar() {
  const container = document.getElementById('bookingCalendarWrap');
  if (!container) return;
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay() + 1);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  container.innerHTML = `
    <div class="calendar-week">
      ${days.map(d => {
        const ds = d.toISOString().split('T')[0];
        const dayBookings = window._bookingsData.filter(b => b.date === ds && b.status !== 'Cancelled');
        const isToday = ds === today.toISOString().split('T')[0];
        return `
          <div class="cal-day${isToday ? ' today' : ''}">
            <div class="cal-day-header">
              <div class="cal-day-name">${d.toLocaleDateString('en-GB',{weekday:'short'})}</div>
              <div>${d.getDate()}</div>
            </div>
            ${dayBookings.length === 0 ? '<div style="font-size:0.72rem;color:var(--text-dim);text-align:center;padding:8px 0">Free</div>' :
              dayBookings.sort((a,b)=>a.time.localeCompare(b.time)).map(b=>`
                <div class="cal-booking${b.status==='Completed'?' confirmed':''}" onclick="viewBookingModal('${b.id}')">
                  <div style="font-weight:700">${b.time}</div>
                  <div>${esc(b.name.split(' ')[0])}</div>
                  <div style="font-size:0.65rem;opacity:0.8">${esc(b.service)}</div>
                </div>`).join('')
            }
          </div>`;
      }).join('')}
    </div>`;
}

async function updateBookingStatus(id, status) {
  try {
    await fsUpdate('bookings', id, { status });
    const idx = window._bookingsData.findIndex(b => b.id === id);
    if (idx !== -1) window._bookingsData[idx].status = status;
    updateBookingsBadge();
    showToast('Booking status updated', 'success');
  } catch (err) {
    showToast('Failed to update booking', 'error');
  }
}

async function deleteBooking(id) {
  if (!confirm('Delete this booking?')) return;
  try {
    await fsDel('bookings', id);
    showToast('Booking deleted', 'info');
  } catch (err) {
    showToast('Failed to delete booking', 'error');
  }
}

function viewBookingModal(id) {
  const b = window._bookingsData.find(x => x.id === id);
  if (!b) return;
  const overlay = document.getElementById('bookingDetailModal');
  const content = document.getElementById('bookingDetailContent');
  if (!overlay || !content) return;
  content.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>Booking Ref</label><p class="mono" style="font-family:monospace;font-weight:700;color:var(--red-light)">${esc(b.ref)}</p></div>
      <div class="detail-item"><label>Status</label><p><span class="badge ${bookingStatusBadge(b.status)}">${esc(b.status)}</span></p></div>
      <div class="detail-item"><label>Date & Time</label><p>${esc(b.date)} at ${esc(b.time)}</p></div>
      <div class="detail-item"><label>Service</label><p>${esc(b.service)}</p></div>
      <div class="detail-item"><label>Customer Name</label><p>${esc(b.name)}</p></div>
      <div class="detail-item"><label>Phone</label><p>${esc(b.phone)}</p></div>
      <div class="detail-item"><label>Email</label><p>${esc(b.email||'—')}</p></div>
      <div class="detail-item"><label>Vehicle Reg</label><p class="mono">${esc(b.reg||'—')}</p></div>
      <div class="detail-item"><label>Make / Model</label><p>${esc((b.make||'') + ' ' + (b.model||'')).trim()||'—'}</p></div>
      <div class="detail-item"><label>Year</label><p>${esc(b.year||'—')}</p></div>
    </div>
    ${b.notes ? `<div class="detail-item" style="margin-top:12px"><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);margin-bottom:6px">Notes</label><p style="font-size:0.9rem;color:var(--text-muted)">${esc(b.notes)}</p></div>` : ''}
    <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-sm btn-success-sm" onclick="convertBookingToCustomer('${b.id}');document.getElementById('bookingDetailModal').classList.remove('open')"><i class="fas fa-user-plus"></i> Save as Customer</button>
      <button class="btn-sm btn-ghost-sm" onclick="sendBookingReminderWA('${b.id}')"><i class="fab fa-whatsapp"></i> WhatsApp Customer</button>
    </div>`;
  overlay.classList.add('open');
}

function bookingStatusBadge(s) {
  return { 'Confirmed':'badge-new','Completed':'badge-completed','Cancelled':'badge-cancelled','No Show':'badge-contacted' }[s] || 'badge-new';
}

async function convertBookingToCustomer(id) {
  const b = window._bookingsData.find(x => x.id === id);
  if (!b) return;

  // Check if customer already exists
  const exists = window._customersData.some(c => c.phone === b.phone || (b.email && c.email === b.email));
  if (exists) { showToast('Customer already exists in system', 'info'); return; }

  const customer = {
    name: b.name, phone: b.phone, email: b.email || '', reg: b.reg || '',
    make: b.make || '', model: b.model || '', year: b.year || '',
    motDue: '', notes: `Converted from booking ${b.ref}`,
    jobs: [], reminderLog: [], createdAt: new Date().toISOString()
  };
  try {
    const newId = await fsAdd('customers', customer);
    window._customersData.unshift({ id: newId, ...customer });
    if (typeof addNotification === 'function') addNotification('info', `${b.name} added as customer from booking`, 'customers');
    showToast(`${b.name} added to customers`, 'success');
  } catch (err) {
    showToast('Failed to save customer', 'error');
  }
}

function sendBookingReminderWA(id) {
  const b = window._bookingsData.find(x => x.id === id);
  if (!b || !b.phone) return;
  const s = getSettings();
  const msg = `Hi ${b.name.split(' ')[0]}, just confirming your ${b.service} booking at ${s.garageName||'Premier MOT'} on ${b.date} at ${b.time}. See you then! Any questions, call ${s.phone||'01234 567890'}.`;
  const num = b.phone.replace(/[\s\-\(\)]/g,'').replace(/^0/,'44');
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  showToast('WhatsApp opened', 'success');
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// View toggle
document.getElementById('bookingsViewList')?.addEventListener('click', () => {
  dashBookingView = 'list';
  document.getElementById('bookingCalendarWrap').style.display = 'none';
  document.querySelector('.bookings-table-wrap').style.display = '';
  document.getElementById('bookingsViewList').classList.add('active');
  document.getElementById('bookingsViewCal').classList.remove('active');
  renderBookingsList();
});
document.getElementById('bookingsViewCal')?.addEventListener('click', () => {
  dashBookingView = 'calendar';
  document.getElementById('bookingCalendarWrap').style.display = '';
  document.querySelector('.bookings-table-wrap').style.display = 'none';
  document.getElementById('bookingsViewCal').classList.add('active');
  document.getElementById('bookingsViewList').classList.remove('active');
  renderBookingCalendar();
});
document.getElementById('bookingsSearch')?.addEventListener('input', e => { dashBookingSearch = e.target.value; renderBookingsList(); });
document.getElementById('bookingsFilter')?.addEventListener('change', e => { dashBookingFilter = e.target.value; renderBookingsList(); });

document.getElementById('closeBookingModal')?.addEventListener('click', () => document.getElementById('bookingDetailModal')?.classList.remove('open'));
document.getElementById('bookingDetailModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) e.currentTarget.classList.remove('open'); });

window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaders['bookings'] = loadBookingsSection;

Object.assign(window, {
  viewBookingModal, updateBookingStatus, deleteBooking,
  convertBookingToCustomer, sendBookingReminderWA, renderBookingCalendar
});
