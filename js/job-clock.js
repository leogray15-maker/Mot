/* ===========================
   GarageOS — Job Clock & Time Tracking
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, esc } from './utils.js';

const FieldValue = firebase.firestore.FieldValue;
let clockIntervals = {};

export function initJobClock() {
  loadActiveSessions();
  loadClockLog();
  checkAutoTimeout();
}

// ——— Clock On ———
export async function clockOn(jobId, techId, techName) {
  try {
    // Check if already clocked on
    const existing = await garageRef('technician_sessions')
      .where('jobId','==',jobId).where('techId','==',techId).where('endTime','==',null).limit(1).get();
    if (!existing.empty) { showToast('Already clocked on to this job', 'warning'); return; }

    const sessionRef = await garageRef('technician_sessions').add({
      jobId, techId, techName,
      startTime: FieldValue.serverTimestamp(),
      endTime:   null, duration: 0, notes: '',
      createdAt: FieldValue.serverTimestamp()
    });

    // Update job status
    await garageDoc('jobs', jobId).update({
      status:    'in_progress',
      updatedAt: FieldValue.serverTimestamp()
    });

    showToast(`${techName} clocked on to job`, 'success');
    startTimerDisplay(sessionRef.id);
    loadActiveSessions();
    return sessionRef.id;
  } catch (err) {
    console.error(err);
    showToast('Failed to clock on', 'error');
  }
}

// ——— Clock Off ———
export async function clockOff(sessionId, jobId) {
  try {
    const doc = await garageRef('technician_sessions').doc(sessionId).get();
    if (!doc.exists) return;
    const session = doc.data();
    const start   = session.startTime?.toDate ? session.startTime.toDate() : new Date(session.startTime);
    const end     = new Date();
    const duration = Math.floor((end - start) / 60000); // in minutes

    await garageRef('technician_sessions').doc(sessionId).update({
      endTime:  firebase.firestore.Timestamp.fromDate(end),
      duration, updatedAt: FieldValue.serverTimestamp()
    });

    // Add to job clock log
    await garageDoc('jobs', jobId).update({
      clockLog: FieldValue.arrayUnion({
        sessionId, techId: session.techId, techName: session.techName,
        startTime: session.startTime, endTime: firebase.firestore.Timestamp.fromDate(end),
        duration, createdAt: new Date().toISOString()
      }),
      actualHours: firebase.firestore.FieldValue.increment(duration / 60),
      updatedAt: FieldValue.serverTimestamp()
    });

    // Check if over quoted time
    const jobDoc = await garageDoc('jobs', jobId).get();
    const job = jobDoc.data();
    const totalMins = ((job.actualHours || 0) * 60);
    const quotedMins = ((job.estimatedHours || 0) * 60);
    if (quotedMins > 0 && totalMins > quotedMins * 1.2) {
      showToast(`⚠️ Job ${job.reg||''} is over quoted time by ${Math.round((totalMins-quotedMins))}min`, 'warning');
    }

    stopTimerDisplay(sessionId);
    showToast(`Clocked off — ${formatDuration(duration * 60000)}`, 'success');
    loadActiveSessions();
    loadClockLog();
  } catch (err) {
    console.error(err);
    showToast('Failed to clock off', 'error');
  }
}

// ——— Active sessions ———
async function loadActiveSessions() {
  const el = document.getElementById('activeClockSessions');
  if (!el) return;
  try {
    const snap = await garageRef('technician_sessions').where('endTime','==',null).get();
    const sessions = docsToArr(snap);
    if (!sessions.length) {
      el.innerHTML = '<div class="empty-state"><i class="fas fa-clock fa-2x"></i><h4>No active clock sessions</h4><p>Clock on from a job card to start tracking time.</p></div>';
      return;
    }
    el.innerHTML = `<div class="active-sessions-grid">${sessions.map(s => {
      const start = s.startTime?.toDate ? s.startTime.toDate() : new Date();
      const elapsed = Date.now() - start.getTime();
      return `<div class="session-card card">
        <div class="session-tech"><i class="fas fa-user-hard-hat"></i> ${esc(s.techName||'Unknown')}</div>
        <div class="session-job">Job: ${esc(s.jobId||'—')}</div>
        <div class="session-timer" id="timer-${s.id}">${formatDuration(elapsed)}</div>
        <button class="btn-danger btn-sm" onclick="clockOff('${s.id}','${s.jobId}')"><i class="fas fa-stop"></i> Clock Off</button>
      </div>`;
    }).join('')}</div>`;
    sessions.forEach(s => startTimerDisplay(s.id, s.startTime?.toDate ? s.startTime.toDate() : new Date()));
  } catch {}
}

// ——— Clock log table ———
async function loadClockLog() {
  const tbody = document.getElementById('clockLogTbody');
  if (!tbody) return;
  try {
    const snap = await garageRef('technician_sessions').orderBy('createdAt','desc').limit(50).get();
    const logs = docsToArr(snap);
    tbody.innerHTML = logs.map(l => {
      const start = l.startTime?.toDate ? l.startTime.toDate() : null;
      const end   = l.endTime?.toDate   ? l.endTime.toDate()   : null;
      return `<tr>
        <td>${esc(l.jobId||'—')}</td>
        <td>${esc(l.techName||'—')}</td>
        <td>${start ? start.toLocaleString('en-GB') : '—'}</td>
        <td>${end   ? end.toLocaleString('en-GB')   : '<span class="text-success">Active</span>'}</td>
        <td>${l.duration ? formatDuration(l.duration * 60000) : '—'}</td>
        <td>${esc(l.notes||'')}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-cell">No time logs yet.</td></tr>';
  } catch {}
}

// ——— Timer display ———
function startTimerDisplay(sessionId, startTime) {
  const start = startTime || new Date();
  if (clockIntervals[sessionId]) clearInterval(clockIntervals[sessionId]);
  clockIntervals[sessionId] = setInterval(() => {
    const el = document.getElementById(`timer-${sessionId}`);
    if (el) el.textContent = formatDuration(Date.now() - start.getTime());
    else    { clearInterval(clockIntervals[sessionId]); delete clockIntervals[sessionId]; }
  }, 1000);
}

function stopTimerDisplay(sessionId) {
  if (clockIntervals[sessionId]) { clearInterval(clockIntervals[sessionId]); delete clockIntervals[sessionId]; }
  const el = document.getElementById(`timer-${sessionId}`);
  if (el) el.textContent = 'Done';
}

// ——— Auto-timeout ———
async function checkAutoTimeout() {
  try {
    const cutoff = new Date(Date.now() - 12 * 3600000); // 12 hours ago
    const snap   = await garageRef('technician_sessions').where('endTime','==',null).where('createdAt','<', firebase.firestore.Timestamp.fromDate(cutoff)).get();
    for (const doc of snap.docs) {
      const s = doc.data();
      await garageRef('technician_sessions').doc(doc.id).update({
        endTime:  FieldValue.serverTimestamp(),
        duration: 12 * 60,
        notes:    'Auto-closed after 12 hours inactivity',
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  } catch {}
}

// ——— Helpers ———
export function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

// Expose for job modal
window.clockOn  = clockOn;
window.clockOff = clockOff;
