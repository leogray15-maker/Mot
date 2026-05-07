/* Public booking page entry point */
import { showToast, formatDate, esc, getSettings, getDefaultSettings } from './utils.js';

// Expose on window for any inline handlers
Object.assign(window, { showToast, formatDate, esc, getSettings });

import './bookings.js';
