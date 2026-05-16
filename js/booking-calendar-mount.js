/**
 * booking-calendar-mount.js
 *
 * Mounts the React BookingCalendar into #bookingsCalendar and registers
 * it as window.sectionLoaders.bookings so the dashboard's loadSection()
 * picks it up automatically over the legacy bookings.js fallback.
 *
 * Imported from dashboard-entry.js (must come after bookings.js so it
 * wins the window.sectionLoaders.bookings registration).
 */
import { createRoot }  from 'react-dom/client';
import { createElement } from 'react';
import BookingCalendar  from '../components/BookingCalendar.jsx';
import { getGarageId }  from './firebase.js';

let _root = null;

export function mountBookingCalendar() {
  const container = document.getElementById('bookingsCalendar');
  if (!container) {
    console.warn('[booking-calendar-mount] #bookingsCalendar not found');
    return;
  }

  const garageId = getGarageId();
  if (!garageId) {
    console.warn('[booking-calendar-mount] No garageId in session');
    return;
  }

  // React 18 createRoot — reuse root if already mounted (section revisits)
  if (!_root) {
    _root = createRoot(container);
  }
  _root.render(createElement(BookingCalendar, { garageId }));
}

// Register with higher priority than the hardcoded loaders map in dashboard.js
window.sectionLoaders          = window.sectionLoaders || {};
window.sectionLoaders.bookings = mountBookingCalendar;
