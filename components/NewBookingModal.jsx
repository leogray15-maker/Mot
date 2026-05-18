/**
 * NewBookingModal — triggered by clicking an empty calendar slot.
 *
 * Props:
 *   garageId      {string}  — tenant key
 *   initialDate   {string}  — "YYYY-MM-DD" pre-filled from click
 *   initialTime   {string}  — "HH:MM" pre-filled from click
 *   garageSettings {object} — Firestore settings/config doc
 *   onClose       {fn}      — called on cancel or successful save
 */
import { useState, useEffect } from 'react';
import { createPortal }        from 'react-dom';
import { db }                  from '../js/firebase.js';
import { generateAvailableSlots } from '../utils/slotGenerator.js';

const SERVICES = [
  'MOT Test', 'MOT + Service', 'Retest',
  'Full Service', 'Interim Service',
  'Tyres', 'Brakes', 'Diagnostics',
  'Exhaust', 'Suspension', 'Bodywork', 'Other',
];

const STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending',   label: 'Pending'   },
];

const DURATIONS = [30, 45, 60, 90, 120, 180, 240];

async function dvlaLookup(reg, apiKey) {
  const clean = reg.replace(/\s/g, '').toUpperCase();
  if (!apiKey) return null;
  const res = await fetch(
    'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
    {
      method:  'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ registrationNumber: clean }),
    },
  );
  if (!res.ok) return null;
  return res.json();
}

const today = () => new Date().toISOString().slice(0, 10);

export default function NewBookingModal({
  garageId, initialDate, initialTime, prefill, garageSettings, onClose,
}) {
  const numberOfBays    = garageSettings?.numberOfBays  || 3;
  const defaultDuration = garageSettings?.slotDuration  || 60;

  const [form, setForm] = useState({
    vehicleReg:    prefill?.vehicleReg   || '',
    customerName:  prefill?.customerName || '',
    customerPhone: prefill?.phone        || '',
    serviceType:   prefill?.serviceType  || 'MOT Test',
    date:          initialDate           || today(),
    timeSlot:      initialTime           || '09:00',
    duration:      defaultDuration,
    bayNumber:     1,
    technicianId:  '',
    status:        'confirmed',
    notes:         '',
  });

  const [slots,      setSlots]      = useState([]);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState('');
  const [vrmLoading, setVrmLoading] = useState(false);
  const [vrmInfo,    setVrmInfo]    = useState('');

  // Regenerate available slots whenever the date changes
  useEffect(() => {
    if (!form.date || !garageId) { setSlots([]); return; }
    db.collection(`garages/${garageId}/bookings`)
      .where('date', '==', form.date)
      .get()
      .then(snap => {
        const dayBookings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const available   = generateAvailableSlots(form.date, garageSettings, dayBookings);
        setSlots(available);
        // If the pre-filled time isn't in the slot list, shift to first free slot
        if (available.length > 0 && !available.find(s => s.time === form.timeSlot)) {
          const first = available.find(s => s.available);
          if (first) setForm(f => ({ ...f, timeSlot: first.time }));
        }
      })
      .catch(() => setSlots([]));
  }, [form.date, garageId]); // intentionally omit garageSettings (stable across renders)

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  // VRM lookup — tries DVLA API, falls back to GOV.UK check page
  async function handleVrm() {
    const reg = form.vehicleReg.trim();
    if (!reg) return;
    setVrmLoading(true);
    setVrmInfo('');
    try {
      const apiKey = window._settings?.dvlaApiKey || '';
      const data   = await dvlaLookup(reg, apiKey);
      if (data) {
        setVrmInfo(
          [data.make, data.colour, data.yearOfManufacture ? `(${data.yearOfManufacture})` : '']
            .filter(Boolean).join(' '),
        );
      } else {
        // No API key or lookup failed — open GOV.UK check
        window.open(
          `https://www.check-mot.service.gov.uk/?registration=${encodeURIComponent(reg.replace(/\s/g, ''))}`,
          '_blank',
        );
      }
    } catch {
      setVrmInfo('Lookup failed — check connection');
    }
    setVrmLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.vehicleReg || !form.customerName || !form.date || !form.timeSlot) {
      setError('Please fill in all required fields.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await db.collection(`garages/${garageId}/bookings`).add({
        ...form,
        vehicleReg: form.vehicleReg.replace(/\s/g, '').toUpperCase(),
        bayNumber:  Number(form.bayNumber),
        duration:   Number(form.duration),
        garageId,
        createdAt:  new Date(),
      });
      onClose();
    } catch (err) {
      console.error('[NewBookingModal] save error', err);
      setError('Failed to save booking. Please try again.');
    }
    setSaving(false);
  }

  // Bay options for the selected time slot
  const currentSlot  = slots.find(s => s.time === form.timeSlot);
  const availableBays = currentSlot?.freeBays?.length > 0
    ? currentSlot.freeBays
    : Array.from({ length: numberOfBays }, (_, i) => i + 1);

  // ── Modal markup ──────────────────────────────────────────────────────
  const modal = (
    <div
      className="modal-overlay"
      style={{ display: 'flex', zIndex: 1002 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="New Booking"
    >
      <div
        className="modal-panel modal-md animate-slide-up"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header">
          <h3>
            <i className="fas fa-calendar-plus" style={{ marginRight: 8, color: 'var(--red)' }} />
            New Booking
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">

            {/* Error banner */}
            {error && (
              <div style={{
                background: 'rgba(224,32,32,0.1)', border: '1px solid rgba(224,32,32,0.3)',
                borderRadius: 6, padding: '8px 12px', marginBottom: 16,
                color: 'var(--red-light)', fontSize: '0.85rem',
              }}>
                <i className="fas fa-exclamation-circle" style={{ marginRight: 6 }} />{error}
              </div>
            )}

            <div className="form-grid">

              {/* Registration */}
              <div className="form-group">
                <label>Registration <span style={{ color: 'var(--red)' }}>*</span></label>
                <div className="input-with-btn">
                  <input
                    type="text"
                    className="form-input"
                    value={form.vehicleReg}
                    onChange={e => { set('vehicleReg', e.target.value.toUpperCase()); setVrmInfo(''); }}
                    placeholder="AB12 CDE"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-sm btn-secondary"
                    onClick={handleVrm}
                    disabled={vrmLoading}
                    title="DVLA lookup"
                  >
                    {vrmLoading
                      ? <i className="fas fa-circle-notch fa-spin" />
                      : <i className="fas fa-search" />}
                  </button>
                </div>
                {vrmInfo && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    <i className="fas fa-car" style={{ marginRight: 4 }} />{vrmInfo}
                  </div>
                )}
              </div>

              {/* Service type */}
              <div className="form-group">
                <label>Service Type <span style={{ color: 'var(--red)' }}>*</span></label>
                <select
                  className="form-input"
                  value={form.serviceType}
                  onChange={e => set('serviceType', e.target.value)}
                >
                  {SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Customer name */}
              <div className="form-group">
                <label>Customer Name <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  type="text"
                  className="form-input"
                  value={form.customerName}
                  onChange={e => set('customerName', e.target.value)}
                  placeholder="Full name"
                  required
                />
              </div>

              {/* Phone */}
              <div className="form-group">
                <label>Phone</label>
                <input
                  type="tel"
                  className="form-input"
                  value={form.customerPhone}
                  onChange={e => set('customerPhone', e.target.value)}
                  placeholder="07700 900000"
                />
              </div>

              {/* Date */}
              <div className="form-group">
                <label>Date <span style={{ color: 'var(--red)' }}>*</span></label>
                <input
                  type="date"
                  className="form-input"
                  value={form.date}
                  min={today()}
                  onChange={e => set('date', e.target.value)}
                  required
                />
              </div>

              {/* Time slot */}
              <div className="form-group">
                <label>Time <span style={{ color: 'var(--red)' }}>*</span></label>
                {slots.length > 0 ? (
                  <select
                    className="form-input"
                    value={form.timeSlot}
                    onChange={e => set('timeSlot', e.target.value)}
                  >
                    {slots.map(s => (
                      <option key={s.time} value={s.time} disabled={!s.available}>
                        {s.time}
                        {s.available
                          ? ` (${s.freeBays.length} bay${s.freeBays.length !== 1 ? 's' : ''} free)`
                          : ' — Full'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="time"
                    className="form-input"
                    value={form.timeSlot}
                    step={60 * (garageSettings?.slotDuration || 60)}
                    onChange={e => set('timeSlot', e.target.value)}
                    required
                  />
                )}
              </div>

              {/* Duration */}
              <div className="form-group">
                <label>Duration</label>
                <select
                  className="form-input"
                  value={form.duration}
                  onChange={e => set('duration', Number(e.target.value))}
                >
                  {DURATIONS.map(d => (
                    <option key={d} value={d}>
                      {d < 60 ? `${d} min` : `${d / 60}h${d % 60 ? ` ${d % 60}m` : ''}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bay */}
              <div className="form-group">
                <label>Bay Number</label>
                <select
                  className="form-input"
                  value={form.bayNumber}
                  onChange={e => set('bayNumber', Number(e.target.value))}
                >
                  {availableBays.map(b => (
                    <option key={b} value={b}>Bay {b}</option>
                  ))}
                </select>
              </div>

              {/* Technician */}
              <div className="form-group">
                <label>Technician</label>
                <input
                  type="text"
                  className="form-input"
                  value={form.technicianId}
                  onChange={e => set('technicianId', e.target.value)}
                  placeholder="Name or ID"
                />
              </div>

              {/* Status */}
              <div className="form-group">
                <label>Status</label>
                <select
                  className="form-input"
                  value={form.status}
                  onChange={e => set('status', e.target.value)}
                >
                  {STATUS_OPTIONS.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Notes — full width */}
              <div className="form-group form-full">
                <label>Notes</label>
                <textarea
                  className="form-input"
                  rows={2}
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  placeholder="Any additional notes…"
                />
              </div>

            </div>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving
                ? <><i className="fas fa-circle-notch fa-spin" /> Saving…</>
                : <><i className="fas fa-check" /> Save Booking</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
