/* ===========================
   Premier MOT — Auth (Firebase)
   =========================== */

import { auth } from './firebase.js';
// ——— Login page ———
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  // Already logged in — skip to dashboard
  auth.onAuthStateChanged(user => {
    if (user) window.location.href = 'dashboard.html';
  });

  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const email    = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl  = document.getElementById('loginError');
    const errMsg   = errorEl?.querySelector('span');
    const btn      = loginForm.querySelector('.btn-login');

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Signing in…';

    try {
      await auth.signInWithEmailAndPassword(email, password);
      window.location.href = 'dashboard.html';
    } catch (err) {
      const friendly = ['auth/user-not-found','auth/wrong-password','auth/invalid-credential','auth/invalid-email']
        .includes(err.code)
        ? 'Incorrect email or password. Please try again.'
        : 'Sign in failed. Please check your connection and try again.';
      if (errMsg) errMsg.textContent = friendly;
      errorEl?.classList.add('show');
      document.getElementById('loginPassword').value = '';
      document.getElementById('loginPassword').focus();
      setTimeout(() => errorEl?.classList.remove('show'), 5000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Sign In';
    }
  });
}

// ——— Dashboard auth guard ———
// Handled inside dashboard.js via auth.onAuthStateChanged
