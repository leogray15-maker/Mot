/**
 * BookingCalendar — FullCalendar timegrid with real-time Firestore
 *
 * Props:
 *   garageId {string} — multi-tenant key, passed from dashboard mount
 *
 * Dashboard integration:
 *   Rendered into #bookingsCalendar by js/booking-calendar-mount.js.
 *   Wires up #newBookingBtn and .view-toggle[data-view] externally.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin   from '@fullcalendar/timegrid';
import dayGridPlugin    from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { db } from '../js/firebase.js';
import '../css/booking-calendar.css';
import NewBookingModal    from './NewBookingModal.jsx';
import BookingDetailModal from './BookingDetailModal.jsx';

const STATUS_COLORS = {
  confirmed: '#22c55e',
  pending:   '#f59e0b',
  'no-show': '#ef4444',
  cancelled: '#6b7280',
};

const VIEW_MAP = {
  month: 'dayGridMonth',
  week:  'timeGridWeek',
  day:   'timeGridDay',
  list:  'timeGridWeek',
};

const DAY_IDX = { sunday:0, monday:1, tuesday:2, wednesday:3, thursday:4, friday:5, saturday:6 };

function isoEnd(date, timeSlot, durationMins) {
  const d = new Date(`${date}T${timeSlot}:00`);
  d.setMinutes(d.getMinutes() + (durationMins || 60));
  return d.toISOString().slice(0, 16);
}

export default function BookingCalendar({ garageId }) {
  const [bookings, setBookings] = useState([]);
  const [settings, setSettings] = useState(() => window._settings || {});
  const [newSlot,     setNewSlot]     = useState(null);   // { date, time }
  const [viewBooking, setViewBooking] = useState(null);   // booking object
  const calRef = useRef(null);

  // ── Real-time bookings ──────────────────────────────────────────────
  useEffect(() => {
    if (!garageId) return;
    const unsub = db
      .collection(`garages/${garageId}/bookings`)
      .onSnapshot(
        snap => setBookings(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
        err  => console.warn('[BookingCalendar] snapshot error', err),
      );
    return unsub;
  }, [garageId]);

  // ── Garage settings ─────────────────────────────────────────────────
  useEffect(() => {
    if (!garageId) return;
    db.collection(`garages/${garageId}/settings`)
      .doc('config')
      .get()
      .then(snap => { if (snap.exists) setSettings(s => ({ ...s, ...snap.data() })); })
      .catch(() => {});
  }, [garageId]);

  // ── Wire up external DOM controls ───────────────────────────────────
  useEffect(() => {
    // "New Booking" button (in dashboard header row)
    const newBtn = document.getElementById('newBookingBtn');
    const handleNew = () => {
      const today = new Date().toISOString().slice(0, 10);
      setNewSlot({ date: today, time: '09:00' });
    };
    newBtn?.addEventListener('click', handleNew);

    // View-toggle buttons (.view-toggle[data-view])
    const toggles = Array.from(document.querySelectorAll('.view-toggle[data-view]'));
    const handleToggle = e => {
      const view = VIEW_MAP[e.currentTarget.dataset.view];
      if (view && calRef.current) {
        calRef.current.getApi().changeView(view);
        toggles.forEach(t => t.classList.toggle('active', t === e.currentTarget));
      }
    };
    toggles.forEach(t => t.addEventListener('click', handleToggle));

    // Custom event for programmatic opening (e.g. overview "New Booking")
    const handleOpen = e => {
      const { date, time } = e.detail || {};
      setNewSlot({
        date: date || new Date().toISOString().slice(0, 10),
        time: time || '09:00',
      });
    };
    window.addEventListener('openNewBooking', handleOpen);

    return () => {
      newBtn?.removeEventListener('click', handleNew);
      toggles.forEach(t => t.removeEventListener('click', handleToggle));
      window.removeEventListener('openNewBooking', handleOpen);
    };
  }, []);

  // ── Map Firestore docs → FullCalendar events ─────────────────────────
  const events = bookings
    .filter(b => b.date && b.timeSlot)
    .map(b => ({
      id:              b.id,
      title:           `${b.vehicleReg || ''} — ${b.customerName || ''}`,
      start:           `${b.date}T${b.timeSlot}:00`,
      end:             isoEnd(b.date, b.timeSlot, b.duration),
      backgroundColor: STATUS_COLORS[b.status] || STATUS_COLORS.pending,
      borderColor:     STATUS_COLORS[b.status] || STATUS_COLORS.pending,
      extendedProps:   b,
    }));

  // ── Handlers ────────────────────────────────────────────────────────
  const handleSelect = useCallback(info => {
    const date = info.startStr.slice(0, 10);
    const time = info.startStr.length >= 16 ? info.startStr.slice(11, 16) : '09:00';
    setNewSlot({ date, time });
  }, []);

  const handleEventClick = useCallback(info => {
    setViewBooking(info.event.extendedProps);
  }, []);

  // ── Business hours from settings ─────────────────────────────────────
  const wh = settings.workingHours || settings.openingHours || {};
  const businessHours = Object.entries(wh)
    .filter(([, d]) => d && d.open !== false && !d.closed)
    .map(([day, d]) => ({
      daysOfWeek: [DAY_IDX[day] ?? DAY_IDX[day.slice(0, 3)] ?? -1].filter(n => n >= 0),
      startTime:  (typeof d.open === 'string' ? d.open : null) || d.start || '08:00',
      endTime:    d.close || d.end || '18:00',
    }))
    .filter(b => b.daysOfWeek.length > 0);

  const slotDurStr = `00:${String(settings.slotDuration || 60).padStart(2, '0')}:00`;

  return (
    <div className="booking-calendar-wrap">
      <FullCalendar
        ref={calRef}
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        headerToolbar={{
          left:   'prev,next today',
          center: 'title',
          right:  'dayGridMonth,timeGridWeek,timeGridDay',
        }}
        events={events}
        selectable
        selectMirror
        select={handleSelect}
        eventClick={handleEventClick}
        businessHours={businessHours.length > 0 ? businessHours : undefined}
        slotMinTime="07:00:00"
        slotMaxTime="20:00:00"
        slotDuration={slotDurStr}
        allDaySlot={false}
        height="auto"
        nowIndicator
        firstDay={1}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        eventContent={arg => {
          const b = arg.event.extendedProps;
          return (
            <div style={{ padding: '2px 5px', overflow: 'hidden', lineHeight: 1.35 }}>
              <div style={{ fontWeight: 700, fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.vehicleReg || '—'}
              </div>
              <div style={{ fontSize: '0.7rem', opacity: 0.88, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {b.customerName || ''}{b.serviceType ? ` · ${b.serviceType}` : ''}
              </div>
              {b.bayNumber && (
                <div style={{ fontSize: '0.68rem', opacity: 0.7 }}>
                  Bay {b.bayNumber}{b.technicianId ? ` · ${b.technicianId}` : ''}
                </div>
              )}
            </div>
          );
        }}
      />

      {newSlot && (
        <NewBookingModal
          garageId={garageId}
          initialDate={newSlot.date}
          initialTime={newSlot.time}
          garageSettings={settings}
          onClose={() => setNewSlot(null)}
        />
      )}

      {viewBooking && (
        <BookingDetailModal
          garageId={garageId}
          booking={viewBooking}
          onClose={() => setViewBooking(null)}
        />
      )}
    </div>
  );
}
