/* ===========================
   Premier MOT — WhatsApp System
   =========================== */

function buildWAPhone(phone) {
  if (!phone) return '';
  const clean = phone.replace(/[\s\-\(\)\+]/g, '');
  if (clean.startsWith('44')) return clean;
  if (clean.startsWith('0')) return '44' + clean.slice(1);
  return clean;
}

function openWhatsApp(phone, message) {
  const num = buildWAPhone(phone);
  if (!num) { showToast('No phone number found for this customer', 'error'); return; }
  const url = `https://wa.me/${num}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener');
  logWASent(num, message);
}

function logWASent(phone, messageSnippet) {
  const logs = JSON.parse(localStorage.getItem('premier_wa_log') || '[]');
  logs.unshift({ id: Date.now(), phone, snippet: messageSnippet.slice(0, 120), sentAt: new Date().toISOString() });
  if (logs.length > 200) logs.length = 200;
  localStorage.setItem('premier_wa_log', JSON.stringify(logs));
}

function buildMOTReminderMessage(customer) {
  const s = getSettings();
  const firstName = (customer.name || 'there').split(' ')[0];
  const tpl = s.whatsappTemplate ||
    'Hi [FirstName], just a reminder that your MOT is due on [MOTDueDate] for your [Year] [Make] [Model] ([Reg]). You can book online at [SiteURL] or call us on [PhoneNumber]. See you soon — [GarageName]';
  return tpl
    .replace(/\[FirstName\]/g, firstName)
    .replace(/\[MOTDueDate\]/g, formatDate(customer.motDue))
    .replace(/\[Year\]/g, customer.year || '')
    .replace(/\[Make\]/g, customer.make || '')
    .replace(/\[Model\]/g, customer.model || '')
    .replace(/\[Reg\]/g, customer.reg || '')
    .replace(/\[SiteURL\]/g, s.siteURL || 'https://mot-ruby.vercel.app')
    .replace(/\[PhoneNumber\]/g, s.phone || '01234 567890')
    .replace(/\[GarageName\]/g, s.garageName || 'Premier MOT & Service');
}

function buildReviewRequestMessage(customer) {
  const s = getSettings();
  const firstName = (customer.name || 'there').split(' ')[0];
  const tpl = s.reviewTemplate ||
    'Hi [FirstName], thanks for visiting [GarageName] today! If you\'re happy with the service, we\'d really appreciate a Google review — it takes just 30 seconds and helps us loads: [GoogleReviewLink]\nThanks again — [GarageName]';
  return tpl
    .replace(/\[FirstName\]/g, firstName)
    .replace(/\[GarageName\]/g, s.garageName || 'Premier MOT & Service')
    .replace(/\[GoogleReviewLink\]/g, s.googleReviewLink || 'https://g.page/r/your-review-link');
}

function buildBookingConfirmOwnerMessage(booking) {
  const s = getSettings();
  return `📅 New Booking — ${s.garageName || 'Premier MOT'}\n\nRef: ${booking.ref}\nCustomer: ${booking.name}\nPhone: ${booking.phone}\nService: ${booking.service}\nDate: ${booking.date} at ${booking.time}\nVehicle: ${booking.reg || 'Not given'}${booking.make ? ' — ' + booking.make + ' ' + booking.model : ''}\n\nNotes: ${booking.notes || 'None'}`;
}

function buildInvoiceWhatsAppMessage(invoice) {
  const s = getSettings();
  const firstName = (invoice.customerName || 'there').split(' ')[0];
  return `Hi ${firstName}, please find your invoice (${invoice.invoiceNumber}) for ${invoice.service || 'our services'} on ${formatDate(invoice.date)}.\n\nTotal: £${(invoice.total || 0).toFixed(2)}${invoice.vatApplied ? ' (inc. VAT)' : ''}.\n\nPlease transfer to: ${s.bankDetails || 'details to follow'}.\n\nThanks — ${s.garageName || 'Premier MOT & Service'}`;
}

function sendMOTReminderWA(customerId) {
  const customers = getCustomers();
  const c = customers.find(x => x.id === customerId);
  if (!c) return;
  const msg = buildMOTReminderMessage(c);
  openWhatsApp(c.phone, msg);
  const idx = customers.findIndex(x => x.id === customerId);
  if (idx !== -1) {
    if (!customers[idx].reminderLog) customers[idx].reminderLog = [];
    customers[idx].reminderLog.unshift({ type: 'mot_reminder', sentAt: new Date().toISOString(), motDue: c.motDue });
    saveCustomers(customers);
  }
  if (typeof addNotification === 'function') addNotification('mot_reminder', `MOT reminder sent to ${c.name}`, 'mot');
  showToast(`MOT reminder sent to ${c.name.split(' ')[0]} via WhatsApp`, 'success');
}

function promptReviewRequest(customerId) {
  const customers = getCustomers();
  const c = customers.find(x => x.id === customerId);
  if (!c || !c.phone) return;
  const firstName = c.name.split(' ')[0];
  if (!confirm(`Send a Google Review request to ${firstName} via WhatsApp?`)) return;
  const msg = buildReviewRequestMessage(c);
  openWhatsApp(c.phone, msg);
  const idx = customers.findIndex(x => x.id === customerId);
  if (idx !== -1) {
    if (!customers[idx].reminderLog) customers[idx].reminderLog = [];
    customers[idx].reminderLog.unshift({ type: 'review_request', sentAt: new Date().toISOString() });
    saveCustomers(customers);
  }
  if (typeof addNotification === 'function') addNotification('info', `Review request sent to ${c.name}`, 'customers');
  showToast(`Review request sent to ${firstName}`, 'success');
}

function getMOTDueForReminder() {
  const s = getSettings();
  const reminderDays = s.reminderDays || [7, 14, 30];
  const maxDays = Math.max(...reminderDays);
  const customers = getCustomers();
  const now = new Date();
  return customers.filter(c => {
    if (!c.motDue || !c.phone) return false;
    const due = new Date(c.motDue);
    const days = Math.round((due - now) / 86400000);
    return days >= 0 && days <= maxDays;
  }).map(c => {
    const days = Math.round((new Date(c.motDue) - now) / 86400000);
    const lastReminder = (c.reminderLog || []).find(r => r.type === 'mot_reminder');
    const reminderToday = lastReminder && lastReminder.sentAt.startsWith(now.toISOString().split('T')[0]);
    return { ...c, daysLeft: days, reminderSentToday: reminderToday };
  }).sort((a, b) => a.daysLeft - b.daysLeft);
}
