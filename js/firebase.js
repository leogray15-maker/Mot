/* ===========================
   Premier MOT — Firebase Init
   =========================== */

const firebaseConfig = {
  apiKey: "AIzaSyCarVPgFNyx45yp4aUAjGrHkMvHhVj5So4",
  authDomain: "prem-mot.firebaseapp.com",
  projectId: "prem-mot",
  storageBucket: "prem-mot.firebasestorage.app",
  messagingSenderId: "294550370130",
  appId: "1:294550370130:web:f20c14f01325da3856ec8b"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// ——— Firestore helpers ———

function docsToArr(snapshot) {
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function fsAll(col, ...constraints) {
  let ref = db.collection(col);
  const snap = await ref.get();
  return docsToArr(snap);
}

async function fsAdd(col, data) {
  const ref = await db.collection(col).add(data);
  return ref.id;
}

async function fsSet(col, id, data) {
  return db.collection(col).doc(id).set(data);
}

async function fsUpdate(col, id, data) {
  return db.collection(col).doc(id).update(data);
}

async function fsDel(col, id) {
  return db.collection(col).doc(id).delete();
}

// ——— Loading spinner ———

function showSpinner(containerId) {
  const el = document.getElementById(containerId);
  if (!el || el.querySelector('.fs-spinner')) return;
  const s = document.createElement('div');
  s.className = 'fs-spinner';
  s.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i><span>Loading…</span>';
  el.prepend(s);
}

function hideSpinner(containerId) {
  document.getElementById(containerId)?.querySelector('.fs-spinner')?.remove();
}
