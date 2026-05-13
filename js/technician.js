/* ===========================
   GarageOS — Technician Tablet Mode
   =========================== */

import { getGarageId, garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, esc } from './utils.js';

const FieldValue = firebase.firestore.FieldValue;
let currentTech   = null;
let currentJobs   = [];

// ——— Init ———
document.addEventListener('DOMContentLoaded', () => {
  setupLoginScreen();
  loadTechnicianNames();
});

// ——— Login screen ———
async function loadTechnicianNames() {
  try {
    const snap  = await garageRef('users').where('role','==','technician').where('status','==','active').get();
    const techs = docsToArr(snap);
    const select = document.getElementById('techSelect');
    if (!select) return;
    select.innerHTML = '<option value="">Select your name…</option>' +
      techs.map(t => `<option value="${esc(t.id)}" data-name="${esc(t.name)}">${esc(t.name)}</option>`).join('');
  } catch {}
}

function setupLoginScreen() {
  const pinBtns = document.querySelectorAll('.pin-btn');
  let pinEntry  = '';
  const pinDisplay = document.getElementById('pinDisplay');

  pinBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      if (val === 'clear') {
        pinEntry = '';
        if (pinDisplay) pinDisplay.textContent = '';
        return;
      }
      if (val === 'enter') { submitPin(pinEntry); return; }
      if (pinEntry.length >= 4) return;
      pinEntry += val;
      if (pinDisplay) pinDisplay.textContent = '•'.repeat(pinEntry.length);
      if (pinEntry.length === 4) setTimeout(() => submitPin(pinEntry), 300);
    });
  });
}

async function submitPin(pin) {
  const techId = document.getElementById('techSelect')?.value;
  const techName = document.getElementById('techSelect')?.selectedOptions[0]?.dataset.name;
  if (!techId) { showError('Please select your name first.'); return; }

  try {
    const encoder = new TextEncoder();
    const data    = encoder.encode(pin);
    const hash    = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');

    const userDoc = await garageDoc('users', techId).get();
    const userData = userDoc.data();

    if (userData?.pin !== hashHex) {
      showError('Incorrect PIN. Please try again.');
      document.getElementById('pinDisplay').textContent = '';
      return;
    }

    currentTech = { id: techId, name: techName || userData.name };
    document.getElementById('techLoginScreen').style.display = 'none';
    document.getElementById('techMain').style.display = '';
    document.getElementById('techName').textContent = currentTech.name;
    startClock();
    loadTechJobs();
  } catch (err) {
    showError('Login failed. Please try again.');
  }
}

function showError(msg) {
  const el = document.getElementById('loginError');
  if (el) { el.textContent = msg; el.style.display = ''; setTimeout(() => el.style.display = 'none', 3000); }
}

// ——— Clock display ———
function startClock() {
  const el = document.getElementById('techClock');
  if (!el) return;
  const update = () => { el.textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  update();
  setInterval(update, 1000);
}

// ——— Load jobs ———
async function loadTechJobs() {
  if (!currentTech) return;
  try {
    const snap = await garageRef('jobs')
      .where('assignedTech','==', currentTech.name)
      .where('status','in',['waiting','in_progress','awaiting_parts'])
      .orderBy('createdAt','desc')
      .get();
    currentJobs = docsToArr(snap);
    renderTechJobs(currentJobs);
  } catch (err) {
    showToast('Failed to load jobs', 'error');
  }
}

function renderTechJobs(jobs) {
  const container = document.getElementById('techJobsList');
  if (!container) return;
  if (!jobs.length) {
    container.innerHTML = '<div class="tech-empty"><i class="fas fa-check-circle"></i><p>No jobs assigned to you today.</p></div>';
    return;
  }
  container.innerHTML = jobs.map(j => `
    <div class="tech-job-card" data-job-id="${j.id}">
      <div class="tech-job-header">
        <span class="uk-plate">${esc(j.reg||'—')}</span>
        <span class="tech-job-customer">${esc(j.customerName||'Unknown')}</span>
        <span class="tech-job-status status-${j.status}">${esc(j.status?.replace('_',' ')||'')}</span>
      </div>
      <div class="tech-job-service">${esc(j.serviceType||j.service||'')}</div>
      ${j.bay ? `<div class="tech-job-bay">Bay ${j.bay}</div>` : ''}
      <div class="tech-job-buttons">
        <button class="btn-clock-on" onclick="techClockOn('${j.id}')"><i class="fas fa-play"></i> Clock On</button>
        <button class="btn-clock-off" onclick="techClockOff('${j.id}')"><i class="fas fa-stop"></i> Clock Off</button>
        <button class="btn-complete" onclick="techComplete('${j.id}')"><i class="fas fa-check"></i> Complete</button>
        <button class="btn-note" onclick="techAddNote('${j.id}')"><i class="fas fa-sticky-note"></i> Note</button>
        <button class="btn-vhc" onclick="openVhcChecklist('${j.id}')"><i class="fas fa-clipboard-check"></i> VHC</button>
      </div>
    </div>`).join('');
}

// ——— Clock actions ———
window.techClockOn = async (jobId) => {
  if (!currentTech) return;
  try {
    const existing = await garageRef('technician_sessions')
      .where('jobId','==',jobId).where('techId','==',currentTech.id).where('endTime','==',null).limit(1).get();
    if (!existing.empty) { showToast('Already clocked on', 'warning'); return; }

    await garageRef('technician_sessions').add({
      jobId, techId: currentTech.id, techName: currentTech.name,
      startTime: FieldValue.serverTimestamp(), endTime: null, duration: 0,
      createdAt: FieldValue.serverTimestamp()
    });
    await garageDoc('jobs', jobId).update({ status: 'in_progress', updatedAt: FieldValue.serverTimestamp() });
    showToast('Clocked on', 'success');
    loadTechJobs();
  } catch { showToast('Failed to clock on', 'error'); }
};

window.techClockOff = async (jobId) => {
  if (!currentTech) return;
  try {
    const snap = await garageRef('technician_sessions')
      .where('jobId','==',jobId).where('techId','==',currentTech.id).where('endTime','==',null).limit(1).get();
    if (snap.empty) { showToast('Not clocked on to this job', 'warning'); return; }
    const sessionId = snap.docs[0].id;
    const session   = snap.docs[0].data();
    const start     = session.startTime?.toDate ? session.startTime.toDate() : new Date();
    const end       = new Date();
    const duration  = Math.floor((end - start) / 60000);

    await garageRef('technician_sessions').doc(sessionId).update({
      endTime: firebase.firestore.Timestamp.fromDate(end), duration,
      updatedAt: FieldValue.serverTimestamp()
    });
    showToast(`Clocked off — ${Math.floor(duration/60)}h ${duration%60}m`, 'success');
    loadTechJobs();
  } catch { showToast('Failed to clock off', 'error'); }
};

window.techComplete = async (jobId) => {
  if (!confirm('Mark this job as complete?')) return;
  try {
    await garageDoc('jobs', jobId).update({
      status: 'pending_payment', completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    showToast('Job marked as complete', 'success');
    currentJobs = currentJobs.filter(j => j.id !== jobId);
    renderTechJobs(currentJobs);
  } catch { showToast('Failed to update job', 'error'); }
};

window.techAddNote = async (jobId) => {
  const note = prompt('Add a note to this job:');
  if (!note) return;
  try {
    await garageDoc('jobs', jobId).update({
      notes: firebase.firestore.FieldValue.arrayUnion(`[${currentTech.name}] ${note}`),
      updatedAt: FieldValue.serverTimestamp()
    });
    await garageRef('comms_log').add({
      jobId, type: 'note', direction: 'internal',
      content: `${currentTech.name}: ${note}`, createdAt: FieldValue.serverTimestamp()
    });
    showToast('Note added', 'success');
  } catch { showToast('Failed to add note', 'error'); }
};

// ——— VHC Checklist ———
const VHC_ITEMS = [
  { category:'Brakes', items:['Front Pads','Rear Pads','Front Discs','Rear Discs','Handbrake','Brake Fluid Level','Brake Fluid Condition'] },
  { category:'Tyres', items:['NSF Tread','OSF Tread','NSR Tread','OSR Tread','Spare Tyre','Tyre Pressures','Sidewall Condition'] },
  { category:'Lights', items:['Headlights','Rear Lights','Brake Lights','Front Indicators','Rear Indicators','Hazards','Reverse Light','Fog Light'] },
  { category:'Fluids', items:['Engine Oil Level','Oil Condition','Coolant','Power Steering Fluid','Washer Fluid','Gearbox Oil'] },
  { category:'Visual', items:['Wipers','Horn','Mirrors','Seatbelts','Warning Lights','Battery','Air Filter'] },
  { category:'Suspension', items:['Front Shocks','Rear Shocks','Front Bushes','Rear Bushes','CV Joints','Wheel Bearings','Steering'] },
  { category:'Exhaust', items:['Condition','Security','Emissions','Catalyst'] },
  { category:'Bodywork', items:['Corrosion','Screen Chips','Wiper Mechanism'] }
];

let vhcResults = {};
let vhcJobId   = '';

window.openVhcChecklist = (jobId) => {
  vhcJobId  = jobId;
  vhcResults = {};
  const modal = document.getElementById('vhcChecklistModal');
  if (!modal) return;

  const body = document.getElementById('vhcChecklistBody');
  if (body) {
    body.innerHTML = VHC_ITEMS.map(cat => `
      <div class="vhc-category">
        <h4>${cat.category}</h4>
        ${cat.items.map(item => `
          <div class="vhc-item" data-item="${esc(item)}" data-category="${esc(cat.category)}">
            <span class="vhc-item-name">${esc(item)}</span>
            <div class="vhc-buttons">
              <button class="vhc-btn vhc-green" onclick="setVhcItem('${esc(cat.category)}','${esc(item)}','green',this)">✅ OK</button>
              <button class="vhc-btn vhc-amber" onclick="setVhcItem('${esc(cat.category)}','${esc(item)}','amber',this)">⚠️ Advisory</button>
              <button class="vhc-btn vhc-red"   onclick="setVhcItem('${esc(cat.category)}','${esc(item)}','red',this)">🔴 Fail</button>
            </div>
          </div>`).join('')}
      </div>`).join('');
  }

  updateVhcProgress();
  modal.style.display = '';
};

window.setVhcItem = (category, item, status, btn) => {
  const key = `${category}:${item}`;
  vhcResults[key] = { category, name: item, status };
  btn.closest('.vhc-buttons').querySelectorAll('.vhc-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  updateVhcProgress();
};

function updateVhcProgress() {
  const total   = VHC_ITEMS.reduce((s, c) => s + c.items.length, 0);
  const done    = Object.keys(vhcResults).length;
  const pct     = Math.round(done / total * 100);
  const bar     = document.getElementById('vhcProgressBar');
  const label   = document.getElementById('vhcProgressLabel');
  if (bar)   bar.style.width   = pct + '%';
  if (label) label.textContent = `${done}/${total} items checked`;
}

document.getElementById('submitVhcBtn')?.addEventListener('click', submitVhc);

async function submitVhc() {
  const items = Object.values(vhcResults);
  if (!items.length) { showToast('Please check at least one item', 'warning'); return; }
  const summary = { green: items.filter(i=>i.status==='green').length, amber: items.filter(i=>i.status==='amber').length, red: items.filter(i=>i.status==='red').length };

  try {
    const jobDoc = await garageDoc('jobs', vhcJobId).get();
    const job    = jobDoc.data();
    const garageId = sessionStorage.getItem('garageId');

    await garageRef('vhc_reports').add({
      jobId: vhcJobId, customerId: job?.customerId||'', reg: job?.reg||'',
      make: job?.make||'', model: job?.model||'', inspectionDate: new Date().toISOString().split('T')[0],
      mechanicName: currentTech?.name || 'Technician', mechanicId: currentTech?.id || '',
      items, summary, status: 'complete',
      expiresAt: new Date(Date.now() + 90*24*3600000).toISOString(),
      createdAt: FieldValue.serverTimestamp()
    });

    document.getElementById('vhcChecklistModal').style.display = 'none';
    showToast('VHC Report saved', 'success');
  } catch (err) {
    showToast('Failed to save VHC report', 'error');
  }
}

document.getElementById('closeVhcModal')?.addEventListener('click', () => {
  document.getElementById('vhcChecklistModal').style.display = 'none';
});

document.getElementById('endSessionBtn')?.addEventListener('click', () => {
  if (confirm('End your session?')) {
    currentTech = null;
    document.getElementById('techMain').style.display = 'none';
    document.getElementById('techLoginScreen').style.display = '';
    document.getElementById('pinDisplay').textContent = '';
    document.getElementById('techSelect').value = '';
  }
});
