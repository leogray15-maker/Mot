# GarageOS

Multi-tenant SaaS platform for UK independent garages. Each garage gets a fully isolated workspace — bookings, jobs, invoices, customers, VHC reports, parts stock, and more — all under one login.

---

## Architecture

### Multi-tenancy

All garage data lives under a scoped Firestore path:

```
/garages/{garageId}/{collection}/{docId}
```

Every JS module imports `garageRef(path)` and `garageDoc(path, id)` from `firebase.js` — these automatically prefix queries with the authenticated garage's ID. Cross-tenant data access is structurally impossible.

Top-level collections (not scoped):

| Collection | Purpose |
|---|---|
| `/accounts/{garageId}` | Billing, plan, trial, branding |
| `/platform_users/{uid}` | Maps Firebase Auth UID → garageId |
| `/admin_leads` | Super-admin CRM pipeline |

### Authentication Flow

1. User signs up → Firebase Auth user created
2. `crypto.randomUUID()` generates a `garageId`
3. `/accounts/{garageId}` created with `trialEndsAt = now + 14 days`
4. `/platform_users/{uid}` created with `{ garageId }`
5. `/garages/{garageId}/settings/main` seeded with defaults
6. `sessionStorage` stores `garageId`, `plan`, `userRole`
7. Redirect to `dashboard.html`

On every dashboard load, `getGarageId()` reads `sessionStorage` and redirects to `login.html` if missing.

---

## File Structure

```
/
├── index.html            # Public SaaS landing page (pricing, features)
├── signup.html           # 3-step onboarding
├── login.html            # Email/password + role-aware redirect
├── dashboard.html        # Main SPA (all garage CRM sections)
├── admin.html            # Super-admin dashboard (Leo only)
├── portal.html           # Customer self-service portal (?garage=ID)
├── technician.html       # Tablet PIN-login mode for technicians
├── vhc.html              # Public VHC report viewer (?job=ID&garage=ID)
├── booking.html          # Public online booking page (?garage=ID)
│
├── js/
│   ├── firebase.js           # SDK init, garageRef, garageDoc, auth helpers
│   ├── utils.js              # showToast, formatDate, formatCurrency, esc, countdown
│   ├── ui.js                 # showModal, showConfirm, showEmptyState, openSection
│   ├── dashboard-entry.js    # Entry point — imports & boots all modules
│   ├── dashboard.js          # Auth guard, nav, trial banner, plan gates
│   ├── signup.js             # Multi-step signup + Firebase provisioning
│   ├── auth.js               # Login, role-aware redirect, session helpers
│   ├── admin.js              # Super-admin: garage list, MRR, CRM pipeline
│   ├── customers.js          # Customer CRUD, vehicle management, history
│   ├── enquiries.js          # Real-time enquiries feed, convert-to-booking
│   ├── bookings.js           # Booking calendar, CRUD, reminders
│   ├── jobs.js               # Job cards, status workflow, parts linking
│   ├── invoices.js           # Invoice CRUD, PDF, payment recording
│   ├── revenue.js            # Revenue charts (Chart.js), financial KPIs
│   ├── vhc.js                # VHC report builder (dashboard side)
│   ├── technician.js         # Tablet mode: PIN login, job list, VHC submit
│   ├── portal.js             # Customer portal: lookup by email/reg
│   ├── vrm-lookup.js         # DVLA Vehicle Enquiry API integration
│   ├── ai-assistant.js       # Claude AI panel with live garage context
│   ├── photo-approval.js     # Photo approval workflow + WhatsApp send
│   ├── opportunities.js      # Opportunities kanban, pipeline stats
│   ├── parts.js              # Parts catalogue, stock levels, suppliers
│   ├── fleet.js              # Fleet customer management, bulk reminders
│   ├── mot-tracker.js        # MOT due dates, countdown, bulk WhatsApp
│   ├── reminders-engine.js   # MOT/service/booking/birthday reminders
│   ├── job-clock.js          # Tech clock-on/off, labour time tracking
│   ├── z-read.js             # Close-of-day Z-read report
│   ├── reports.js            # 15 report types with CSV export
│   ├── comms-log.js          # Communications timeline across all channels
│   ├── multi-user.js         # Roles, permissions, PIN management
│   ├── notifications.js      # In-app notification bell
│   ├── settings.js           # Garage settings, API keys, branding
│   └── whatsapp.js           # WhatsApp message builders
│
├── css/
│   ├── main.css          # Shared design system (custom properties, components)
│   ├── dashboard.css     # Dashboard layout, sidebar, section styles
│   ├── landing.css       # Public landing page styles
│   ├── portal.css        # Customer portal styles
│   ├── technician.css    # Technician tablet styles
│   ├── vhc-report.css    # Public VHC report viewer styles
│   ├── bookings.css      # Booking calendar styles
│   ├── admin.css         # Super-admin dashboard styles
│   └── animations.css    # Keyframe animations
│
└── firestore.rules       # Multi-tenant security rules
```

---

## Firebase Setup

### 1. Create Project

1. Go to [Firebase Console](https://console.firebase.google.com) → New project
2. Enable **Firestore** (production mode)
3. Enable **Authentication** → Email/Password
4. Enable **Storage**

### 2. Web App Config

In `js/firebase.js`, replace the `firebaseConfig` object with your project's config from **Project Settings → Your apps → Web app**.

### 3. Deploy Firestore Rules

```bash
firebase deploy --only firestore:rules
```

The rules in `firestore.rules` enforce:
- Garage data readable/writable only by users whose `platform_users/{uid}.garageId` matches
- VHC reports publicly readable (for customer portal links)
- `/accounts/{garageId}` writable only by the account owner

### 4. Set Super Admin UID

In `js/firebase.js`, replace `'[SUPER_ADMIN_UID]'` with your Firebase Auth UID:

```js
export const SUPER_ADMIN_UID = 'your-firebase-uid-here';
```

Find your UID in Firebase Console → Authentication → Users.

---

## API Keys

All API keys are stored **per-garage** in Firestore at `/garages/{garageId}/settings/main` and loaded at runtime. They are never hardcoded.

### DVLA Vehicle Enquiry API

Used for automatic number plate lookup (make, model, year, MOT expiry).

1. Apply at [DVLA API Portal](https://developer-portal.driver-vehicle-licensing.api.gov.uk/)
2. Request access to **Vehicle Enquiry Service**
3. Paste the key in **Settings → API Keys → DVLA API Key**

### Anthropic API (AI Assistant)

1. Get a key at [console.anthropic.com](https://console.anthropic.com)
2. Paste in **Settings → API Keys → Anthropic API Key**

The AI assistant calls `claude-sonnet-4-20250514` with live garage context (today's bookings, unpaid invoices, low stock, pipeline value) injected into the system prompt.

---

## Stripe Integration

Pricing page links use placeholder values. Replace them in `index.html` and `signup.html`:

| Placeholder | Replace with |
|---|---|
| `[STRIPE_STARTER_LINK]` | Stripe Payment Link for Starter plan (£49/mo) |
| `[STRIPE_PRO_LINK]` | Stripe Payment Link for Pro plan (£79/mo) |
| `[STRIPE_ENTERPRISE_LINK]` | Stripe Payment Link for Enterprise plan (£129/mo) |

After payment, Stripe webhooks should update `/accounts/{garageId}`:
```json
{ "plan": "pro", "status": "active", "stripeCustomerId": "cus_xxx" }
```

A Cloud Function or webhook handler is required to process Stripe events.

---

## Plans & Feature Gates

| Plan | Price | Users | Features |
|---|---|---|---|
| Starter | £49/mo | 2 | Core CRM, Jobs, Invoices, Customers, MOT Tracker |
| Pro | £79/mo | 5 | + Opportunities, Fleet, AI Assistant, Reports, Reminders |
| Enterprise | £129/mo | Unlimited | All features + VHC, Z-Read, Parts, Photo Approvals |

Features locked to higher plans show a 🔒 badge in the sidebar. Clicking them opens the upgrade modal. Plan gates are enforced in `dashboard.js` via `PLAN_FEATURES`.

---

## Roles & Permissions

| Role | Access |
|---|---|
| Owner | Everything |
| Manager | All except financial reports and settings |
| Technician | Jobs, VHC, Clock-in/out, Approvals |
| Receptionist | Overview, Enquiries, Customers, Bookings, Reminders |

Technicians also have a dedicated **tablet mode** at `/technician.html` with PIN login — no browser session required.

---

## Customer Portal

Each garage gets a shareable link:
```
https://yourdomain.com/portal.html?garage={garageId}
```

Customers can look up their records by email or vehicle registration. They see:
- Vehicle details + MOT countdown
- Service history
- Invoices
- Last 3 VHC reports (with pass/advisory/fail summary)

No login required — lookup is by email or reg plate.

---

## Online Booking

Public booking page:
```
https://yourdomain.com/booking.html?garage={garageId}
```

Customers select a service, date, and time slot from the garage's available hours. Booking is saved to `/garages/{garageId}/bookings` with status `pending` and the garage is notified.

---

## VHC Reports

Technicians complete a 45-item vehicle health check across 8 categories (Brakes, Tyres, Lights, Fluids, Visual, Suspension, Exhaust, Bodywork). Each item is rated:
- ✅ Green — OK
- ⚠️ Amber — Advisory
- 🔴 Red — Fail / Requires attention

Reports are saved to `/garages/{garageId}/vhc_reports` and a shareable link is generated:
```
https://yourdomain.com/vhc.html?job={jobId}&garage={garageId}
```

Reports expire after 90 days. Red items can be promoted directly to the Opportunities pipeline for follow-up quotes.

---

## WhatsApp Integration

GarageOS uses `wa.me` links — no WhatsApp Business API required. Messages open in the user's WhatsApp with pre-filled text. This is used for:

- MOT reminders (30-day, 14-day, 7-day, day-of)
- Booking confirmations and 24h reminders
- Photo approval requests
- Opportunity quotes
- Service reminders (11+ months since last visit)
- Fleet bulk messages
- Invoice payment reminders

---

## Development

```bash
npm install
npm run dev      # Vite dev server
npm run build    # Production build
```

### Environment

No `.env` files needed — all config is either hardcoded (Firebase project config, SUPER_ADMIN_UID) or stored in Firestore per-garage.

---

## Deployment

```bash
npm run build
firebase deploy --only hosting
```

Or deploy the `/dist` folder to any static host (Vercel, Netlify, Cloudflare Pages).

---

## Competitors

GarageOS is built to surpass:
- **Motasoft VGM** — outdated UI, no multi-tenancy
- **MOT Manager** — limited to MOT reminders only
- **TechMan** — expensive, complex, desktop-focused

GarageOS targets independent UK garages (1–10 bays) who need a modern, mobile-friendly, all-in-one platform at an accessible price point.
