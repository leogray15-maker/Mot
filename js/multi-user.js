/* ===========================
   GarageOS — Multi-User Roles & Permissions
   =========================== */

import { garageRef, garageDoc, docsToArr } from './firebase.js';
import firebase from './firebase.js';
import { showToast, formatDate, esc } from './utils.js';
import { showConfirm } from './ui.js';

const FieldValue = firebase.firestore.FieldValue;

const ROLES = {
  owner:        { label: 'Owner', sections: ['all'] },
  manager:      { label: 'Manager', sections: ['overview','enquiries','customers','bookings','jobs','vhc','clock','approvals','opportunities','fleet','invoices','revenue','mot','reminders','users'] },
  technician:   { label: 'Technician', sections: ['jobs','vhc','clock','approvals'] },
  receptionist: { label: 'Receptionist', sections: ['overview','enquiries','customers','bookings','reminders'] }
};

const PLAN_LIMITS = { starter: 2, pro: 5, enterprise: Infinity };

let allUsers = [];

export async function initUsers() {
  await loadUsers();
  setupUsersUI();
}

async function loadUsers() {
  try {
    const snap = await garageRef('users').orderBy('name').get();
    allUsers = docsToArr(snap);
    renderUsersTable(allUsers);
  } catch (err) {
    showToast('Failed to load users', 'error');
  }
}

function setupUsersUI() {
  document.getElementById('inviteUserForm')?.addEventListener('submit', inviteUser);
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTbody');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No team members added yet. Invite your first team member below.</td></tr>';
    return;
  }
  tbody.innerHTML = users.map(u => `<tr>
    <td>${esc(u.name)}</td>
    <td>${esc(u.email)}</td>
    <td><span class="role-badge role-${u.role}">${esc(ROLES[u.role]?.label || u.role)}</span></td>
    <td>${u.pin ? '••••' : '—'} ${u.pin ? `<button class="btn-icon" onclick="clearPin('${u.id}')" title="Clear PIN"><i class="fas fa-times"></i></button>` : `<button class="btn-icon" onclick="setUserPin('${u.id}')" title="Set PIN"><i class="fas fa-key"></i></button>`}</td>
    <td>${u.lastLogin ? formatDate(u.lastLogin) : '—'}</td>
    <td><span class="badge-status badge-${u.status === 'inactive' ? 'secondary' : 'success'}">${u.status === 'inactive' ? 'Inactive' : 'Active'}</span></td>
    <td class="actions-cell">
      ${u.status === 'inactive' ? `<button class="btn-sm btn-success" onclick="reactivateUser('${u.id}')">Activate</button>` : `<button class="btn-sm btn-secondary" onclick="deactivateUser('${u.id}')">Deactivate</button>`}
    </td>
  </tr>`).join('');
}

async function inviteUser(e) {
  e.preventDefault();
  const plan  = sessionStorage.getItem('plan') || 'starter';
  const limit = PLAN_LIMITS[plan] || 2;
  const activeCount = allUsers.filter(u => u.status !== 'inactive').length;

  if (activeCount >= limit) {
    showToast(`Your ${plan} plan allows ${limit} users. Upgrade to add more.`, 'warning');
    return;
  }

  const name  = document.getElementById('inviteName')?.value.trim();
  const email = document.getElementById('inviteEmail')?.value.trim();
  const role  = document.getElementById('inviteRole')?.value;
  if (!name || !email) { showToast('Name and email are required', 'warning'); return; }

  try {
    const ref = await garageRef('users').add({
      name, email, role,
      status:    'active',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    });
    // Also add to invites collection for email flow
    await garageRef('invites').add({ name, email, role, status: 'pending', createdAt: FieldValue.serverTimestamp() });
    allUsers.push({ id: ref.id, name, email, role, status: 'active' });
    renderUsersTable(allUsers);
    document.getElementById('inviteUserForm')?.reset();
    showToast(`${name} added. They can now log in once you share the garage link.`, 'success');
  } catch (err) {
    showToast('Failed to invite user', 'error');
  }
}

window.setUserPin = async (userId) => {
  const pin = prompt('Enter 4-digit PIN for technician tablet mode:');
  if (!pin || !/^\d{4}$/.test(pin)) { showToast('PIN must be exactly 4 digits', 'warning'); return; }
  try {
    // Simple hash (not for security — just to not store plain text)
    const encoder = new TextEncoder();
    const data    = encoder.encode(pin);
    const hash    = await crypto.subtle.digest('SHA-256', data);
    const hashHex = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('');
    await garageDoc('users', userId).update({ pin: hashHex, updatedAt: FieldValue.serverTimestamp() });
    const idx = allUsers.findIndex(u => u.id === userId);
    if (idx > -1) allUsers[idx].pin = hashHex;
    renderUsersTable(allUsers);
    showToast('PIN set', 'success');
  } catch { showToast('Failed to set PIN', 'error'); }
};

window.clearPin = async (userId) => {
  try {
    await garageDoc('users', userId).update({ pin: '', updatedAt: FieldValue.serverTimestamp() });
    const idx = allUsers.findIndex(u => u.id === userId);
    if (idx > -1) allUsers[idx].pin = '';
    renderUsersTable(allUsers);
    showToast('PIN cleared', 'info');
  } catch { showToast('Failed to clear PIN', 'error'); }
};

window.deactivateUser = async (userId) => {
  const ok = await showConfirm({ title: 'Deactivate User', message: 'This user will no longer be able to access the system.', confirmText: 'Deactivate', danger: false });
  if (!ok) return;
  try {
    await garageDoc('users', userId).update({ status: 'inactive', updatedAt: FieldValue.serverTimestamp() });
    const idx = allUsers.findIndex(u => u.id === userId);
    if (idx > -1) allUsers[idx].status = 'inactive';
    renderUsersTable(allUsers);
    showToast('User deactivated', 'info');
  } catch { showToast('Failed to deactivate', 'error'); }
};

window.reactivateUser = async (userId) => {
  try {
    await garageDoc('users', userId).update({ status: 'active', updatedAt: FieldValue.serverTimestamp() });
    const idx = allUsers.findIndex(u => u.id === userId);
    if (idx > -1) allUsers[idx].status = 'active';
    renderUsersTable(allUsers);
    showToast('User reactivated', 'success');
  } catch { showToast('Failed to reactivate', 'error'); }
};

// ——— Permission checks ———
export function checkPermission(section, role) {
  const roleData = ROLES[role];
  if (!roleData) return false;
  return roleData.sections.includes('all') || roleData.sections.includes(section);
}

export function getCurrentUserRole() {
  return sessionStorage.getItem('userRole') || 'owner';
}

export function enforceRoleRestrictions() {
  const role = getCurrentUserRole();
  if (role === 'owner') return; // Owner sees everything

  document.querySelectorAll('.sidebar-link[data-section]').forEach(btn => {
    const section = btn.dataset.section;
    if (!checkPermission(section, role)) {
      btn.style.display = 'none';
    }
  });
}

export async function checkUserLimit() {
  const plan  = sessionStorage.getItem('plan') || 'starter';
  const limit = PLAN_LIMITS[plan] || 2;
  const snap  = await garageRef('users').where('status','==','active').get();
  return { current: snap.size, limit, atLimit: snap.size >= limit };
}
