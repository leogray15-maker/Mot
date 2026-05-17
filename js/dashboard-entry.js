/* ===========================
   MOT Car Repairs — Dashboard Entry Point
   Imports all modules in dependency order
   =========================== */

// ——— Core infrastructure (must be first) ———
import './dashboard.js';        // auth guard, openSection, trial check, nav

// ——— UI helpers ———
import './ui.js';               // showModal, closeModal, showConfirm, showEmptyState

// ——— Notifications ———
import './notifications.js';    // addNotification, badge

// ——— Settings (loaded early so other modules can call getSettings()) ———
import { initSettings } from './dashboard.js';

// ——— Core CRM modules (self-register via window.sectionLoaders) ———
import './enquiries.js';
import './customers.js';
import './bookings.js';
import { initJobs }         from './jobs.js';
import './invoices.js';
import './revenue.js';

// ——— Workshop tools ———
import { initVrmLookup }    from './vrm-lookup.js';
import { initJobClock }     from './job-clock.js';
import { initApprovals }    from './photo-approval.js';

// ——— VHC ———
import { initVhcSection }   from './vhc.js';

// ——— Opportunities & pipeline ———
import { initOpportunities } from './opportunities.js';

// ——— Fleet & parts ———
import { initFleet }        from './fleet.js';
import { initParts }        from './parts.js';

// ——— MOT, reminders, comms ———
import { initMotTracker }   from './mot-tracker.js';
import { initReminders }    from './reminders-engine.js';
import './comms-log.js';

// ——— Reports & Z-read ———
import { initReports }      from './reports.js';
import { initZRead }        from './z-read.js';

// ——— Multi-user / teams ———
import { initUsers, enforceRoleRestrictions } from './multi-user.js';

// ——— WhatsApp helpers ———
import './whatsapp.js';

// ——— Boot sequence ———
document.addEventListener('DOMContentLoaded', async () => {
  // Settings must be loaded before other modules read them
  await initSettings();

  // Apply role restrictions to sidebar
  enforceRoleRestrictions();

  // Initialise modules that require explicit init
  initJobs();
  initVrmLookup();
  initJobClock();
  initApprovals();
  initVhcSection();
  initOpportunities();
  initFleet();
  initParts();
  initMotTracker();
  initReminders();
  initReports();
  initZRead();
  initUsers();
});
