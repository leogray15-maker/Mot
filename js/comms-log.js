/* ===========================
   GarageOS — Communications Log
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { formatDateTime, esc } from './utils.js';

const FieldValue = firebase.firestore.FieldValue;

const TYPE_ICONS = {
  whatsapp:        'fab fa-whatsapp text-wa',
  email:           'fas fa-envelope text-blue',
  booking_confirm: 'fas fa-calendar-check text-success',
  mot_reminder:    'fas fa-car text-warning',
  review_request:  'fas fa-star text-gold',
  invoice_sent:    'fas fa-file-invoice text-blue',
  vhc_sent:        'fas fa-clipboard-check text-success',
  approval_sent:   'fas fa-camera text-amber',
  approval_received:'fas fa-check-circle text-success',
  job_complete:    'fas fa-wrench text-success',
  note:            'fas fa-sticky-note text-muted',
  service_reminder:'fas fa-bell text-warning',
  birthday:        'fas fa-birthday-cake text-gold'
};

const TYPE_LABELS = {
  whatsapp:        'WhatsApp',
  email:           'Email',
  booking_confirm: 'Booking Confirmed',
  mot_reminder:    'MOT Reminder',
  review_request:  'Review Request',
  invoice_sent:    'Invoice Sent',
  vhc_sent:        'VHC Report Sent',
  approval_sent:   'Approval Sent',
  approval_received:'Approval Received',
  job_complete:    'Job Complete',
  note:            'Note',
  service_reminder:'Service Reminder',
  birthday:        'Birthday Message'
};

// ——— Load for a customer ———
export async function loadCommsLog(customerId) {
  try {
    const snap = await garageRef('comms_log')
      .where('customerId','==',customerId)
      .orderBy('createdAt','desc')
      .limit(100)
      .get();
    return docsToArr(snap);
  } catch (err) {
    console.error(err);
    return [];
  }
}

// ——— Render timeline ———
export function renderCommsTimeline(logs, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!logs.length) { el.innerHTML = '<p class="text-muted">No communications logged yet.</p>'; return; }
  el.innerHTML = `<div class="comms-timeline">${logs.map(log => {
    const ts    = log.createdAt?.toDate ? log.createdAt.toDate() : new Date(log.createdAt||0);
    const icon  = TYPE_ICONS[log.type] || 'fas fa-comment text-muted';
    const label = TYPE_LABELS[log.type] || log.type || 'Communication';
    const dir   = log.direction === 'inbound' ? 'inbound' : 'outbound';
    return `<div class="comms-entry comms-${dir}">
      <div class="comms-icon-wrap"><i class="${icon}"></i></div>
      <div class="comms-body">
        <div class="comms-meta">
          <span class="comms-label">${label}</span>
          <span class="comms-dir">${dir}</span>
          <span class="comms-time">${ts.toLocaleString('en-GB')}</span>
        </div>
        ${log.content ? `<div class="comms-content">${esc(log.content.slice(0,200))}${log.content.length>200?'…':''}</div>` : ''}
        ${log.stage ? `<div class="comms-stage">Stage: ${esc(log.stage)}</div>` : ''}
      </div>
    </div>`;
  }).join('')}</div>`;
}

// ——— Load for a job ———
export async function loadJobCommsLog(jobId) {
  try {
    const snap = await garageRef('comms_log')
      .where('jobId','==',jobId)
      .orderBy('createdAt','desc')
      .limit(50)
      .get();
    return docsToArr(snap);
  } catch {
    return [];
  }
}

// ——— Add log entry ———
export async function addLog(data) {
  try {
    await garageRef('comms_log').add({
      ...data,
      createdAt: FieldValue.serverTimestamp()
    });
  } catch (err) {
    console.error('Failed to log communication:', err);
  }
}

// Expose on window for use by other modules
window.addCommsLog = addLog;
window.renderCommsTimeline = renderCommsTimeline;
window.loadCommsLog = loadCommsLog;
window.loadJobCommsLog = loadJobCommsLog;
