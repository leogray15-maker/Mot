/* ===========================
   GarageOS — Firebase (compat v10)
   Multi-tenant foundation layer
   =========================== */

import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';
import 'firebase/compat/auth';

const firebaseConfig = {
  apiKey:            'AIzaSyCarVPgFNyx45yp4aUAjGrHkMvHhVj5So4',
  authDomain:        'prem-mot.firebaseapp.com',
  projectId:         'prem-mot',
  storageBucket:     'prem-mot.firebasestorage.app',
  messagingSenderId: '294550370130',
  appId:             '1:294550370130:web:f20c14f01325da3856ec8b'
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const db   = firebase.firestore();
export const auth = firebase.auth();
export default firebase;

// Expose on window so non-module inline scripts can reach these
window.db   = db;
window.auth = auth;

// ——— Multi-tenancy ———

/**
 * Placeholder UID for the platform super-admin.
 * Replace '[SUPER_ADMIN_UID]' with the real Firebase UID before deploying.
 */
export const SUPER_ADMIN_UID = '[SUPER_ADMIN_UID]';

/**
 * Pages that are allowed to load without a garageId in sessionStorage.
 * Matched against the current pathname's filename (lowercase).
 * The empty string covers the bare root path ('/').
 */
const PUBLIC_PAGES = new Set([
  '',
  'index.html',
  'login.html',
  'signup.html',
  'admin.html',
  'booking.html',
  'vhc.html',
  'portal.html'
]);

/**
 * Reads garageId from sessionStorage.
 * If absent and the current page is not public, redirects to /login.html.
 * Returns the garageId string, or null on public pages without one.
 */
export function getGarageId() {
  const garageId = sessionStorage.getItem('garageId');
  if (garageId) return garageId;

  const page = window.location.pathname.split('/').pop().toLowerCase();
  if (!PUBLIC_PAGES.has(page)) {
    window.location.href = '/login.html';
    return null;
  }

  return null;
}

// ——— Scoped collection / document helpers ———

/**
 * Returns a CollectionReference scoped to the current garage.
 * @param {string} path  Sub-collection path within the garage, e.g. 'jobs'
 * @returns {firebase.firestore.CollectionReference}
 */
export function garageRef(path) {
  const gid = getGarageId();
  if (!gid) throw new Error('No garageId — user is not authenticated to a garage.');
  return db.collection(`garages/${gid}/${path}`);
}

/**
 * Returns a DocumentReference scoped to the current garage.
 * @param {string} path  Sub-collection path within the garage, e.g. 'jobs'
 * @param {string} id    Document ID
 * @returns {firebase.firestore.DocumentReference}
 */
export function garageDoc(path, id) {
  const gid = getGarageId();
  if (!gid) throw new Error('No garageId — user is not authenticated to a garage.');
  return db.collection(`garages/${gid}/${path}`).doc(id);
}

/**
 * Returns a DocumentReference for the current garage's top-level account record.
 * @returns {firebase.firestore.DocumentReference}
 */
export function accountRef() {
  const gid = getGarageId();
  if (!gid) throw new Error('No garageId — user is not authenticated to a garage.');
  return db.collection('accounts').doc(gid);
}

/**
 * Returns a DocumentReference for any platform user by UID.
 * Safe to call without a garageId (used during login / signup flows).
 * @param {string} uid  Firebase Auth UID
 * @returns {firebase.firestore.DocumentReference}
 */
export function platformUserRef(uid) {
  return db.collection('platform_users').doc(uid);
}

// ——— Firestore CRUD helpers ———
// Accept:
//   • A bare collection name string  ('jobs')       → scoped to current garage
//   • A path string with slashes     ('accounts/x') → used as-is
//   • A CollectionReference from garageRef()        → used as-is

function _colRef(col) {
  if (typeof col === 'string') {
    if (col.startsWith('/') || col.includes('/')) {
      return db.collection(col);
    }
    return garageRef(col);
  }
  // Already a CollectionReference
  return col;
}

/**
 * Adds a new document to a collection.
 * @param {string|CollectionReference} col
 * @param {object} data
 * @returns {Promise<string>} The new document ID
 */
export async function fsAdd(col, data) {
  const ref = await _colRef(col).add(data);
  return ref.id;
}

/**
 * Sets (overwrites) a document.
 * @param {string|CollectionReference} col
 * @param {string} id
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function fsSet(col, id, data) {
  return _colRef(col).doc(id).set(data);
}

/**
 * Merges fields into an existing document.
 * @param {string|CollectionReference} col
 * @param {string} id
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function fsUpdate(col, id, data) {
  return _colRef(col).doc(id).update(data);
}

/**
 * Deletes a document.
 * @param {string|CollectionReference} col
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function fsDel(col, id) {
  return _colRef(col).doc(id).delete();
}

// ——— Misc helpers ———

/**
 * Converts a Firestore QuerySnapshot into a plain array of objects,
 * each with an `id` field prepended.
 * @param {firebase.firestore.QuerySnapshot} snapshot
 * @returns {Array<object>}
 */
export function docsToArr(snapshot) {
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ——— Spinner ———

/**
 * Prepends a loading spinner into a container element.
 * No-ops if a spinner is already present.
 * @param {string} containerId
 */
export function showSpinner(containerId) {
  const el = document.getElementById(containerId);
  if (!el || el.querySelector('.fs-spinner')) return;
  const s = document.createElement('div');
  s.className = 'fs-spinner';
  s.setAttribute('aria-live', 'polite');
  s.setAttribute('aria-label', 'Loading');
  s.innerHTML = '<i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i><span>Loading…</span>';
  el.prepend(s);
}

/**
 * Removes the spinner from a container element.
 * @param {string} containerId
 */
export function hideSpinner(containerId) {
  document.getElementById(containerId)?.querySelector('.fs-spinner')?.remove();
}

// ——— Expose helpers on window for non-module scripts ———

window.SUPER_ADMIN_UID  = SUPER_ADMIN_UID;
window.getGarageId      = getGarageId;
window.garageRef        = garageRef;
window.garageDoc        = garageDoc;
window.accountRef       = accountRef;
window.platformUserRef  = platformUserRef;
window.fsAdd            = fsAdd;
window.fsSet            = fsSet;
window.fsUpdate         = fsUpdate;
window.fsDel            = fsDel;
window.docsToArr        = docsToArr;
window.showSpinner      = showSpinner;
window.hideSpinner      = hideSpinner;
