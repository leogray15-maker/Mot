/* ===========================
   GarageOS — Auth (Multi-Tenant)
   =========================== */

import { auth, db, SUPER_ADMIN_UID } from './firebase.js';
import { showToast } from './utils.js';

// ——— Friendly Firebase error messages ———

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':      'No account found with that email address.',
    'auth/wrong-password':      'Incorrect password. Please try again.',
    'auth/invalid-credential':  'Incorrect email or password. Please try again.',
    'auth/invalid-email':       'Please enter a valid email address.',
    'auth/user-disabled':       'This account has been disabled. Please contact support.',
    'auth/too-many-requests':   'Too many failed attempts. Please wait a few minutes and try again.',
    'auth/network-request-failed': 'Network error. Please check your connection and try again.',
    'auth/email-already-in-use':   'An account with this email already exists.',
    'auth/weak-password':          'Password must be at least 6 characters.'
  };
  return map[code] || 'Sign in failed. Please check your connection and try again.';
}

// ——— Login page ———

const loginForm = document.getElementById('loginForm');
if (loginForm) {
  // If already authenticated, redirect immediately
  auth.onAuthStateChanged(async user => {
    if (!user) return;
    try {
      const snap = await db.collection('platform_users').doc(user.uid).get();
      if (!snap.exists) return; // incomplete setup — stay on login

      if (user.uid === SUPER_ADMIN_UID) {
        window.location.href = 'admin.html';
        return;
      }

      const data = snap.data();
      const garageId = data.garageId;
      if (garageId) {
        sessionStorage.setItem('garageId', garageId);
        window.location.href = 'dashboard.html';
      }
    } catch (e) {
      // Not critical — user can log in manually
      console.warn('onAuthStateChanged pre-check error', e);
    }
  });

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();

    const email    = document.getElementById('loginEmail')?.value.trim()    || '';
    const password = document.getElementById('loginPassword')?.value         || '';
    const errorEl  = document.getElementById('loginError');
    const errMsg   = errorEl?.querySelector('span') || errorEl;
    const btn      = loginForm.querySelector('.btn-login') || loginForm.querySelector('[type="submit"]');

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Signing in…';
    }

    try {
      // 1. Firebase Auth sign-in
      const cred = await auth.signInWithEmailAndPassword(email, password);
      const user = cred.user;

      // 2. Read platform_users document
      const puSnap = await db.collection('platform_users').doc(user.uid).get();
      if (!puSnap.exists) throw new Error('platform_user_missing');

      const puData = puSnap.data();
      const garageId = puData.garageId;
      const role     = puData.role || 'staff';
      const userName = puData.name || user.email?.split('@')[0] || 'User';

      // 3. Read account document for plan / trial status
      let garageName = '';
      let plan       = 'starter';
      let status     = 'trial';

      if (garageId) {
        try {
          const accSnap = await db.collection('accounts').doc(garageId).get();
          if (accSnap.exists) {
            const acc = accSnap.data();
            garageName = acc.garageName || acc.name || '';
            plan       = acc.plan   || 'starter';
            status     = acc.status || 'trial';
          }
        } catch (accErr) {
          console.warn('Could not read account doc', accErr);
        }
      }

      // 4. Store everything in sessionStorage
      if (garageId) sessionStorage.setItem('garageId',   garageId);
      sessionStorage.setItem('userRole',   role);
      sessionStorage.setItem('userName',   userName);
      sessionStorage.setItem('garageName', garageName);
      sessionStorage.setItem('plan',       plan);
      sessionStorage.setItem('planStatus', status);

      // 5. Redirect
      if (user.uid === SUPER_ADMIN_UID) {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'dashboard.html';
      }

    } catch (err) {
      const msg = err.message === 'platform_user_missing'
        ? 'Your account is not set up correctly. Please contact your administrator.'
        : friendlyAuthError(err.code);

      if (errMsg) errMsg.textContent = msg;
      errorEl?.classList.add('show');

      const pwEl = document.getElementById('loginPassword');
      if (pwEl) { pwEl.value = ''; pwEl.focus(); }

      setTimeout(() => errorEl?.classList.remove('show'), 6000);

    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Sign In';
      }
    }
  });
}

// ——— Forgot password ———

const forgotForm = document.getElementById('forgotForm');
const forgotLink = document.getElementById('showForgotForm');
const backToLogin = document.getElementById('backToLogin');
const loginFormWrap   = document.getElementById('loginFormWrap');
const forgotFormWrap  = document.getElementById('forgotFormWrap');

function showForgotSection() {
  if (loginFormWrap)  loginFormWrap.style.display  = 'none';
  if (forgotFormWrap) forgotFormWrap.style.display = '';
}
function showLoginSection() {
  if (loginFormWrap)  loginFormWrap.style.display  = '';
  if (forgotFormWrap) forgotFormWrap.style.display = 'none';
}

forgotLink?.addEventListener('click', e => { e.preventDefault(); showForgotSection(); });
backToLogin?.addEventListener('click', e => { e.preventDefault(); showLoginSection(); });

if (forgotForm) {
  forgotForm.addEventListener('submit', async e => {
    e.preventDefault();
    const emailEl  = document.getElementById('forgotEmail');
    const resultEl = document.getElementById('forgotResult');
    const btn      = forgotForm.querySelector('[type="submit"]');
    const email    = emailEl?.value.trim() || '';

    if (!email) {
      showToast('Please enter your email address.', 'error');
      return;
    }

    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Sending…'; }

    try {
      await auth.sendPasswordResetEmail(email);
      if (resultEl) {
        resultEl.textContent = 'Password reset email sent. Check your inbox (and spam folder).';
        resultEl.className   = 'form-result success';
      }
      showToast('Reset email sent!', 'success');
      forgotForm.reset();
    } catch (err) {
      const msg = err.code === 'auth/user-not-found'
        ? 'No account found with that email address.'
        : friendlyAuthError(err.code);
      if (resultEl) { resultEl.textContent = msg; resultEl.className = 'form-result error'; }
      showToast(msg, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = 'Send Reset Link'; }
    }
  });
}

// ——— Dashboard auth guard ———

/**
 * Verifies the current user is authenticated with a valid garageId.
 * Calls callback(user, userData) on success; redirects to login.html on failure.
 *
 * @param {function(firebase.User, object): void} callback
 */
export function requireAuth(callback) {
  auth.onAuthStateChanged(async user => {
    if (!user) {
      sessionStorage.clear();
      window.location.href = 'login.html';
      return;
    }

    // Ensure garageId is present
    let garageId = sessionStorage.getItem('garageId');

    try {
      const puSnap = await db.collection('platform_users').doc(user.uid).get();
      if (!puSnap.exists) {
        sessionStorage.clear();
        window.location.href = 'login.html';
        return;
      }

      const puData = puSnap.data();

      // Repair sessionStorage if missing (e.g. after tab restore)
      if (!garageId && puData.garageId) {
        garageId = puData.garageId;
        sessionStorage.setItem('garageId', garageId);
      }

      if (!garageId && user.uid !== SUPER_ADMIN_UID) {
        sessionStorage.clear();
        window.location.href = 'login.html';
        return;
      }

      // Super-admin on a non-admin page — redirect
      if (user.uid === SUPER_ADMIN_UID && !window.location.pathname.includes('admin')) {
        window.location.href = 'admin.html';
        return;
      }

      if (typeof callback === 'function') callback(user, puData);

    } catch (err) {
      console.error('requireAuth error', err);
      sessionStorage.clear();
      window.location.href = 'login.html';
    }
  });
}

// ——— Logout ———

function handleLogout(btn) {
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const confirmed = await (
      typeof window.showConfirm === 'function'
        ? window.showConfirm({ title: 'Log out', message: 'Are you sure you want to log out?', confirmText: 'Log out', danger: false })
        : Promise.resolve(confirm('Are you sure you want to log out?'))
    );
    if (!confirmed) return;
    try {
      await auth.signOut();
      sessionStorage.clear();
      window.location.href = 'login.html';
    } catch (err) {
      showToast('Logout failed. Please try again.', 'error');
    }
  });
}

// Wire both dashboard and admin logout buttons
handleLogout(document.getElementById('logoutBtn'));
handleLogout(document.getElementById('adminLogoutBtn'));

// ——— Expose on window for non-module scripts ———
window.requireAuth = requireAuth;
