/* Admin account setup — run once to bootstrap MOT Car Repairs */
import { auth, db } from './firebase.js';

const GARAGE_ID   = 'mot-car-repairs-poole';
const GARAGE_NAME = 'MOT Car Repairs';

const form      = document.getElementById('setupForm');
const resultEl  = document.getElementById('setupResult');
const successEl = document.getElementById('setupSuccess');

function showResult(msg, type) {
  if (!resultEl) return;
  resultEl.textContent = msg;
  resultEl.className   = `setup-result ${type}`;
  resultEl.style.display = '';
}

if (form) {
  form.addEventListener('submit', async e => {
    e.preventDefault();

    const email = document.getElementById('adminEmail').value.trim();
    const pass  = document.getElementById('adminPassword').value;
    const btn   = form.querySelector('[type="submit"]');

    if (!email) { showResult('Please enter an email address.', 'error'); return; }
    if (pass.length < 8) { showResult('Password must be at least 8 characters.', 'error'); return; }

    btn.disabled    = true;
    btn.textContent = 'Setting up…';
    resultEl.style.display = 'none';

    try {
      // 1. Create Firebase Auth user
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      const uid  = cred.user.uid;

      // 2. Write platform_users first — the Firestore rule for garages/settings
      //    calls getUserGarageId() which reads this doc, so it must exist first.
      await db.collection('platform_users').doc(uid).set({
        garageId:  GARAGE_ID,
        role:      'admin',
        name:      'Admin',
        email,
        createdAt: new Date().toISOString()
      });

      // 3. Now write accounts + settings (platform_users is committed, rules will pass)
      await Promise.all([
        db.collection('accounts').doc(GARAGE_ID).set({
          garageName: GARAGE_NAME,
          plan:       'enterprise',
          status:     'active',
          ownerUid:   uid,
          createdAt:  new Date().toISOString()
        }),
        db.collection(`garages/${GARAGE_ID}/settings`).doc('config').set({
          garageName:         GARAGE_NAME,
          phone:              '07749 207399',
          address:            '26 Kennington Rd, Poole, Dorset BH17 0GF',
          email:              '',
          labourRate:         65,
          vatRegistered:      false,
          vatNumber:          '',
          maxBookingsPerSlot: 2,
          reminderDays:       [7, 14, 30],
          workingHours: {
            monday:    { open: true,  start: '08:00', end: '18:00' },
            tuesday:   { open: true,  start: '08:00', end: '18:00' },
            wednesday: { open: true,  start: '08:00', end: '18:00' },
            thursday:  { open: true,  start: '08:00', end: '18:00' },
            friday:    { open: true,  start: '08:00', end: '17:30' },
            saturday:  { open: true,  start: '08:00', end: '13:00' },
            sunday:    { open: false, start: '09:00', end: '13:00' }
          },
          blockedDates:     [],
          bankDetails:      '',
          googleReviewLink: '',
          siteURL:          '',
          whatsappTemplate: 'Hi {{name}}, this is a reminder that your {{service}} is due. Please call us on 07749 207399 to book. — MOT Car Repairs',
          reviewTemplate:   "Hi {{name}}, thank you for visiting MOT Car Repairs. We'd love your feedback! {{link}}"
        })
      ]);

      // 4. Sign out — user must log in via login.html
      await auth.signOut();

      form.style.display = 'none';
      if (successEl) successEl.style.display = '';

    } catch (err) {
      console.error('Setup error:', err);
      const msgs = {
        'auth/email-already-in-use': 'An account already exists with that email. Use the login page to sign in.',
        'auth/weak-password':        'Password must be at least 6 characters.',
        'auth/invalid-email':        'Please enter a valid email address.',
        'permission-denied':         'Firestore permission denied — check your security rules are deployed.'
      };
      showResult(msgs[err.code] || err.message || 'Setup failed. Please try again.', 'error');
      btn.disabled    = false;
      btn.textContent = 'Create Admin Account';
    }
  });
}
