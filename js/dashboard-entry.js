/* Dashboard entry point — imports all dashboard modules in dependency order */
import './dashboard.js';      // core: navigate, showToast, formatDate, getSettings, auth guard
import './whatsapp.js';       // sendMOTReminderWA, promptReviewRequest (needs _customersData from dashboard)
import './notifications.js';  // addNotification, badge
import './bookings.js';       // viewBookingModal, calendar, onSnapshot listener
import './revenue.js';        // charts
import './jobs.js';           // job cards
import './invoices.js';       // invoices + invoice counter
import './settings.js';       // extended settings forms
