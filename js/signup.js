/* ===========================
   GarageOS — Signup (Multi-Step)
   =========================== */

import firebase, { auth, db, SUPER_ADMIN_UID } from './firebase.js';
import { showToast, esc } from './utils.js';

const FieldValue = firebase.firestore.FieldValue;

let currentStep = 1;
let selectedPlan = 'starter';

const planData = {
  starter:    { label: 'Starter', price: 49 },
  pro:        { label: 'Pro', price: 79 },
  enterprise: { label: 'Enterprise', price: 129 }
};

// ——— DOM ready ———
document.addEventListener('DOMContentLoaded', () => {
  initStepNav();
  initPlanSelection();
  initPasswordToggle();
  initPasswordStrength();
  checkPreselectedPlan();
});

function checkPreselectedPlan() {
  const params = new URLSearchParams(window.location.search);
  const plan = params.get('plan');
  if (plan && planData[plan]) {
    selectPlan(plan);
  }
}

// ——— Plan selection ———
function initPlanSelection() {
  document.querySelectorAll('.plan-radio').forEach(radio => {
    radio.addEventListener('change', () => selectPlan(radio.value));
  });
}

function selectPlan(plan) {
  selectedPlan = plan;
  document.querySelectorAll('.plan-option').forEach(el => {
    el.classList.toggle('selected', el.querySelector('.plan-radio')?.value === plan);
  });
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.textContent = `Start ${planData[plan]?.label || ''} Free Trial →`;
}

// ——— Password toggle ———
function initPasswordToggle() {
  const toggle = document.getElementById('passwordToggle');
  const input  = document.getElementById('password');
  if (!toggle || !input) return;
  toggle.addEventListener('click', () => {
    input.type = input.type === 'password' ? 'text' : 'password';
    toggle.querySelector('i').classList.toggle('fa-eye');
    toggle.querySelector('i').classList.toggle('fa-eye-slash');
  });
}

// ——— Password strength ———
function initPasswordStrength() {
  const input = document.getElementById('password');
  const bar   = document.getElementById('strengthBar');
  const label = document.getElementById('strengthLabel');
  if (!input || !bar) return;

  input.addEventListener('input', () => {
    const val = input.value;
    const score = getPasswordStrength(val);
    const levels = ['', 'Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];
    const colors = ['', '#dc2626', '#f97316', '#eab308', '#22c55e', '#16a34a'];
    bar.style.width = `${score * 20}%`;
    bar.style.background = colors[score];
    if (label) label.textContent = val.length ? levels[score] : '';
  });
}

function getPasswordStrength(p) {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  return Math.min(score, 5);
}

// ——— Step navigation ———
function initStepNav() {
  document.getElementById('step1Next')?.addEventListener('click', () => validateStep1() && goToStep(2));
  document.getElementById('step2Back')?.addEventListener('click', () => goToStep(1));
  document.getElementById('step2Next')?.addEventListener('click', () => validateStep2() && goToStep(3));
  document.getElementById('step3Back')?.addEventListener('click', () => goToStep(2));
  document.getElementById('signupForm')?.addEventListener('submit', handleSignup);
}

function goToStep(step) {
  currentStep = step;
  document.querySelectorAll('.signup-step').forEach((el, i) => {
    el.style.display = i + 1 === step ? '' : 'none';
  });
  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i + 1 === step);
    dot.classList.toggle('done', i + 1 < step);
  });
  if (step === 3) renderSummary();
  window.scrollTo(0, 0);
}

function renderSummary() {
  const garageName = document.getElementById('garageName')?.value || '';
  const plan = planData[selectedPlan];
  const summaryEl = document.getElementById('signupSummary');
  if (!summaryEl) return;
  summaryEl.innerHTML = `
    <div class="summary-item"><span>Garage</span><strong>${esc(garageName)}</strong></div>
    <div class="summary-item"><span>Plan</span><strong>${plan.label} — £${plan.price}/month</strong></div>
    <div class="summary-item"><span>Trial</span><strong>14 days free, no credit card required</strong></div>
  `;
}

// ——— Validation ———
function validateStep1() {
  const fields = ['garageName','ownerName','signupEmail','password'];
  let valid = true;
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const err = document.getElementById(id + 'Error');
    if (!el.value.trim()) {
      if (err) { err.textContent = 'This field is required.'; err.style.display = ''; }
      el.classList.add('input-error');
      valid = false;
    } else {
      if (err) err.style.display = 'none';
      el.classList.remove('input-error');
    }
  });
  const email = document.getElementById('signupEmail')?.value || '';
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const err = document.getElementById('signupEmailError');
    if (err) { err.textContent = 'Enter a valid email address.'; err.style.display = ''; }
    valid = false;
  }
  const pw = document.getElementById('password')?.value || '';
  if (pw && pw.length < 8) {
    const err = document.getElementById('passwordError');
    if (err) { err.textContent = 'Password must be at least 8 characters.'; err.style.display = ''; }
    document.getElementById('password')?.classList.add('input-error');
    valid = false;
  }
  return valid;
}

function validateStep2() {
  const fields = ['addressLine1','town','postcode'];
  let valid = true;
  fields.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const err = document.getElementById(id + 'Error');
    if (!el.value.trim()) {
      if (err) { err.textContent = 'This field is required.'; err.style.display = ''; }
      el.classList.add('input-error');
      valid = false;
    } else {
      if (err) err.style.display = 'none';
      el.classList.remove('input-error');
    }
  });
  return valid;
}

// ——— Signup submission ———
async function handleSignup(e) {
  e.preventDefault();
  const termsChecked = document.getElementById('termsCheck')?.checked;
  if (!termsChecked) { showToast('Please agree to the Terms of Service.', 'warning'); return; }

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> Creating your account…';

  const email       = document.getElementById('signupEmail').value.trim();
  const password    = document.getElementById('password').value;
  const garageName  = document.getElementById('garageName').value.trim();
  const ownerName   = document.getElementById('ownerName').value.trim();
  const phone       = document.getElementById('signupPhone')?.value.trim() || '';
  const addressLine1 = document.getElementById('addressLine1')?.value.trim() || '';
  const town        = document.getElementById('town')?.value.trim() || '';
  const postcode    = document.getElementById('postcode')?.value.trim() || '';
  const garagePhone = document.getElementById('garagePhone')?.value.trim() || '';
  const techCount   = document.getElementById('technicianCount')?.value || '1';
  const motStation  = document.getElementById('motStation')?.value === 'yes';
  const hearAbout   = document.getElementById('hearAbout')?.value || '';

  try {
    // 1. Create Firebase Auth user
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid  = cred.user.uid;

    // 2. Generate garageId
    const garageId = crypto.randomUUID();

    // 3. Trial end date: 14 days from now
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 14);

    // 4. Create /accounts/{garageId}
    await db.collection('accounts').doc(garageId).set({
      garageId,
      garageName,
      ownerName,
      ownerEmail: email,
      ownerUid:   uid,
      phone,
      garagePhone,
      address: { line1: addressLine1, town, postcode },
      plan:    selectedPlan,
      status:  'trial',
      trialEndsAt: firebase.firestore.Timestamp.fromDate(trialEndsAt),
      createdAt:   FieldValue.serverTimestamp(),
      stripeCustomerId:     '',
      stripeSubscriptionId: '',
      currentPeriodEnd:     '',
      motStation,
      technicianCount: parseInt(techCount, 10),
      hearAbout
    });

    // 5. Create /platform_users/{uid}
    await db.collection('platform_users').doc(uid).set({
      garageId,
      role:      'owner',
      name:      ownerName,
      email,
      createdAt: FieldValue.serverTimestamp()
    });

    // 6. Create /garages/{garageId}/settings with defaults
    const defaultSettings = {
      garageName,
      phone: garagePhone || phone,
      email,
      address: `${addressLine1}, ${town}, ${postcode}`,
      googleReviewLink: '',
      siteURL: '',
      labourRate: 65,
      vatRegistered: false,
      vatNumber: '',
      bankDetails: '',
      invoiceTerms: 'Payment due within 14 days.',
      maxBookingsPerSlot: 2,
      blockedDates: [],
      reminderDays: [7, 14, 30],
      dvlaApiKey: '',
      emailjsServiceId: '',
      emailjsTemplateId: '',
      emailjsUserId: '',
      anthropicApiKey: '',
      workingHours: {
        monday:    { open: true,  start: '08:00', end: '18:00' },
        tuesday:   { open: true,  start: '08:00', end: '18:00' },
        wednesday: { open: true,  start: '08:00', end: '18:00' },
        thursday:  { open: true,  start: '08:00', end: '18:00' },
        friday:    { open: true,  start: '08:00', end: '18:00' },
        saturday:  { open: true,  start: '08:00', end: '17:00' },
        sunday:    { open: false, start: '09:00', end: '13:00' }
      },
      whatsappTemplates: {
        mot30day: 'Hi [FirstName], just a reminder that your MOT is due on [MOTDueDate] for your [Year] [Make] [Model] ([Reg]). Book now at [SiteURL] or call [PhoneNumber]. — [GarageName]',
        mot14day: 'Hi [FirstName], your MOT is due in 14 days on [MOTDueDate] for your [Reg]. Don\'t miss it — book at [SiteURL] or call [PhoneNumber]. — [GarageName]',
        mot7day:  'Hi [FirstName], your MOT expires in just 7 days ([MOTDueDate]) for [Reg]. Please book ASAP — [SiteURL] or [PhoneNumber]. — [GarageName]',
        motToday: 'Hi [FirstName], your MOT for [Reg] expires TODAY ([MOTDueDate]). Please contact us immediately on [PhoneNumber]. — [GarageName]',
        bookingConfirm: 'Hi [FirstName], your booking is confirmed for [Date] at [Time] for [Service] on [Reg]. See you then! — [GarageName]',
        bookingReminder24h: 'Hi [FirstName], reminder: you have a [Service] booked tomorrow at [Time] for [Reg]. — [GarageName]',
        jobComplete: 'Hi [FirstName], great news — your [Make] [Model] ([Reg]) is ready for collection. — [GarageName]',
        reviewRequest: 'Hi [FirstName], thanks for choosing [GarageName]! We\'d love a Google review: [GoogleReviewLink] — [GarageName]'
      },
      onboardingComplete: false,
      updatedAt: FieldValue.serverTimestamp()
    };

    await db.collection('garages').doc(garageId).collection('settings').doc('main').set(defaultSettings);

    // 7. Store garageId in sessionStorage
    sessionStorage.setItem('garageId',   garageId);
    sessionStorage.setItem('userRole',   'owner');
    sessionStorage.setItem('userName',   ownerName);
    sessionStorage.setItem('garageName', garageName);
    sessionStorage.setItem('plan',       selectedPlan);
    sessionStorage.setItem('status',     'trial');

    // 8. Redirect to dashboard
    window.location.href = 'dashboard.html';

  } catch (err) {
    console.error(err);
    let msg = 'Sign up failed. Please try again.';
    if (err.code === 'auth/email-already-in-use') msg = 'This email is already registered. Try logging in.';
    else if (err.code === 'auth/weak-password')   msg = 'Password is too weak. Use at least 8 characters.';
    else if (err.code === 'auth/invalid-email')   msg = 'Enter a valid email address.';
    showToast(msg, 'error');
    btn.disabled = false;
    btn.innerHTML = 'Start Your Free Trial →';
  }
}
