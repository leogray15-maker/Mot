/* ===========================
   GarageOS — DVLA VRM Lookup
   =========================== */

import { garageRef } from './firebase.js';
import { showToast, countdown, getSettings, esc } from './utils.js';

let lastLookupTime = 0;

// ——— Init: attach lookup buttons to all VRM fields ———
export function initVrmLookup() {
  document.querySelectorAll('input[data-vrm="true"]').forEach(input => {
    const parent = input.closest('.input-with-btn');
    if (!parent) return;
    const btn = parent.querySelector('button');
    if (btn) {
      btn.addEventListener('click', () => handleLookup(input));
    }
  });

  // Also handle dynamically added fields
  document.addEventListener('click', e => {
    if (e.target.closest('[id$="VrmLookup"], [id*="VrmLookup"]')) {
      const container = e.target.closest('.input-with-btn');
      const input     = container?.querySelector('input[data-vrm="true"]');
      if (input) handleLookup(input);
    }
  });
}

// ——— Handle lookup ———
async function handleLookup(input) {
  const raw = input?.value?.trim();
  if (!raw) { showToast('Enter a registration number first', 'warning'); return; }

  const reg = raw.replace(/\s/g,'').toUpperCase();

  // Rate limit: 1 per 2 seconds
  const now = Date.now();
  if (now - lastLookupTime < 2000) { showToast('Please wait a moment before looking up again', 'warning'); return; }
  lastLookupTime = now;

  const settings = getSettings();
  const apiKey   = settings.dvlaApiKey || '';

  if (!apiKey) {
    // Fallback: open GOV.UK check MOT
    showToast('No DVLA API key set — opening MOT check…', 'info');
    window.open(`https://www.check-mot.service.gov.uk/?registration=${encodeURIComponent(reg)}`, '_blank');
    return;
  }

  // Show loading state
  input.disabled = true;
  const btn = input.closest('.input-with-btn')?.querySelector('button');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>'; }

  try {
    const response = await fetch('https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles', {
      method:  'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ registrationNumber: reg })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const msg = response.status === 404 ? 'Vehicle not found in DVLA records' :
                  response.status === 401 ? 'Invalid DVLA API key — check Settings → API Keys' :
                  `DVLA lookup failed (${response.status})`;
      showToast(msg, 'error');
      return;
    }

    const data = await response.json();
    fillVehicleFields(input, data, reg);
    showToast(`Found: ${data.make || ''} ${data.colour || ''} (${data.yearOfManufacture || ''})`, 'success');

  } catch (err) {
    console.error('VRM lookup error:', err);
    showToast('DVLA lookup failed — check your internet connection', 'error');
  } finally {
    input.disabled = false;
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-search"></i>'; }
  }
}

// ——— Fill fields from DVLA response ———
function fillVehicleFields(regInput, data, reg) {
  const container = regInput.closest('.form-grid, .modal-body, .vehicle-fields') || document;

  // Format the reg
  regInput.value = formatReg(reg);

  const fieldMap = {
    make:      'jobMake,v-make',
    model:     'jobModel,v-model',
    year:      'yearOfManufacture|jobYear,v-year',
    fuel:      'fuelType|jobFuel,v-fuel',
    colour:    'colour|jobColour,v-colour',
    engineCC:  'engineCapacity|jobEngineCC',
    motExpiry: 'motExpiryDate|jobMotExpiry,v-motdue'
  };

  // Mapping DVLA field names to data
  const dvlaMap = {
    make:     data.make || '',
    model:    '', // DVLA API doesn't return model in basic response
    year:     data.yearOfManufacture || '',
    fuel:     data.fuelType || '',
    colour:   data.colour || '',
    engineCC: data.engineCapacity ? String(data.engineCapacity) : '',
    motExpiry: data.motExpiryDate ? data.motExpiryDate.split('T')[0] : ''
  };

  // Fill each field
  Object.entries(dvlaMap).forEach(([key, value]) => {
    if (!value) return;
    // Try multiple field IDs
    const ids = fieldMap[key]?.split(/[|,]/) || [];
    ids.forEach(id => {
      // Check by ID first
      const byId = document.getElementById(id.trim());
      if (byId && !byId.value) { byId.value = value; return; }
      // Then by class within container
      const byClass = container.querySelector(`.${id.trim()}`);
      if (byClass && !byClass.value) byClass.value = value;
    });
  });

  // MOT expiry countdown
  if (dvlaMap.motExpiry) {
    const cd = countdown(dvlaMap.motExpiry);
    const countdownEl = document.getElementById('jobMotCountdown') || document.getElementById('motCountdown');
    if (countdownEl) {
      countdownEl.textContent  = cd.label;
      countdownEl.className    = `mot-countdown mot-countdown-${cd.status}`;
    }
  }
}

// ——— Format reg: AB12CDE → AB12 CDE ———
export function formatReg(reg) {
  const clean = reg.replace(/\s/g,'').toUpperCase();
  // UK format: 2 letters + 2 digits + space + 3 letters (new style)
  if (/^[A-Z]{2}\d{2}[A-Z]{3}$/.test(clean)) {
    return clean.slice(0,4) + ' ' + clean.slice(4);
  }
  return clean;
}

// ——— Expose on window ———
window.initVrmLookup = initVrmLookup;
window.formatReg     = formatReg;
