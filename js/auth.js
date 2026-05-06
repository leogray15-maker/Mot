/* ===========================
   Premier MOT — Auth Logic
   =========================== */

const ADMIN_CREDENTIALS_KEY = 'premier_admin_credentials';

function getCredentials() {
  const stored = localStorage.getItem(ADMIN_CREDENTIALS_KEY);
  if (stored) return JSON.parse(stored);
  return { username: 'admin', password: 'premier2024' };
}

function isLoggedIn() {
  return sessionStorage.getItem('premier_session') === 'authenticated';
}

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

function logout() {
  sessionStorage.removeItem('premier_session');
  window.location.href = 'login.html';
}

// Login page logic
const loginForm = document.getElementById('loginForm');
if (loginForm) {
  if (isLoggedIn()) {
    window.location.href = 'dashboard.html';
  }

  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const errorEl = document.getElementById('loginError');
    const creds = getCredentials();

    if (username === creds.username && password === creds.password) {
      sessionStorage.setItem('premier_session', 'authenticated');
      window.location.href = 'dashboard.html';
    } else {
      errorEl.classList.add('show');
      const passwordInput = document.getElementById('password');
      passwordInput.value = '';
      passwordInput.focus();
      setTimeout(() => errorEl.classList.remove('show'), 4000);
    }
  });
}

// Dashboard auth check
if (document.getElementById('dashboardApp')) {
  if (!requireAuth()) {
    // redirected
  } else {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to log out?')) logout();
      });
    }
  }
}
