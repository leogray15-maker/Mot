/* ===========================
   MOT Car Repairs — Bookings (Firebase)
   =========================== */

import { db, garageRef, docsToArr, fsAdd, fsUpdate, fsDel, showSpinner, hideSpinner } from './firebase.js';
import { showToast, getSettings } from './utils.js';
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
        db.collection('garages/mot-car-repairs-poole/settings').doc('config').get(),
        db.collection('garages/mot-car-repairs-poole/bookings').get()
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
      await db.collection('garages/mot-car-repairs-poole/bookings').add(booking);
      const s = window._settings || {};
      const refEl = document.getElementById('bookingRefDisplay');
      if (refEl) refEl.textContent = ref;
      const phoneEl = document.getElementById('confirmPhone');
      if (phoneEl) phoneEl.textContent = s.phone || '07749 207399';

      // WA confirmation to customer
      const custNum = bkData.phone.replace(/[\s\-\(\)]/g,'').replace(/^0/,'44');
      setTimeout(() => window.open(
        `https://wa.me/${custNum}?text=${encodeURIComponent('Thanks for booking with us! Your ' + bkData.service + ' booking (Ref: ' + ref + ') is confirmed for ' + bkData.date + ' at ' + bkData.time + '. We\'ll call you within 1 hour. — ' + (s.garageName || 'MOT Car Repairs'))}`,
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
let dashBookingView   = 'month';
let dashBookingSearch = '';
let dashBookingFilter = '';
let calCurrentDate    = new Date();
let _bookingsUnsub    = null;

function renderCurrentView() {
  if (dashBookingView === 'list') {
    renderBookingsList();
  } else {
    renderBookingCalendar();
  }
}

function loadBookingsSection() {
  updateBookingsBadge();
  setupBookingsViewToggles();

  if (_bookingsUnsub) {
    renderCurrentView();
    return;
  }
  showSpinner('page-bookings');

  if (window._bookingsData.length > 0) {
    hideSpinner('page-bookings');
    renderCurrentView();
  }

  _bookingsUnsub = garageRef('bookings')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      window._bookingsData = docsToArr(snap);
      hideSpinner('page-bookings');
      updateBookingsBadge();
      if (window._currentSection === 'overview' && typeof window.loadOverview === 'function') {
        window.loadOverview();
      }
      if (window._currentSection === 'bookings') renderCurrentView();
    }, async () => {
      _bookingsUnsub = null;
      hideSpinner('page-bookings');
      try {
        const snap = await garageRef('bookings').orderBy('createdAt', 'desc').get();
        window._bookingsData = docsToArr(snap);
        updateBookingsBadge();
        renderCurrentView();
      } catch {
        showToast('Could not load bookings — check your connection', 'error');
        renderBookingsList();
      }
    });
}

function updateBookingsBadge() {
  const badge = document.getElementById('bookingsBadge');
  if (!badge) return;
  const count = window._bookingsData.filter(b => b.status === 'Confirmed' || b.status === 'confirmed').length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'flex' : 'none';
}

function setupBookingsViewToggles() {
  const calendarEl = document.getElementById('bookingsCalendar');
  const listEl     = document.getElementById('bookingsList');
  const calNav     = document.getElementById('calendarNav');

  document.querySelectorAll('#page-bookings .view-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#page-bookings .view-toggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      dashBookingView = btn.dataset.view;

      if (dashBookingView === 'list') {
        if (calendarEl) calendarEl.style.display = 'none';
        if (listEl) listEl.style.display = '';
        if (calNav) calNav.style.display = 'none';
        renderBookingsList();
      } else {
        if (calendarEl) calendarEl.style.display = '';
        if (listEl) listEl.style.display = 'none';
        if (calNav) calNav.style.display = '';
        renderBookingCalendar();
      }
    });
  });

  document.getElementById('calPrev')?.addEventListener('click', () => {
    navigateCal(-1);
  });
  document.getElementById('calNext')?.addEventListener('click', () => {
    navigateCal(1);
  });
  document.getElementById('calToday')?.addEventListener('click', () => {
    calCurrentDate = new Date();
    renderBookingCalendar();
  });

  document.getElementById('bookingSearch')?.addEventListener('input', e => {
    dashBookingSearch = e.target.value;
    renderCurrentView();
  });
  document.getElementById('bookingStatusFilter')?.addEventListener('change', e => {
    dashBookingFilter = e.target.value;
    renderCurrentView();
  });

  document.getElementById('closeBookingModal')?.addEventListener('click', () => {
    document.getElementById('bookingDetailModal')?.classList.remove('open');
  });
  document.getElementById('bookingDetailModal')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  document.getElementById('newBookingBtn')?.addEventListener('click', () => {
    showToast('Customers book online via the booking page', 'info');
  });

  document.getElementById('printDaySheetBtn')?.addEventListener('click', () => {
    printDaySheet();
  });
}

function navigateCal(dir) {
  if (dashBookingView === 'month') {
    calCurrentDate.setMonth(calCurrentDate.getMonth() + dir);
  } else if (dashBookingView === 'week') {
    calCurrentDate.setDate(calCurrentDate.getDate() + dir * 7);
  } else if (dashBookingView === 'day') {
    calCurrentDate.setDate(calCurrentDate.getDate() + dir);
  }
  calCurrentDate = new Date(calCurrentDate);
  renderBookingCalendar();
}

function setCalTitle(text) {
  const el = document.getElementById('calTitle');
  if (el) el.textContent = text;
}

function renderBookingCalendar() {
  const container = document.getElementById('bookingsCalendar');
  if (!container) return;

  const todayStr = new Date().toISOString().split('T')[0];

  if (dashBookingView === 'week') {
    renderWeekCalendar(container, todayStr);
  } else if (dashBookingView === 'day') {
    renderDayCalendar(container, todayStr);
  } else {
    renderMonthCalendar(container, todayStr);
  }
}

function renderMonthCalendar(container, todayStr) {
  const year  = calCurrentDate.getFullYear();
  const month = calCurrentDate.getMonth();
  setCalTitle(calCurrentDate.toLocaleString('en-GB', { month: 'long', year: 'numeric' }));

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  // Week starts Monday: 0=Mon … 6=Sun
  let startPad = firstDay.getDay() - 1;
  if (startPad < 0) startPad = 6;

  const days = [];
  for (let i = 0; i < startPad; i++) {
    const d = new Date(firstDay);
    d.setDate(d.getDate() - (startPad - i));
    days.push({ date: d, inMonth: false });
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push({ date: new Date(year, month, d), inMonth: true });
  }
  while (days.length % 7 !== 0) {
    const prev = days[days.length - 1].date;
    const d = new Date(prev);
    d.setDate(prev.getDate() + 1);
    days.push({ date: d, inMonth: false });
  }

  const q = dashBookingSearch.toLowerCase();
  const rows = [];
  for (let i = 0; i < days.length; i += 7) {
    const week = days.slice(i, i + 7);
    rows.push(`<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:2px">
      ${week.map(({ date, inMonth }) => {
        const ds = date.toISOString().split('T')[0];
        const isToday = ds === todayStr;
        const dayBookings = window._bookingsData.filter(b => {
          if (b.date !== ds || b.status === 'Cancelled' || b.status === 'cancelled') return false;
          if (dashBookingFilter && b.status !== dashBookingFilter) return false;
          if (q && !(b.name||'').toLowerCase().includes(q) && !(b.reg||'').toLowerCase().includes(q)) return false;
          return true;
        }).sort((a, b) => (a.time||'').localeCompare(b.time||''));
        return `<div style="min-height:90px;background:${inMonth ? 'var(--dark-2)' : 'var(--dark-1)'};border:1px solid var(--border);border-radius:6px;padding:4px;${isToday ? 'border-color:var(--red-light)!important;' : ''}">
          <div style="font-size:0.72rem;font-weight:${isToday ? '700' : '500'};color:${isToday ? 'var(--red-light)' : inMonth ? 'var(--text-muted)' : 'var(--text-dim)'};margin-bottom:4px">${date.getDate()}</div>
          ${dayBookings.map(b => `<div onclick="viewBookingModal('${b.id}')" style="cursor:pointer;font-size:0.65rem;padding:2px 4px;border-radius:3px;margin-bottom:2px;background:${statusColor(b.status)};color:#fff;overflow:hidden;white-space:nowrap;text-overflow:ellipsis" title="${esc(b.name)} — ${esc(b.service)}">
            ${esc(b.time||'')} ${esc((b.name||'').split(' ')[0])}
          </div>`).join('')}
        </div>`;
      }).join('')}
    </div>`);
  }

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:4px">
      ${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => `<div style="text-align:center;font-size:0.72rem;font-weight:700;color:var(--text-dim);padding:4px 0">${d}</div>`).join('')}
    </div>
    ${rows.join('')}`;
}

function renderWeekCalendar(container, todayStr) {
  const d = new Date(calCurrentDate);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);

  const weekStart = new Date(d);
  const weekEnd   = new Date(d);
  weekEnd.setDate(weekEnd.getDate() + 6);

  setCalTitle(
    weekStart.toLocaleDateString('en-GB', { day:'numeric', month:'short' }) +
    ' – ' +
    weekEnd.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' })
  );

  const days = Array.from({ length: 7 }, (_, i) => {
    const nd = new Date(weekStart);
    nd.setDate(weekStart.getDate() + i);
    return nd;
  });

  const q = dashBookingSearch.toLowerCase();
  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">
      ${days.map(day => {
        const ds = day.toISOString().split('T')[0];
        const isToday = ds === todayStr;
        const dayBookings = window._bookingsData.filter(b => {
          if (b.date !== ds || b.status === 'Cancelled' || b.status === 'cancelled') return false;
          if (dashBookingFilter && b.status !== dashBookingFilter) return false;
          if (q && !(b.name||'').toLowerCase().includes(q) && !(b.reg||'').toLowerCase().includes(q)) return false;
          return true;
        }).sort((a, b) => (a.time||'').localeCompare(b.time||''));

        return `<div style="background:var(--dark-2);border:1px solid ${isToday ? 'var(--red-light)' : 'var(--border)'};border-radius:8px;overflow:hidden">
          <div style="padding:8px;text-align:center;border-bottom:1px solid var(--border);background:${isToday ? 'rgba(224,32,32,0.12)' : 'transparent'}">
            <div style="font-size:0.7rem;font-weight:700;color:var(--text-dim);text-transform:uppercase">${day.toLocaleDateString('en-GB',{weekday:'short'})}</div>
            <div style="font-size:1.1rem;font-weight:700;color:${isToday ? 'var(--red-light)' : 'var(--white)'}">${day.getDate()}</div>
          </div>
          <div style="padding:6px;min-height:120px">
            ${dayBookings.length === 0
              ? '<div style="font-size:0.7rem;color:var(--text-dim);text-align:center;padding:12px 0">Free</div>'
              : dayBookings.map(b => `
                <div onclick="viewBookingModal('${b.id}')" style="cursor:pointer;margin-bottom:6px;padding:6px;border-radius:5px;background:${statusColor(b.status)};color:#fff">
                  <div style="font-size:0.75rem;font-weight:700">${esc(b.time||'')}</div>
                  <div style="font-size:0.7rem">${esc((b.name||'').split(' ')[0])}</div>
                  <div style="font-size:0.65rem;opacity:0.8">${esc(b.service||'')}</div>
                </div>`).join('')
            }
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

function renderDayCalendar(container, todayStr) {
  const ds = calCurrentDate.toISOString().split('T')[0];
  setCalTitle(calCurrentDate.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' }));

  const q = dashBookingSearch.toLowerCase();
  const dayBookings = window._bookingsData.filter(b => {
    if (b.date !== ds) return false;
    if (dashBookingFilter && b.status !== dashBookingFilter) return false;
    if (q && !(b.name||'').toLowerCase().includes(q) && !(b.reg||'').toLowerCase().includes(q)) return false;
    return true;
  }).sort((a, b) => (a.time||'').localeCompare(b.time||''));

  if (dayBookings.length === 0) {
    container.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-dim)"><i class="fas fa-calendar-day" style="font-size:2rem;margin-bottom:12px;display:block"></i>No bookings for this day.</div>`;
    return;
  }

  container.innerHTML = `<div style="display:flex;flex-direction:column;gap:10px">
    ${dayBookings.map(b => `
      <div onclick="viewBookingModal('${b.id}')" style="cursor:pointer;display:grid;grid-template-columns:80px 1fr auto;gap:16px;align-items:center;background:var(--dark-2);border:1px solid var(--border);border-left:4px solid ${statusColor(b.status)};border-radius:8px;padding:14px 16px">
        <div style="font-size:1.1rem;font-weight:700;color:var(--white)">${esc(b.time||'—')}</div>
        <div>
          <div style="font-weight:600;color:var(--white)">${esc(b.name||'—')}</div>
          <div style="font-size:0.82rem;color:var(--text-muted)">${esc(b.service||'')}${b.reg ? ' · ' + esc(b.reg) : ''}</div>
          ${b.phone ? `<div style="font-size:0.78rem;color:var(--text-dim)">${esc(b.phone)}</div>` : ''}
        </div>
        <span class="badge ${bookingStatusBadge(b.status)}">${esc(b.status||'')}</span>
      </div>`).join('')}
  </div>`;
}

function statusColor(status) {
  const map = {
    'Confirmed': 'var(--red-light)', 'confirmed': 'var(--red-light)',
    'Completed': '#22c55e', 'completed': '#22c55e', 'complete': '#22c55e',
    'Cancelled': '#6b7280', 'cancelled': '#6b7280',
    'No Show': '#f59e0b', 'no_show': '#f59e0b',
    'In Progress': '#3b82f6', 'in_progress': '#3b82f6',
    'Pending': '#a78bfa', 'pending': '#a78bfa'
  };
  return map[status] || '#6b7280';
}

function renderBookingsList() {
  const q = dashBookingSearch.toLowerCase();
  const filtered = window._bookingsData.filter(b => {
    const matchStatus = !dashBookingFilter || b.status === dashBookingFilter;
    const matchSearch = !q || (b.name||'').toLowerCase().includes(q) || (b.phone||'').includes(q) || (b.reg||'').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  }).sort((a, b) => (a.date + ' ' + (a.time||'')).localeCompare(b.date + ' ' + (b.time||'')));

  const tbody = document.getElementById('bookingsTbody');
  if (!tbody) return;
  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i class="fas fa-calendar-days"></i>No bookings found.</td></tr>`;
    return;
  }
  tbody.innerHTML = filtered.map(b => `
    <tr>
      <td class="td-muted">${esc(b.date||'—')}</td>
      <td style="font-weight:600;color:var(--white)">${esc(b.time||'—')}</td>
      <td class="td-name">${esc(b.name||'—')}</td>
      <td class="td-mono">${esc(b.reg||'—')}</td>
      <td>${esc(b.service||'—')}</td>
      <td class="td-muted">${esc(b.bay||'—')}</td>
      <td><span class="badge ${bookingStatusBadge(b.status)}">${esc(b.status||'')}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="viewBookingModal('${b.id}')" title="View"><i class="fas fa-eye"></i></button>
          <button class="action-btn success" onclick="convertBookingToCustomer('${b.id}')" title="Save as customer"><i class="fas fa-user-plus"></i></button>
          <button class="action-btn danger" onclick="deleteBooking('${b.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
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
      <div class="detail-item"><label>Booking Ref</label><p style="font-family:monospace;font-weight:700;color:var(--red-light)">${esc(b.ref||'—')}</p></div>
      <div class="detail-item"><label>Status</label><p><span class="badge ${bookingStatusBadge(b.status)}">${esc(b.status||'')}</span></p></div>
      <div class="detail-item"><label>Date &amp; Time</label><p>${esc(b.date||'—')} at ${esc(b.time||'—')}</p></div>
      <div class="detail-item"><label>Service</label><p>${esc(b.service||'—')}</p></div>
      <div class="detail-item"><label>Customer Name</label><p>${esc(b.name||'—')}</p></div>
      <div class="detail-item"><label>Phone</label><p>${esc(b.phone||'—')}</p></div>
      <div class="detail-item"><label>Email</label><p>${esc(b.email||'—')}</p></div>
      <div class="detail-item"><label>Vehicle Reg</label><p style="font-family:monospace">${esc(b.reg||'—')}</p></div>
      <div class="detail-item"><label>Make / Model</label><p>${esc(((b.make||'') + ' ' + (b.model||'')).trim()||'—')}</p></div>
      <div class="detail-item"><label>Year</label><p>${esc(b.year||'—')}</p></div>
    </div>
    ${b.notes ? `<div style="margin-top:12px"><label style="display:block;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-dim);margin-bottom:6px">Notes</label><p style="font-size:0.9rem;color:var(--text-muted)">${esc(b.notes)}</p></div>` : ''}
    <div style="margin-top:20px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn-sm btn-success-sm" onclick="convertBookingToCustomer('${b.id}');document.getElementById('bookingDetailModal').classList.remove('open')"><i class="fas fa-user-plus"></i> Save as Customer</button>
      <button class="btn-sm btn-ghost-sm" onclick="sendBookingReminderWA('${b.id}')"><i class="fab fa-whatsapp"></i> WhatsApp Customer</button>
      <select class="status-select" style="font-size:0.82rem" onchange="updateBookingStatus('${b.id}',this.value);this.closest('.modal-overlay').classList.remove('open')">
        <option value="">Change status…</option>
        ${['Confirmed','In Progress','Completed','Cancelled','No Show'].map(s => `<option value="${s}"${b.status===s?' selected':''}>${s}</option>`).join('')}
      </select>
    </div>`;
  overlay.classList.add('open');
}

function bookingStatusBadge(s) {
  const map = {
    'Confirmed':'badge-new', 'confirmed':'badge-new',
    'Completed':'badge-completed', 'completed':'badge-completed', 'complete':'badge-completed',
    'Cancelled':'badge-cancelled', 'cancelled':'badge-cancelled',
    'No Show':'badge-contacted', 'no_show':'badge-contacted',
    'In Progress':'badge-inprogress', 'in_progress':'badge-inprogress',
    'Pending':'badge-pending', 'pending':'badge-pending'
  };
  return map[s] || 'badge-new';
}

async function convertBookingToCustomer(id) {
  const b = window._bookingsData.find(x => x.id === id);
  if (!b) return;

  const exists = (window._customersData || []).some(c => c.phone === b.phone || (b.email && c.email === b.email));
  if (exists) { showToast('Customer already exists in system', 'info'); return; }

  const customer = {
    name: b.name, phone: b.phone, email: b.email || '', reg: b.reg || '',
    make: b.make || '', model: b.model || '', year: b.year || '',
    motDue: '', notes: `Converted from booking ${b.ref||''}`,
    jobs: [], reminderLog: [], createdAt: new Date().toISOString()
  };
  try {
    const newId = await fsAdd('customers', customer);
    if (window._customersData) window._customersData.unshift({ id: newId, ...customer });
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
  const msg = `Hi ${(b.name||'there').split(' ')[0]}, just confirming your ${b.service||'appointment'} booking at ${s.garageName||'MOT Car Repairs'} on ${b.date} at ${b.time}. See you then! Any questions, call ${s.phone||'07749 207399'}.`;
  const num = b.phone.replace(/[\s\-\(\)]/g,'').replace(/^0/,'44');
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
  showToast('WhatsApp opened', 'success');
}

function printDaySheet() {
  const ds = new Date().toISOString().split('T')[0];
  const todays = window._bookingsData
    .filter(b => b.date === ds && b.status !== 'Cancelled')
    .sort((a, b) => (a.time||'').localeCompare(b.time||''));
  const w = window.open('', '_blank');
  w.document.write(`<html><head><title>Day Sheet ${ds}</title><style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:8px 12px;text-align:left}th{background:#f0f0f0}h2{margin:0 0 16px}</style></head><body>
    <h2>Day Sheet — ${ds}</h2>
    <table><thead><tr><th>Time</th><th>Customer</th><th>Reg</th><th>Service</th><th>Phone</th><th>Status</th></tr></thead>
    <tbody>${todays.map(b=>`<tr><td>${b.time||'—'}</td><td>${b.name||'—'}</td><td>${b.reg||'—'}</td><td>${b.service||'—'}</td><td>${b.phone||'—'}</td><td>${b.status||'—'}</td></tr>`).join('')}</tbody>
    </table></body></html>`);
  w.print();
}

function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.sectionLoaders = window.sectionLoaders || {};
window.sectionLoaders['bookings'] = loadBookingsSection;

Object.assign(window, {
  viewBookingModal, updateBookingStatus, deleteBooking,
  convertBookingToCustomer, sendBookingReminderWA, renderBookingCalendar
});
