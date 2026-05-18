/**
 * BookingDetailModal — displays a booking's details, allows status update and deletion.
 *
 * Props:
 *   garageId  {string} — tenant key
 *   booking   {object} — Firestore booking document + id field
 *   onClose   {fn}     — called on close / after write
 */
import { useState }    from 'react';
import { createPortal } from 'react-dom';
import { db }           from '../js/firebase.js';

const STATUS_OPTIONS = [
  { value: 'confirmed', label: 'Confirmed', color: '#22c55e' },
  { value: 'pending',   label: 'Pending',   color: '#f59e0b' },
  { value: 'no-show',   label: 'No Show',   color: '#ef4444' },
  { value: 'cancelled', label: 'Cancelled', color: '#6b7280' },
];

/* Small display-only field */
function Field({ label, value, mono }) {
  if (!value && value !== 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: '0.72rem', color: 'var(--text-dim)',
        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 3,
      }}>
        {label}
      </div>
      <div style={{
        color: 'var(--text)', fontSize: '0.875rem',
        fontFamily: mono ? 'monospace' : 'inherit',
      }}>
        {value}
      </div>
    </div>
  );
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return dateStr; }
}

export default function BookingDetailModal({ garageId, booking, onClose }) {
  const [status,        setStatus]        = useState(booking.status || 'pending');
  const [saving,        setSaving]        = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error,         setError]         = useState('');

  const docRef = db.collection(`garages/${garageId}/bookings`).doc(booking.id);

  async function saveStatus() {
    if (status === booking.status) { onClose(); return; }
    setSaving(true);
    setError('');
    try {
      await docRef.update({ status });
      onClose();
    } catch (err) {
      console.error('[BookingDetailModal] update error', err);
      setError('Failed to update status. Try again.');
      setSaving(false);
    }
  }

  async function confirmAndDelete() {
    setDeleting(true);
    setError('');
    try {
      await docRef.delete();
      onClose();
    } catch (err) {
      console.error('[BookingDetailModal] delete error', err);
      setError('Failed to delete booking. Try again.');
      setDeleting(false);
    }
  }

  const statusOpt = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0];

  const modal = (
    <div
      className="modal-overlay"
      style={{ display: 'flex', zIndex: 1002 }}
      onClick={e => { if (e.target === e.currentTarget && !confirmDelete) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Booking Detail"
    >
      <div
        className="modal-panel modal-md animate-slide-up"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        {/* Header */}
        <div className="modal-header">
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="fas fa-calendar-check" style={{ color: 'var(--green)' }} />
            <span>
              {booking.vehicleReg || 'Booking'}
              {booking.customerName ? ` — ${booking.customerName}` : ''}
            </span>
          </h3>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

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

          {/* Current status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20,
            padding: '10px 14px', background: 'rgba(255,255,255,0.04)',
            borderRadius: 8, border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%',
              background: statusOpt.color, display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{ color: statusOpt.color, fontWeight: 600, fontSize: '0.88rem' }}>
              {statusOpt.label}
            </span>
            {booking.serviceType && (
              <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: '0.82rem' }}>
                {booking.serviceType}
              </span>
            )}
          </div>

          {/* Details grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 28px' }}>
            <Field label="Date"         value={formatDate(booking.date)} />
            <Field
              label="Time"
              value={booking.timeSlot
                ? `${booking.timeSlot}${booking.duration ? ` (${booking.duration} min)` : ''}`
                : '—'
              }
            />
            <Field label="Registration" value={booking.vehicleReg} mono />
            <Field label="Bay"          value={booking.bayNumber ? `Bay ${booking.bayNumber}` : null} />
            <Field label="Customer"     value={booking.customerName} />
            <Field label="Phone"        value={booking.customerPhone} />
            <Field label="Technician"   value={booking.technicianId} />
          </div>

          {booking.notes && (
            <div style={{
              marginTop: 4, padding: '10px 14px',
              background: 'rgba(255,255,255,0.03)', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{
                fontSize: '0.72rem', color: 'var(--text-dim)',
                textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4,
              }}>Notes</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
                {booking.notes}
              </div>
            </div>
          )}

          {/* Status picker */}
          <div style={{
            marginTop: 22, paddingTop: 18,
            borderTop: '1px solid rgba(255,255,255,0.07)',
          }}>
            <div style={{
              fontSize: '0.75rem', color: 'var(--text-dim)',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10,
            }}>
              Update Status
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 6,
                    border: `1px solid ${status === opt.value ? opt.color : 'rgba(255,255,255,0.12)'}`,
                    background: status === opt.value ? `${opt.color}22` : 'transparent',
                    color: status === opt.value ? opt.color : 'var(--text-muted)',
                    fontSize: '0.82rem',
                    fontWeight: status === opt.value ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Delete confirmation inline */}
          {confirmDelete && (
            <div style={{
              marginTop: 18, padding: '14px 16px',
              background: 'rgba(239,68,68,0.08)', borderRadius: 8,
              border: '1px solid rgba(239,68,68,0.25)',
            }}>
              <p style={{ margin: '0 0 12px', fontSize: '0.875rem', color: 'var(--text)' }}>
                <i className="fas fa-exclamation-triangle" style={{ color: '#ef4444', marginRight: 6 }} />
                Permanently delete this booking? This cannot be undone.
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={confirmAndDelete}
                  disabled={deleting}
                >
                  {deleting
                    ? <i className="fas fa-circle-notch fa-spin" />
                    : <><i className="fas fa-trash" /> Yes, Delete</>}
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmDelete(false)}
                >
                  Keep Booking
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer" style={{ justifyContent: 'space-between' }}>
          {/* Left: delete trigger */}
          <button
            type="button"
            className="btn-danger"
            onClick={() => setConfirmDelete(true)}
            disabled={confirmDelete || deleting}
          >
            <i className="fas fa-trash" /> Delete
          </button>

          {/* Right: close + save */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={saveStatus}
              disabled={saving}
            >
              {saving
                ? <><i className="fas fa-circle-notch fa-spin" /> Saving…</>
                : <><i className="fas fa-check" /> Save Status</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
