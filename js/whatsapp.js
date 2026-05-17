/* ===========================
   MOT Car Repairs — WhatsApp System
   =========================== */

import { db, fsUpdate } from './firebase.js';

function buildWAPhone(phone) {
  if (!phone) return '';
  const clean = phone.replace(/[\s\-\(\)\+]/g, '');
  if (clean.startsWith('44')) return clean;
  if (clean.startsWith('0'))  return '44' + clean.slice(1);
  return clean;
}

export function openWhatsApp(phone, message) {
  const num = buildWAPhone(phone);
  if (!num) { showToast('No phone number found for this customer', 'error'); return; }
  window.open(`https://wa.me/${num}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
  // Fire-and-forget WA log
  db.collection('wa_logs').add({ phone: num, snippet: message.slice(0, 120), sentAt: new Date().toISOString() }).catch(() => {});
}

function buildMOTReminderMessage(customer) {
  const s = getSettings();
  const firstName = (customer.name || 'there').split(' ')[0];
  return (s.whatsappTemplate || 'Hi [FirstName], your MOT is due [MOTDueDate] for [Year] [Make] [Model] ([Reg]). Book at [SiteURL] or call [PhoneNumber]. — [GarageName]')
    .replace(/\[FirstName\]/g,  firstName)
    .replace(/\[MOTDueDate\]/g, formatDate(customer.motDue))
    .replace(/\[Year\]/g,       customer.year  || '')
    .replace(/\[Make\]/g,       customer.make  || '')
    .replace(/\[Model\]/g,      customer.model || '')
    .replace(/\[Reg\]/g,        customer.reg   || '')
    .replace(/\[SiteURL\]/g,    s.siteURL      || 'https://mot-ruby.vercel.app')
    .replace(/\[PhoneNumber\]/g,s.phone        || '07749 207399')
    .replace(/\[GarageName\]/g, s.garageName   || 'MOT Car Repairs');
}

function buildReviewRequestMessage(customer) {
  const s = getSettings();
  const firstName = (customer.name || 'there').split(' ')[0];
  return (s.reviewTemplate || 'Hi [FirstName], thanks for visiting [GarageName]! We\'d love a Google review: [GoogleReviewLink] — [GarageName]')
    .replace(/\[FirstName\]/g,       firstName)
    .replace(/\[GarageName\]/g,      s.garageName       || 'MOT Car Repairs')
    .replace(/\[GoogleReviewLink\]/g, s.googleReviewLink || 'https://g.page/r/your-review-link');
}

export function buildInvoiceWhatsAppMessage(invoice) {
  const s = getSettings();
  const firstName = (invoice.customerName || 'there').split(' ')[0];
  return `Hi ${firstName}, please find your invoice (${invoice.invoiceNumber}) for ${invoice.service || 'our services'} on ${formatDate(invoice.date)}.\n\nTotal: £${(invoice.total || 0).toFixed(2)}${invoice.vatApplied ? ' (inc. VAT)' : ''}.\n\nPlease transfer to: ${s.bankDetails || 'details to follow'}.\n\nThanks — ${s.garageName || 'MOT Car Repairs'}`;
}

async function sendMOTReminderWA(customerId) {
  const c = window._customersData.find(x => x.id === customerId)
    || await db.collection('customers').doc(customerId).get().then(d => d.exists ? { id: d.id, ...d.data() } : null);
  if (!c) return;

  const msg = buildMOTReminderMessage(c);
  openWhatsApp(c.phone, msg);

  const log = { type: 'mot_reminder', sentAt: new Date().toISOString(), motDue: c.motDue };
  const updated = [(log), ...(c.reminderLog || [])];
  try {
    await fsUpdate('customers', customerId, { reminderLog: updated });
    const idx = window._customersData.findIndex(x => x.id === customerId);
    if (idx !== -1) window._customersData[idx].reminderLog = updated;
  } catch (e) { /* non-critical */ }

  if (typeof addNotification === 'function') addNotification('mot_reminder', `MOT reminder sent to ${c.name}`, 'mot');
  showToast(`MOT reminder sent to ${c.name.split(' ')[0]} via WhatsApp`, 'success');
}

async function promptReviewRequest(customerId) {
  const c = window._customersData.find(x => x.id === customerId)
    || await db.collection('customers').doc(customerId).get().then(d => d.exists ? { id: d.id, ...d.data() } : null);
  if (!c || !c.phone) return;
  if (!confirm(`Send a Google Review request to ${c.name.split(' ')[0]} via WhatsApp?`)) return;

  const msg = buildReviewRequestMessage(c);
  openWhatsApp(c.phone, msg);

  const log = { type: 'review_request', sentAt: new Date().toISOString() };
  const updated = [log, ...(c.reminderLog || [])];
  try {
    await fsUpdate('customers', customerId, { reminderLog: updated });
    const idx = window._customersData.findIndex(x => x.id === customerId);
    if (idx !== -1) window._customersData[idx].reminderLog = updated;
  } catch (e) { /* non-critical */ }

  if (typeof addNotification === 'function') addNotification('info', `Review request sent to ${c.name}`, 'customers');
  showToast(`Review request sent to ${c.name.split(' ')[0]}`, 'success');
}

function getMOTDueForReminder() {
  const s = getSettings();
  const reminderDays = s.reminderDays || [7, 14, 30];
  const maxDays = Math.max(...reminderDays);
  const now = new Date();
  return window._customersData.filter(c => {
    if (!c.motDue || !c.phone) return false;
    const days = Math.round((new Date(c.motDue) - now) / 86400000);
    return days >= 0 && days <= maxDays;
  }).map(c => {
    const days = Math.round((new Date(c.motDue) - now) / 86400000);
    const lastReminder = (c.reminderLog || []).find(r => r.type === 'mot_reminder');
    const reminderToday = lastReminder && lastReminder.sentAt.startsWith(now.toISOString().split('T')[0]);
    return { ...c, daysLeft: days, reminderSentToday: reminderToday };
  }).sort((a, b) => a.daysLeft - b.daysLeft);
}

Object.assign(window, {
  openWhatsApp, sendMOTReminderWA, promptReviewRequest, getMOTDueForReminder,
  buildMOTReminderMessage, buildReviewRequestMessage, buildInvoiceWhatsAppMessage
});
