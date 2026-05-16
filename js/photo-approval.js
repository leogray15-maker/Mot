/* ===========================
   GarageOS — Photo Approvals
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDateTime, formatCurrency, esc, getSettings } from './utils.js';

const FieldValue = firebase.firestore.FieldValue;
let allApprovals = [];

export function initApprovals() {
  loadApprovals();
  setupApprovalsUI();
}

async function loadApprovals() {
  try {
    const snap = await garageRef('approvals').orderBy('createdAt','desc').limit(100).get();
    allApprovals = docsToArr(snap);
    renderApprovalsList(allApprovals);
  } catch (err) {
    showToast('Failed to load approvals', 'error');
  }
}

function setupApprovalsUI() {
  // No extra UI needed here — send approval is triggered from job modal
}

// ——— Table ———
function renderApprovalsList(approvals) {
  const tbody = document.getElementById('approvalsTbody');
  if (!tbody) return;
  if (!approvals.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-cell">No photo approvals yet. Send one from a job card.</td></tr>';
    return;
  }
  tbody.innerHTML = approvals.map(a => {
    const statusMap = { pending:'badge-warning', approved:'badge-success', declined:'badge-danger' };
    return `<tr>
      <td>${a.createdAt?.toDate ? formatDateTime(a.createdAt.toDate().toISOString()) : '—'}</td>
      <td>${esc(a.customerName||'—')}</td>
      <td>${a.reg ? `<span class="reg-chip">${esc(a.reg)}</span>` : '—'}</td>
      <td>${esc(a.issue||'—')}</td>
      <td>${formatCurrency(a.quoteAmount||0)}</td>
      <td>${a.photoUrl ? `<a href="${esc(a.photoUrl)}" target="_blank" class="btn-sm btn-secondary"><i class="fas fa-image"></i> View</a>` : '—'}</td>
      <td><span class="badge-status ${statusMap[a.status]||''}">${esc(a.status||'pending')}</span></td>
      <td class="actions-cell">
        ${a.status === 'pending' ? `
          <button class="btn-sm btn-success" onclick="approveApproval('${a.id}')"><i class="fas fa-check"></i> Approve</button>
          <button class="btn-sm btn-danger" onclick="declineApproval('${a.id}')"><i class="fas fa-times"></i> Decline</button>
        ` : ''}
        <button class="btn-sm btn-wa" onclick="resendApproval('${a.id}')"><i class="fab fa-whatsapp"></i></button>
      </td>
    </tr>`;
  }).join('');
}

// ——— Send Approval Modal (called from job modal) ———
export async function openSendApprovalModal(jobData) {
  const issue  = prompt('Describe the issue found:');
  if (!issue) return;
  const amount = parseFloat(prompt('Quote price £:') || '0');
  const photoInput = document.createElement('input');
  photoInput.type   = 'file';
  photoInput.accept = 'image/*';
  photoInput.click();

  photoInput.onchange = async () => {
    const file = photoInput.files[0];
    let photoUrl = '';
    if (file) {
      try {
        const storageRef = firebase.storage().ref(`garages/${sessionStorage.getItem('garageId')}/approvals/${Date.now()}_${file.name}`);
        await storageRef.put(file);
        photoUrl = await storageRef.getDownloadURL();
      } catch {
        showToast('Photo upload failed — continuing without photo', 'warning');
      }
    }
    await sendApproval({ jobId: jobData.id, jobData, issue, quoteAmount: amount, photoUrl });
  };
}

// ——— Send approval ———
export async function sendApproval({ jobId, jobData, issue, quoteAmount, photoUrl }) {
  const s = getSettings();
  const customer = jobData.customerName || '';
  const reg      = jobData.reg || '';
  const make     = jobData.make || '';
  const model    = jobData.model || '';

  const msg = `Hi ${customer.split(' ')[0]}, we've inspected your ${make} ${model} (${reg}) and found an issue:\n\nIssue: ${issue}\nEstimated Cost: ${formatCurrency(quoteAmount)}${photoUrl ? `\nPhoto: ${photoUrl}` : ''}\n\nReply YES to approve or call us on ${s.phone||'the garage'}.\n— ${s.garageName||'Your Garage'}`;

  try {
    const ref = await garageRef('approvals').add({
      jobId, customerId: jobData.customerId||'', customerName: customer,
      customerPhone: jobData.customerPhone || '',
      reg, issue, description: issue, quoteAmount, photoUrl: photoUrl||'',
      status: 'pending', sentAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    });

    // Log to comms
    await garageRef('comms_log').add({
      customerId: jobData.customerId||'', jobId,
      type: 'approval_sent', direction: 'outbound',
      content: msg, createdAt: FieldValue.serverTimestamp()
    });

    // Open WhatsApp
    if (jobData.customerPhone) {
      const phone = jobData.customerPhone.replace(/\s/g,'').replace(/^0/,'44');
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    showToast('Approval sent', 'success');
    loadApprovals();
    return ref.id;
  } catch (err) {
    console.error(err);
    showToast('Failed to send approval', 'error');
  }
}

// ——— Approve / Decline ———
window.approveApproval = async (id) => {
  try {
    const doc  = await garageRef('approvals').doc(id).get();
    const a    = doc.data();
    await garageRef('approvals').doc(id).update({
      status: 'approved', responseAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    // Auto-add to invoice if job exists
    if (a.jobId && a.quoteAmount > 0) {
      const jobDoc = await garageDoc('jobs', a.jobId).get();
      if (jobDoc.exists) {
        const parts = jobDoc.data().parts || [];
        parts.push({ name: a.issue, qty: 1, salePrice: a.quoteAmount, costPrice: 0, total: a.quoteAmount });
        await garageDoc('jobs', a.jobId).update({ parts, updatedAt: FieldValue.serverTimestamp() });
        showToast('Approved and added to job card', 'success');
      }
    }
    const idx = allApprovals.findIndex(x => x.id === id);
    if (idx > -1) allApprovals[idx].status = 'approved';
    renderApprovalsList(allApprovals);
  } catch (err) {
    showToast('Failed to approve', 'error');
  }
};

window.declineApproval = async (id) => {
  const reason = prompt('Reason for declining (optional):') || '';
  try {
    await garageRef('approvals').doc(id).update({
      status: 'declined', declinedReason: reason,
      responseAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()
    });
    const idx = allApprovals.findIndex(x => x.id === id);
    if (idx > -1) allApprovals[idx].status = 'declined';
    renderApprovalsList(allApprovals);
    showToast('Approval declined', 'info');
  } catch { showToast('Failed to update', 'error'); }
};

window.resendApproval = async (id) => {
  const a = allApprovals.find(x => x.id === id);
  if (!a) return;
  const s = getSettings();
  const msg = `Hi ${a.customerName?.split(' ')[0]||''}, reminder: we have a quote for your ${a.reg||'vehicle'} — ${a.issue} — ${formatCurrency(a.quoteAmount||0)}. Reply YES to approve or call ${s.phone||'us'}. — ${s.garageName||''}`;
  if (a.customerPhone) {
    const phone = a.customerPhone.replace(/\s/g,'').replace(/^0/,'44');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  } else {
    showToast('No phone number for this customer', 'warning');
  }
};

// ——— Get approvals for a job (used in job modal) ———
export function getApprovalsByJob(jobId) {
  return allApprovals.filter(a => a.jobId === jobId);
}


