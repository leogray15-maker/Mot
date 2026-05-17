/* ===========================
   MOT Car Repairs — Dashboard
   =========================== */

import firebase, { getGarageId, auth, db, garageRef, garageDoc, accountRef, docsToArr, fsAdd, fsUpdate } from './firebase.js';
import { showToast, formatDate, formatDateTime, formatCurrency, getSettings, getDefaultSettings, esc, debounce } from './utils.js';
import { openSection, updateBadge, showSkeleton, hideSkeleton, showEmptyState, showConfirm, showModal, closeModal } from './ui.js';
import { requireAuth } from './auth.js';

// ——— Plan feature map ———

const PLAN_FEATURES = {
  starter:    ['overview', 'enquiries', 'customers', 'bookings', 'settings'],
  pro:        ['overview', 'enquiries', 'customers', 'bookings', 'jobs', 'vhc', 'clock',
               'approvals', 'opportunities', 'fleet', 'invoices', 'revenue', 'reports',
               'zread', 'mot', 'parts', 'reminders', 'settings', 'team', 'users', 'whatsapp', 'ai'],
  enterprise: ['all']
};

/**
 * Returns true if the current garage plan includes the given feature/section.
 * @param {string} feature
 * @returns {boolean}
 */
export function checkPlanAccess(feature) {
  const plan = sessionStorage.getItem('plan') || 'enterprise';
  const features = PLAN_FEATURES[plan] || PLAN_FEATURES.starter;
  return features.includes('all') || features.includes(feature);
}

// ——— State ———

let _activeSection   = 'overview';
let _snapshotUnsubs  = {};         // { sectionName: unsubFn }
let _sectionLoaded   = {};         // { sectionName: true }
let _accountData     = {};
let _todayBookings   = [];

const SECTION_LABELS = {
  overview:  'Overview',
  enquiries: 'Enquiries',
  customers: 'Customers',
  bookings:  'Bookings',
  jobs:      'Job Cards',
  invoices:  'Invoices',
  mot:       'MOT Tracker',
  whatsapp:  'WhatsApp',
  revenue:   'Revenue',
  team:      'Team',
  settings:  'Settings'
};

// ——— Helpers ———

function today() { return new Date().toISOString().split('T')[0]; }
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }
function showAppLoader(visible) {
  const el = document.getElementById('appLoader');
  if (el) el.style.display = visible ? 'flex' : 'none';
}

/** Animate count-up on stat number elements */
function animateCount(el, target) {
  if (!el) return;
  const n = parseInt(target, 10) || 0;
  let current = 0;
  const step  = Math.max(1, Math.floor(n / 20));
  const timer = setInterval(() => {
    current = Math.min(current + step, n);
    el.textContent = current;
    if (current >= n) clearInterval(timer);
  }, 30);
}

function setCount(id, value) {
  const el = document.getElementById(id);
  if (el) animateCount(el, value);
}

function statusBadge(status) {
  const map = {
    'New':       'badge-new',
    'Contacted': 'badge-contacted',
    'Booked In': 'badge-booked',
    'Completed': 'badge-completed',
    'Cancelled': 'badge-cancelled',
    'Open':      'badge-new',
    'In Progress':'badge-booked',
    'Complete':  'badge-completed',
    'Paid':      'badge-completed',
    'Unpaid':    'badge-new',
    'Overdue':   'badge-danger'
  };
  return map[status] || 'badge-new';
}

// ——— Settings (garage-scoped) ———

export async function initSettings() {
  const gid = getGarageId();
  if (!gid) return;
  try {
    const snap = await garageRef('settings').doc('config').get();
    const def  = getDefaultSettings();
    const stored = snap.exists ? snap.data() : {};
    window._settings = Object.assign({}, def, stored);
    window._settings.workingHours = Object.assign({}, def.workingHours, stored.workingHours || {});
    if (!Array.isArray(window._settings.reminderDays)) window._settings.reminderDays = def.reminderDays;
    if (!Array.isArray(window._settings.blockedDates))  window._settings.blockedDates = [];
    if (!snap.exists) {
      garageRef('settings').doc('config').set(window._settings).catch(() => {});
    }
  } catch (e) {
    console.warn('initSettings error', e);
    window._settings = getDefaultSettings();
  }
}

// ——— Account / Trial / Plan ———

async function loadAccount() {
  try {
    const snap = await accountRef().get();
    if (snap.exists) _accountData = snap.data();
  } catch (e) {
    console.warn('loadAccount error', e);
  }
}

function checkTrialStatus() {
  const status    = _accountData.status || sessionStorage.getItem('planStatus') || 'trial';
  const trialEnd  = _accountData.trialEndsAt;
  const plan      = _accountData.plan || sessionStorage.getItem('plan') || 'enterprise';

  if (status === 'active') return; // paid subscription — nothing to do

  if (trialEnd) {
    const endDate = trialEnd.toDate ? trialEnd.toDate() : new Date(trialEnd);
    const daysLeft = Math.ceil((endDate - Date.now()) / 86400000);

    if (daysLeft <= 0 && status === 'trial') {
      showUpgradeModal('Your free trial has expired. Please upgrade to continue.');
      return;
    }

    if (daysLeft <= 3 && daysLeft > 0) {
      showTrialBanner(daysLeft);
    }
  }
}

function showTrialBanner(daysLeft) {
  const banner = document.getElementById('trialBanner');
  if (!banner) {
    const b = document.createElement('div');
    b.id        = 'trialBanner';
    b.className = 'trial-banner';
    b.innerHTML = `<i class="fas fa-clock"></i> Your free trial ends in <strong>${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>. <button class="btn btn-sm btn-primary" onclick="window.showUpgradeModal()">Upgrade Now</button> <button class="btn btn-sm btn-ghost" onclick="document.getElementById('trialBanner').remove()">Dismiss</button>`;
    document.querySelector('.topbar')?.insertAdjacentElement('afterend', b) ||
    document.body.prepend(b);
  } else {
    banner.style.display = '';
  }
}

export function showUpgradeModal(message) {
  const existing = document.getElementById('upgradeModal');
  if (existing) {
    if (message) {
      const p = existing.querySelector('.upgrade-message');
      if (p) p.textContent = message;
    }
    showModal('upgradeModal');
    return;
  }

  const overlay = document.createElement('div');
  overlay.id        = 'upgradeModal';
  overlay.className = 'modal-overlay';
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('role',       'dialog');
  overlay.innerHTML = `
    <div class="modal-panel upgrade-panel animate-slide-up">
      <div class="modal-header">
        <h3><i class="fas fa-star"></i> Upgrade Your Plan</h3>
        <button class="modal-close" onclick="window.closeModal('upgradeModal')">&times;</button>
      </div>
      <div class="modal-body">
        ${message ? `<p class="upgrade-message">${esc(message)}</p>` : '<p class="upgrade-message">Unlock this feature by upgrading your plan.</p>'}
        <div class="plan-cards">
          <div class="plan-card">
            <h4>Starter</h4><p class="plan-price">Free trial</p>
            <ul><li>Enquiries</li><li>Customers</li><li>Bookings</li></ul>
          </div>
          <div class="plan-card featured">
            <h4>Pro</h4><p class="plan-price">£49/mo</p>
            <ul><li>Everything in Starter</li><li>Job Cards</li><li>Invoicing</li><li>MOT Tracker</li><li>WhatsApp</li><li>Revenue Reports</li></ul>
            <button class="btn btn-primary" onclick="window.location.href='tel:07749207399'">Get Pro</button>
          </div>
          <div class="plan-card">
            <h4>Enterprise</h4><p class="plan-price">£99/mo</p>
            <ul><li>Everything in Pro</li><li>Multi-user team</li><li>AI Assistant</li><li>White-label</li></ul>
            <button class="btn btn-secondary" onclick="window.location.href='tel:07749207399'">Contact Us</button>
          </div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('active'));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal('upgradeModal'); });
}

// ——— Topbar / Greeting ———

function updateTopbar(user, userData) {
  const garageName = sessionStorage.getItem('garageName') || getSettings().garageName || '';
  const userName   = sessionStorage.getItem('userName')   || userData?.name || user.email?.split('@')[0] || 'User';
  const plan       = sessionStorage.getItem('plan')       || 'enterprise';

  setText('topbarUserName',    userName);
  setText('sidebarGarageName', garageName);

  const brand = document.querySelector('.sidebar-brand-text strong');
  if (brand) brand.textContent = garageName;

  const planChip = document.getElementById('planChip');
  if (planChip) {
    planChip.textContent = plan.charAt(0).toUpperCase() + plan.slice(1);
    planChip.className   = `plan-chip plan-${plan}`;
  }

  setGreeting(userName);
}

function setGreeting(userName) {
  const el = document.getElementById('overviewGreeting');
  if (!el) return;
  const h = new Date().getHours();
  const greeting = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  el.textContent = `${greeting}, ${userName.split(' ')[0]} 👋`;
}

// ——— Sidebar / Navigation ———

function navigate(section) {
  if (!checkPlanAccess(section)) {
    showUpgradeModal(`"${SECTION_LABELS[section] || section}" is not available on your current plan.`);
    return;
  }

  // Unsubscribe previous section listeners (except persistent ones)
  const prev = _activeSection;
  if (prev !== section && _snapshotUnsubs[prev] && prev !== 'notifications') {
    _snapshotUnsubs[prev]();
    delete _snapshotUnsubs[prev];
    _sectionLoaded[prev] = false;
  }

  _activeSection = section;
  openSection(section);

  // Update breadcrumb
  const bc = document.querySelector('.topbar-breadcrumb');
  if (bc) bc.innerHTML = `<span>${SECTION_LABELS[section] || section}</span>`;

  try { sessionStorage.setItem('activeSection', section); } catch (_) {}

  // Lazy-load section
  if (!_sectionLoaded[section]) {
    _sectionLoaded[section] = true;
    loadSection(section);
  }

  // Close mobile sidebar
  document.querySelector('.sidebar')?.classList.remove('open');
}

function loadSection(section) {
  // Modules that self-register via window.sectionLoaders take priority
  if (typeof window.sectionLoaders?.[section] === 'function') {
    window.sectionLoaders[section]();
    return;
  }

  const loaders = {
    overview:      loadOverview,
    enquiries:     () => import('./enquiries.js').then(m => m.initEnquiries()).catch(() => loadEnquiries()),
    customers:     () => import('./customers.js').then(m => m.initCustomers()).catch(e => console.warn(e)),
    bookings:      () => import('./bookings.js').catch(() => loadBookingsFallback()),
    jobs:          () => import('./jobs.js').catch(e => console.warn('jobs module', e)),
    vhc:           () => import('./vhc.js').then(m => m.initVhcSection?.()).catch(e => console.warn(e)),
    clock:         () => import('./job-clock.js').then(m => m.initJobClock?.()).catch(e => console.warn(e)),
    approvals:     () => import('./photo-approval.js').then(m => m.initApprovals?.()).catch(e => console.warn(e)),
    opportunities: () => import('./opportunities.js').then(m => m.initOpportunities?.()).catch(e => console.warn(e)),
    fleet:         () => import('./fleet.js').then(m => m.initFleet?.()).catch(e => console.warn(e)),
    invoices:      () => import('./invoices.js').then(() => window.sectionLoaders?.invoices?.()).catch(e => console.warn(e)),
    revenue:       () => import('./revenue.js').then(() => window.sectionLoaders?.revenue?.()).catch(e => console.warn(e)),
    reports:       () => import('./reports.js').then(m => m.initReports?.()).catch(e => console.warn(e)),
    zread:         () => import('./z-read.js').then(m => m.initZRead?.()).catch(e => console.warn(e)),
    mot:           () => import('./mot-tracker.js').then(m => m.initMotTracker?.()).catch(() => loadMOTTracker()),
    parts:         () => import('./parts.js').then(m => m.initParts?.()).catch(e => console.warn(e)),
    reminders:     () => import('./reminders-engine.js').then(m => m.initReminders?.()).catch(e => console.warn(e)),
    settings:      () => import('./settings.js').catch(() => loadSettingsFallback()),
    users:         () => import('./multi-user.js').then(m => m.initUsers?.()).catch(e => console.warn(e)),
    team:          loadTeam
  };
  const fn = loaders[section];
  if (fn) fn();
}

function setupSidebar() {
  // Nav item clicks
  document.querySelectorAll('.nav-item[data-section], .sidebar-link[data-section]').forEach(link => {
    const section = link.dataset.section;
    if (!checkPlanAccess(section)) {
      // Add lock icon indicator
      link.classList.add('locked');
      const icon = link.querySelector('.nav-lock') || document.createElement('i');
      icon.className = 'fas fa-lock nav-lock';
      link.appendChild(icon);
    }
    link.addEventListener('click', e => {
      e.preventDefault();
      navigate(section);
    });
  });

  // Mobile sidebar toggle
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar       = document.querySelector('.sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', e => {
      if (!sidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
}

// ——— Close of Day / Z-Read ———

function setupCloseOfDay() {
  const btn = document.getElementById('closeOfDayBtn');
  if (!btn) return;
  const hour = new Date().getHours();
  if (hour < 16) {
    btn.style.display = 'none';
    return;
  }
  btn.style.display = '';
  btn.addEventListener('click', async () => {
    const { showZRead } = await import('./z-read.js').catch(() => ({
      showZRead: () => showToast('Z-Read module not yet available.', 'info')
    }));
    showZRead();
  });
}

// ——— Onboarding checklist ———

async function checkOnboarding() {
  const wrapper = document.getElementById('onboardingChecklist');
  if (!wrapper) return;

  // Check if already dismissed
  const settings = getSettings();
  if (settings.onboardingDismissed) { wrapper.style.display = 'none'; return; }

  try {
    const gid = getGarageId();
    const [custSnap, bookSnap, teamSnap] = await Promise.all([
      garageRef('customers').limit(1).get(),
      garageRef('bookings').limit(1).get(),
      garageRef('team').limit(1).get()
    ]);

    const hasCustomers   = !custSnap.empty;
    const hasBookings    = !bookSnap.empty;
    const hasSettings    = !!(settings.logoUrl && settings.address);
    const hasTeamMembers = !teamSnap.empty;

    const steps = [
      { id: 'step-customers',   done: hasCustomers,   label: 'Add your first customer' },
      { id: 'step-bookings',    done: hasBookings,     label: 'Create a booking' },
      { id: 'step-settings',    done: hasSettings,     label: 'Set logo & address in Settings' },
      { id: 'step-team',        done: hasTeamMembers,  label: 'Invite a team member' }
    ];

    const allDone = steps.every(s => s.done);
    if (allDone) {
      wrapper.style.display = 'none';
      garageRef('settings').doc('config').update({ onboardingDismissed: true }).catch(() => {});
      return;
    }

    const list = document.getElementById('onboardingSteps');
    if (list) {
      list.innerHTML = steps.map(s => `
        <li class="onboarding-step ${s.done ? 'done' : ''}">
          <i class="fas ${s.done ? 'fa-check-circle' : 'fa-circle'}"></i>
          <span>${esc(s.label)}</span>
        </li>`).join('');
    }

    wrapper.style.display = '';

    document.getElementById('dismissOnboarding')?.addEventListener('click', async () => {
      wrapper.style.display = 'none';
      garageRef('settings').doc('config').update({ onboardingDismissed: true }).catch(() => {});
    });

  } catch (e) {
    console.warn('checkOnboarding error', e);
    wrapper.style.display = 'none';
  }
}

// ——— Overview ———

function loadOverview() {
  const todayStr = today();
  showSkeleton('overviewStats');

  // Real-time today's bookings
  if (_snapshotUnsubs['overview_bookings']) {
    _snapshotUnsubs['overview_bookings']();
  }
  _snapshotUnsubs['overview_bookings'] = garageRef('bookings')
    .where('date', '==', todayStr)
    .onSnapshot(snap => {
      _todayBookings = docsToArr(snap).filter(b => b.status !== 'Cancelled');
      hideSkeleton('overviewStats');
      setCount('statBookings', _todayBookings.length);
      renderTodayBookings(_todayBookings);
    }, err => {
      hideSkeleton('overviewStats');
      console.warn('bookings snapshot error', err);
    });

  // One-time stats (enquiries, jobs, invoices, parts, MOT)
  Promise.allSettled([
    garageRef('enquiries').where('status', '==', 'New').get(),
    garageRef('jobs').where('status', 'in', ['Open', 'In Progress']).get(),
    garageRef('invoices').where('paymentStatus', '==', 'Unpaid').get(),
    garageRef('parts').get(),
    garageRef('customers').get()
  ]).then(([enqRes, jobRes, invRes, partsRes, custRes]) => {
    if (enqRes.status === 'fulfilled')  setCount('statEnquiries', enqRes.value.size);
    if (jobRes.status === 'fulfilled')  setCount('statJobs',      jobRes.value.size);

    if (invRes.status === 'fulfilled') {
      let unpaid = 0, pipelineValue = 0;
      invRes.value.forEach(d => {
        unpaid++;
        pipelineValue += parseFloat(d.data().total || 0);
      });
      setCount('statUnpaid', unpaid);
      setText('statPipeline', formatCurrency(pipelineValue));
    }

    // Low stock check
    if (partsRes.status === 'fulfilled') {
      const lowStock = partsRes.value.docs.filter(d => {
        const p = d.data();
        return (p.stock ?? 0) <= (p.reorderLevel ?? 5);
      });
      setCount('statLowStock', lowStock.length);
      renderLowStockAlert(lowStock.map(d => ({ id: d.id, ...d.data() })));
    }

    // MOT reminders due in next 30 days
    if (custRes.status === 'fulfilled') {
      const now    = Date.now();
      const in30   = now + 30 * 86400000;
      const motDue = custRes.value.docs
        .filter(d => {
          const motDate = d.data().motDue;
          if (!motDate) return false;
          const t = new Date(motDate).getTime();
          return t >= now && t <= in30;
        })
        .map(d => ({ id: d.id, ...d.data() }));
      setCount('statMOTDue', motDue.length);
      renderMOTRemindersDue(motDue);
    }
  });

  // Revenue Today (from paid invoices + completed jobs)
  garageRef('invoices').where('date', '==', todayStr).get()
    .then(snap => {
      let revenue = 0;
      snap.forEach(d => {
        const inv = d.data();
        if (['Paid', 'paid'].includes(inv.paymentStatus)) {
          revenue += parseFloat(inv.total || 0);
        }
      });
      if (revenue > 0) {
        setText('statRevenue', formatCurrency(revenue));
        return;
      }
      // Fallback: sum completed jobs for today
      return garageRef('jobs').where('dateIn', '==', todayStr).get().then(jSnap => {
        jSnap.forEach(d => {
          const j = d.data();
          if (['complete', 'Complete', 'completed', 'Completed'].includes(j.status)) {
            revenue += parseFloat(j.jobValue || 0);
          }
        });
        setText('statRevenue', formatCurrency(revenue));
      });
    })
    .catch(() => setText('statRevenue', '£0.00'));

  // Recent enquiries
  garageRef('enquiries').orderBy('createdAt', 'desc').limit(5).get()
    .then(snap => renderRecentEnquiries(docsToArr(snap)))
    .catch(() => {});
}

function renderTodayBookings(bookings) {
  const el = document.getElementById('todayBookingsList');
  if (!el) return;
  if (bookings.length === 0) {
    el.innerHTML = `<p class="empty-note"><i class="fas fa-calendar-check"></i> No bookings for today.</p>`;
    return;
  }
  el.innerHTML = bookings
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))
    .map(b => `
      <div class="booking-row">
        <span class="booking-time">${esc(b.time || '—')}</span>
        <span class="booking-name">${esc(b.customerName || b.name || '—')}</span>
        <span class="booking-service">${esc(b.service || b.serviceType || '—')}</span>
        <span class="badge ${statusBadge(b.status)}">${esc(b.status || 'Confirmed')}</span>
      </div>`).join('');
}

function renderRecentEnquiries(enquiries) {
  const el = document.getElementById('recentEnquiriesList');
  if (!el) return;
  if (enquiries.length === 0) {
    el.innerHTML = `<p class="empty-note"><i class="fas fa-inbox"></i> No recent enquiries.</p>`;
    return;
  }
  el.innerHTML = enquiries.map(e => `
    <div class="mini-row">
      <div class="mini-row-left">
        <span class="mini-name">${esc(e.name || '—')}</span>
        <span class="mini-sub">${esc(e.service || '—')} &bull; ${esc(e.phone || '—')}</span>
      </div>
      <div class="mini-row-right">
        <span class="badge ${statusBadge(e.status)}">${esc(e.status || '—')}</span>
        <span class="mini-date">${formatDate(e.createdAt || e.date)}</span>
      </div>
    </div>`).join('');
}

function renderMOTRemindersDue(customers) {
  const el = document.getElementById('motRemindersToday');
  if (!el) return;
  if (!customers.length) {
    el.innerHTML = `<p class="empty-note"><i class="fas fa-check-circle"></i> No MOT reminders due in the next 30 days.</p>`;
    return;
  }
  el.innerHTML = customers.slice(0, 5).map(c => {
    const daysLeft = Math.round((new Date(c.motDue).getTime() - Date.now()) / 86400000);
    const cls = daysLeft <= 0 ? 'badge-danger' : daysLeft <= 7 ? 'badge-warning' : 'badge-new';
    const label = daysLeft <= 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`;
    return `<div class="mini-row">
      <div class="mini-row-left">
        <span class="mini-name">${esc(c.name || '—')}</span>
        <span class="mini-sub">${esc(c.reg || '—')} &bull; Due ${formatDate(c.motDue)}</span>
      </div>
      <div class="mini-row-right">
        <span class="badge ${cls}">${label}</span>
      </div>
    </div>`;
  }).join('');
}

function renderLowStockAlert(parts) {
  const el = document.getElementById('lowStockList');
  if (!el || parts.length === 0) return;
  el.innerHTML = parts.slice(0, 5).map(p => `
    <div class="low-stock-row">
      <span>${esc(p.name)}</span>
      <span class="badge badge-danger">${p.stock ?? 0} left</span>
    </div>`).join('');
  const wrapper = document.getElementById('lowStockAlerts');
  if (wrapper) wrapper.style.display = parts.length > 0 ? '' : 'none';
}

// ——— Enquiries section ———

let _enquiryFilter = 'all';
let _enquirySearch = '';

function loadEnquiries() {
  if (_snapshotUnsubs['enquiries']) return; // already listening

  showSkeleton('page-enquiries');

  _snapshotUnsubs['enquiries'] = garageRef('enquiries')
    .orderBy('createdAt', 'desc')
    .onSnapshot(snap => {
      window._enquiriesData = docsToArr(snap);
      hideSkeleton('page-enquiries');
      renderEnquiriesTable();
      updateBadge('enquiriesBadge', window._enquiriesData.filter(e => e.status === 'New').length);
    }, err => {
      hideSkeleton('page-enquiries');
      showToast('Failed to load enquiries', 'error');
      console.error(err);
    });

  document.getElementById('enquirySearch')?.addEventListener('input',
    debounce(e => { _enquirySearch = e.target.value; renderEnquiriesTable(); }, 250));

  document.getElementById('enquiryFilter')?.addEventListener('change', e => {
    _enquiryFilter = e.target.value;
    renderEnquiriesTable();
  });
}

function renderEnquiriesTable() {
  const q        = _enquirySearch.toLowerCase();
  const filtered = (window._enquiriesData || []).filter(e => {
    const matchStatus = _enquiryFilter === 'all' || e.status === _enquiryFilter;
    const matchSearch = !q ||
      (e.name  || '').toLowerCase().includes(q) ||
      (e.email || '').toLowerCase().includes(q) ||
      (e.phone || '').includes(q) ||
      (e.reg   || '').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const tbody = document.getElementById('enquiriesTbody') || document.getElementById('enquiriesBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-empty"><i class="fas fa-search"></i> No enquiries match your search.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(e => `
    <tr>
      <td class="td-muted">${formatDate(e.createdAt || e.date)}</td>
      <td class="td-name">${esc(e.name)}</td>
      <td>${esc(e.phone)}</td>
      <td class="td-muted">${esc(e.email || '—')}</td>
      <td class="td-mono">${esc(e.reg || '—')}</td>
      <td>${esc(e.service)}</td>
      <td>
        <select class="status-select" onchange="window._updateEnquiryStatus('${e.id}', this.value)">
          ${['New','Contacted','Booked In','Completed','Cancelled']
            .map(s => `<option value="${s}"${e.status === s ? ' selected' : ''}>${s}</option>`)
            .join('')}
        </select>
      </td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="window._viewEnquiry('${e.id}')" title="View"><i class="fas fa-eye"></i></button>
          <button class="action-btn success" onclick="window._convertToBooking('${e.id}')" title="Convert to booking"><i class="fas fa-calendar-plus"></i></button>
          <a class="action-btn success" href="https://wa.me/${_waPhone(e.phone)}?text=${encodeURIComponent(e.name ? 'Hi ' + e.name.split(' ')[0] + ', thanks for your enquiry!' : '')}" target="_blank" rel="noopener" title="WhatsApp"><i class="fab fa-whatsapp"></i></a>
          <button class="action-btn danger" onclick="window._deleteEnquiry('${e.id}')" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`).join('');
}

function _waPhone(phone) {
  if (!phone) return '';
  const clean = phone.replace(/[\s\-\(\)\+]/g, '');
  if (clean.startsWith('44')) return clean;
  if (clean.startsWith('0'))  return '44' + clean.slice(1);
  return clean;
}

window._updateEnquiryStatus = async (id, status) => {
  try {
    await garageDoc('enquiries', id).update({ status, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });
    showToast(`Status updated to "${status}"`, 'success');
  } catch {
    showToast('Failed to update status', 'error');
  }
};

window._deleteEnquiry = async id => {
  const ok = await showConfirm({ title: 'Delete Enquiry', message: 'This cannot be undone.', confirmText: 'Delete', danger: true });
  if (!ok) return;
  try {
    await garageDoc('enquiries', id).delete();
    showToast('Enquiry deleted', 'info');
  } catch {
    showToast('Failed to delete enquiry', 'error');
  }
};

window._viewEnquiry = id => {
  const e = (window._enquiriesData || []).find(x => x.id === id);
  if (!e) return;
  const content = document.getElementById('enquiryDetailContent');
  if (!content) return;
  content.innerHTML = `
    <div class="detail-grid">
      <div class="detail-item"><label>Name</label><p>${esc(e.name)}</p></div>
      <div class="detail-item"><label>Phone</label><p>${esc(e.phone)}</p></div>
      <div class="detail-item"><label>Email</label><p>${esc(e.email || '—')}</p></div>
      <div class="detail-item"><label>Reg</label><p class="mono">${esc(e.reg || '—')}</p></div>
      <div class="detail-item"><label>Service</label><p>${esc(e.service)}</p></div>
      <div class="detail-item"><label>Preferred Date</label><p>${formatDate(e.preferredDate)}</p></div>
      <div class="detail-item"><label>Submitted</label><p>${formatDateTime(e.createdAt || e.date)}</p></div>
      <div class="detail-item"><label>Status</label><p><span class="badge ${statusBadge(e.status)}">${esc(e.status)}</span></p></div>
    </div>
    ${e.message ? `<div class="detail-item"><label>Message</label><p>${esc(e.message)}</p></div>` : ''}`;
  const modal = document.getElementById('enquiryDetailModal');
  modal?.classList.add('open');
};

window._convertToBooking = id => {
  const e = (window._enquiriesData || []).find(x => x.id === id);
  if (!e) return;
  navigate('bookings');
  // Pre-fill booking modal after a tick
  setTimeout(() => {
    const prefill = { customerName: e.name, phone: e.phone, email: e.email, reg: e.reg, service: e.service, date: e.preferredDate, fromEnquiryId: id };
    window._prefillBookingModal?.(prefill);
  }, 300);
};

document.getElementById('closeEnquiryModal')?.addEventListener('click', () =>
  document.getElementById('enquiryDetailModal')?.classList.remove('open'));
document.getElementById('enquiryDetailModal')?.addEventListener('click', e => {
  if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// ——— MOT Tracker (in-dashboard fallback) ———

async function loadMOTTracker() {
  showSkeleton('page-mot');
  try {
    const snap = await garageRef('customers').get();
    const customers = docsToArr(snap);
    const now = Date.now();
    let expired = 0, urgent = 0, warn = 0, ok = 0;

    const rows = customers.map(c => {
      if (!c.motDue) return null;
      const due      = new Date(c.motDue + 'T12:00:00').getTime();
      const daysLeft = Math.round((due - now) / 86400000);
      let sc, label;
      if (daysLeft < 0)         { sc = 'badge-danger';  label = `${Math.abs(daysLeft)}d overdue`; expired++; }
      else if (daysLeft <= 7)   { sc = 'badge-danger';  label = `Due in ${daysLeft}d`; urgent++; }
      else if (daysLeft <= 30)  { sc = 'badge-warning'; label = `Due in ${daysLeft}d`; warn++; }
      else                      { sc = 'badge-success'; label = `${daysLeft}d left`; ok++; }
      return `<tr>
        <td class="td-name">${esc(c.name)}</td>
        <td>${esc(c.phone || '—')}</td>
        <td class="td-mono">${esc(c.reg || '—')}</td>
        <td class="td-muted">${esc((c.vehicles?.[0]?.make || c.make || '') + ' ' + (c.vehicles?.[0]?.model || c.model || ''))}</td>
        <td>${formatDate(c.motDue)}</td>
        <td><span class="badge ${sc}">${label}</span></td>
        <td>—</td>
        <td><button class="btn-sm btn-success" onclick="window.sendMOTReminderWA?.('${c.id}')"><i class="fab fa-whatsapp"></i> Remind</button></td>
      </tr>`;
    }).filter(Boolean);

    const tbody = document.getElementById('motTbody');
    if (tbody) {
      tbody.innerHTML = rows.length
        ? rows.join('')
        : `<tr><td colspan="8" class="table-empty"><i class="fas fa-car"></i> No customers with MOT dates recorded.</td></tr>`;
    }

    setText('motExpiredCount', `${expired} Expired`);
    setText('motUrgentCount',  `${urgent} Due in 7 days`);
    setText('motWarnCount',    `${warn} Due in 30 days`);
    setText('motOkCount',      `${ok} OK`);

  } catch (e) {
    console.error('loadMOTTracker error', e);
    showToast('Failed to load MOT tracker', 'error');
  } finally {
    hideSkeleton('page-mot');
  }
}

// ——— Team section (basic placeholder) ———

async function loadTeam() {
  showSkeleton('page-team');
  try {
    const snap = await garageRef('team').get();
    const members = docsToArr(snap);
    const tbody = document.getElementById('teamBody');
    if (tbody) {
      if (members.length === 0) {
        showEmptyState('page-team', { icon: 'fa-users', title: 'No team members yet', subtitle: 'Invite colleagues to join your garage workspace.' });
      } else {
        tbody.innerHTML = members.map(m => `
          <tr>
            <td>${esc(m.name)}</td>
            <td>${esc(m.email)}</td>
            <td><span class="badge">${esc(m.role || 'Staff')}</span></td>
            <td><span class="badge ${m.active ? 'badge-success' : 'badge-cancelled'}">${m.active ? 'Active' : 'Inactive'}</span></td>
          </tr>`).join('');
      }
    }
  } catch (e) {
    console.error('loadTeam error', e);
  } finally {
    hideSkeleton('page-team');
  }
}

// ——— Bookings fallback (when bookings.js module not available) ———

async function loadBookingsFallback() {
  showSkeleton('page-bookings');
  try {
    const snap = await garageRef('bookings').orderBy('date', 'desc').limit(50).get();
    const bookings = docsToArr(snap);
    const tbody = document.getElementById('bookingsBody');
    if (tbody) {
      tbody.innerHTML = bookings.length ? bookings.map(b => `
        <tr>
          <td>${formatDate(b.date)}</td>
          <td>${esc(b.time || '—')}</td>
          <td>${esc(b.customerName || b.name || '—')}</td>
          <td>${esc(b.service || b.serviceType || '—')}</td>
          <td><span class="badge ${statusBadge(b.status)}">${esc(b.status || 'Confirmed')}</span></td>
        </tr>`).join('')
        : `<tr><td colspan="5" class="table-empty"><i class="fas fa-calendar"></i> No bookings found.</td></tr>`;
    }
  } catch (e) { console.error('bookings fallback error', e); }
  finally { hideSkeleton('page-bookings'); }
}

// ——— Settings fallback ———

async function loadSettingsFallback() {
  const s = getSettings();
  const fieldMap = {
    settingGarageName: 'garageName',
    settingPhone:      'phone',
    settingEmail:      'email',
    settingAddress:    'address'
  };
  Object.entries(fieldMap).forEach(([id, key]) => {
    const el = document.getElementById(id);
    if (el) el.value = s[key] || '';
  });
}

// ——— Save settings to Firestore ———

export async function saveSettings(settings) {
  window._settings = settings;
  await garageRef('settings').doc('config').set(settings, { merge: true });
}

// ——— Expose navigate globally for cross-module use ———

window.navigate          = navigate;
window.loadSection       = loadSection;
window.showUpgradeModal  = showUpgradeModal;
window.checkPlanAccess   = checkPlanAccess;
window.statusBadge       = statusBadge;
window.saveSettings      = saveSettings;
window._enquiriesData    = window._enquiriesData || [];

// Expose active section for cross-module use
Object.defineProperty(window, '_currentSection', {
  get: () => _activeSection,
  configurable: true
});

// ——— Dashboard init ———

export async function initDashboard() {
  showAppLoader(true);

  requireAuth(async (user, userData) => {
    try {
      await Promise.all([initSettings(), loadAccount()]);
    } catch (e) {
      console.warn('Init error', e);
    }

    checkTrialStatus();
    updateTopbar(user, userData);
    setupSidebar();
    setupCloseOfDay();
    checkOnboarding();

    // Topbar logout button (sidebar logoutBtn is handled by auth.js)
    document.getElementById('topbarLogout')?.addEventListener('click', async () => {
      const ok = await showConfirm({ title: 'Log out', message: 'Are you sure you want to log out?', confirmText: 'Log out' });
      if (ok) { auth.signOut().then(() => { sessionStorage.clear(); window.location.href = 'login.html'; }); }
    });

    // Quick action buttons in overview header
    document.getElementById('quickNewBooking')?.addEventListener('click', () => {
      navigate('bookings');
      setTimeout(() => document.getElementById('newBookingBtn')?.click(), 400);
    });
    document.getElementById('quickNewJob')?.addEventListener('click', () => {
      navigate('jobs');
      setTimeout(() => document.getElementById('newJobBtn')?.click(), 400);
    });
    document.getElementById('quickNewCustomer')?.addEventListener('click', () => {
      navigate('customers');
      setTimeout(() => document.getElementById('newCustomerBtn')?.click(), 400);
    });

    // Import & start notifications
    import('./notifications.js')
      .then(m => m.initNotifications(getGarageId()))
      .catch(() => {});

    showAppLoader(false);

    // Restore last active section or default to overview
    const savedSection = sessionStorage.getItem('activeSection') || 'overview';
    navigate(savedSection);

    // Start enquiries listener eagerly for real-time badge updates
    import('./enquiries.js')
      .then(m => { m.initEnquiries(); _sectionLoaded['enquiries'] = true; })
      .catch(() => loadEnquiries());
  });
}

// ——— Bootstrap ———

if (document.getElementById('dashboardApp')) {
  initDashboard();
}

window.initDashboard = initDashboard;
