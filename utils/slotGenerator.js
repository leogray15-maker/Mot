/**
 * Generates time slots for a given date, accounting for:
 *  - opening hours (supports both {open/close} and {start/end} key shapes)
 *  - closed / bank-holiday days
 *  - lunch break
 *  - bay capacity (numberOfBays × existing bookings per slot)
 *
 * @param {string} date            - "YYYY-MM-DD"
 * @param {object} garageSettings  - Firestore garages/{id}/settings/config document
 * @param {Array}  existingBookings - booking docs already on this date
 * @returns {SlotInfo[]}
 *
 * @typedef {object} SlotInfo
 * @property {string}   time        - "HH:MM"
 * @property {boolean}  available   - true if ≥1 bay is free
 * @property {number}   bookedCount - number of confirmed bookings in this slot
 * @property {number[]} freeBays    - bay numbers that are free
 * @property {number[]} bookedBays  - bay numbers already taken
 * @property {number}   capacity    - total number of bays
 */
export function generateAvailableSlots(date, garageSettings = {}, existingBookings = []) {
  const wh           = garageSettings.workingHours || garageSettings.openingHours || {};
  const blockedDates = garageSettings.blockedDates  || [];
  const numberOfBays = garageSettings.numberOfBays  || 3;
  const slotDuration = garageSettings.slotDuration  || 60;  // minutes
  const lunchBreak   = garageSettings.lunchBreak    || null;

  if (blockedDates.includes(date)) return [];

  const d      = new Date(date + 'T12:00:00');
  const LONG   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const SHORT  = ['sun','mon','tue','wed','thu','fri','sat'];
  const idx    = d.getDay();
  const dayConfig = wh[LONG[idx]] || wh[SHORT[idx]] || {};

  // Both {open: false} and {closed: true} mean the garage is shut that day
  if (dayConfig.closed === true || dayConfig.open === false) return [];

  // Resolve open/close time — support either key shape
  const openStr  = (typeof dayConfig.open  === 'string' ? dayConfig.open  : null) || dayConfig.start || '08:00';
  const closeStr = dayConfig.close || dayConfig.end || '18:00';
  if (!openStr || !closeStr) return [];

  const toMin  = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const toTime = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

  const openMin   = toMin(openStr);
  const closeMin  = toMin(closeStr);
  const lunchStart = lunchBreak?.start ? toMin(lunchBreak.start) : null;
  const lunchEnd   = lunchBreak?.end   ? toMin(lunchBreak.end)   : null;

  const slots = [];
  for (let cur = openMin; cur < closeMin; cur += slotDuration) {
    if (lunchStart !== null && cur >= lunchStart && cur < lunchEnd) continue;

    const time         = toTime(cur);
    const slotBookings = existingBookings.filter(b => b.timeSlot === time && b.status !== 'cancelled');
    const bookedBays   = slotBookings.map(b => Number(b.bayNumber)).filter(n => n > 0);
    const allBays      = Array.from({ length: numberOfBays }, (_, i) => i + 1);
    const freeBays     = allBays.filter(b => !bookedBays.includes(b));

    slots.push({
      time,
      available:   freeBays.length > 0,
      bookedCount: slotBookings.length,
      freeBays,
      bookedBays,
      capacity:    numberOfBays,
    });
  }

  return slots;
}

/*
 * Firestore security rules to add for the bookings collection:
 *
 * match /garages/{garageId}/bookings/{bookingId} {
 *   // Authenticated staff of this garage can read/write
 *   allow read, write: if request.auth != null
 *     && get(/databases/$(database)/documents/platform_users/$(request.auth.uid)).data.garageId == garageId;
 *
 *   // Optional: prevent cross-tenant writes via the garageId field
 *   allow create: if request.resource.data.garageId == garageId;
 * }
 *
 * match /garages/{garageId}/settings/{doc} {
 *   allow read: if request.auth != null
 *     && get(/databases/$(database)/documents/platform_users/$(request.auth.uid)).data.garageId == garageId;
 *   allow write: if request.auth != null
 *     && get(/databases/$(database)/documents/platform_users/$(request.auth.uid)).data.role in ['admin','manager'];
 * }
 */
