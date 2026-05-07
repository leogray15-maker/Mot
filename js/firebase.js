/* ===========================
   Premier MOT — Firebase (npm)
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

// ——— Firestore helpers ———

export function docsToArr(snapshot) {
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function fsAdd(col, data) {
  const ref = await db.collection(col).add(data);
  return ref.id;
}

export async function fsSet(col, id, data) {
  return db.collection(col).doc(id).set(data);
}

export async function fsUpdate(col, id, data) {
  return db.collection(col).doc(id).update(data);
}

export async function fsDel(col, id) {
  return db.collection(col).doc(id).delete();
}

// ——— Spinner ———

export function showSpinner(containerId) {
  const el = document.getElementById(containerId);
  if (!el || el.querySelector('.fs-spinner')) return;
  const s = document.createElement('div');
  s.className = 'fs-spinner';
  s.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Loading…</span>';
  el.prepend(s);
}

export function hideSpinner(containerId) {
  document.getElementById(containerId)?.querySelector('.fs-spinner')?.remove();
}
