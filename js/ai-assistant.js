/* ===========================
   GarageOS — AI Business Assistant
   =========================== */

import { garageRef, docsToArr } from './firebase.js';
import { showToast, formatCurrency, getSettings } from './utils.js';

let conversationHistory = [];
let anthropicApiKey     = '';
let contextData         = {};

export function initAiAssistant() {
  setupAiUI();
  loadApiKey();
}

async function loadApiKey() {
  try {
    const snap = await garageRef('settings').doc('main').get();
    anthropicApiKey = snap.data()?.anthropicApiKey || '';
    if (!anthropicApiKey) {
      document.getElementById('aiMessages')?.querySelector('.ai-welcome p') &&
        (document.getElementById('aiMessages').querySelector('.ai-welcome p').innerHTML =
          'Add your Anthropic API key in <a href="#" onclick="openSection(\'settings\')">Settings → API Keys</a> to enable AI features.');
    }
  } catch {}

  // Restore conversation from session
  const saved = sessionStorage.getItem('aiHistory');
  if (saved) {
    try { conversationHistory = JSON.parse(saved); renderHistory(); } catch {}
  }
}

function setupAiUI() {
  document.getElementById('aiBtn')?.addEventListener('click', togglePanel);
  document.getElementById('closeAiPanel')?.addEventListener('click', closePanel);
  document.getElementById('aiOverlay')?.addEventListener('click', closePanel);
  document.getElementById('aiSendBtn')?.addEventListener('click', sendMessage);
  document.getElementById('aiInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
}

export function togglePanel() {
  const panel   = document.getElementById('aiPanel');
  const overlay = document.getElementById('aiOverlay');
  if (!panel) return;
  const open = panel.classList.toggle('open');
  if (overlay) overlay.style.display = open ? '' : 'none';
  if (open && !anthropicApiKey) {
    showToast('Add your Anthropic API key in Settings → API Keys to use AI', 'warning');
  } else if (open) {
    document.getElementById('aiInput')?.focus();
    if (!conversationHistory.length) loadContextData();
  }
}

function closePanel() {
  document.getElementById('aiPanel')?.classList.remove('open');
  const overlay = document.getElementById('aiOverlay');
  if (overlay) overlay.style.display = 'none';
}

// ——— Load live context ———
async function loadContextData() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [bookingsSnap, enquiriesSnap, invoicesSnap, opportunitiesSnap, partsSnap] = await Promise.all([
      garageRef('bookings').where('date','==',today).get(),
      garageRef('enquiries').where('status','==','new').limit(20).get(),
      garageRef('invoices').where('status','in',['sent','overdue','partially_paid']).get(),
      garageRef('opportunities').where('status','not-in',['won','lost']).limit(50).get(),
      garageRef('parts').get()
    ]);

    const allParts = docsToArr(partsSnap);
    const lowStock = allParts.filter(p => p.stockQty <= (p.reorderLevel||0));
    const unpaidInvoices = docsToArr(invoicesSnap);
    const unpaidTotal    = unpaidInvoices.reduce((s,i) => s+(i.balance||0), 0);
    const pipelineTotal  = docsToArr(opportunitiesSnap).reduce((s,o) => s+(o.value||0), 0);

    contextData = {
      bookingsToday:  docsToArr(bookingsSnap).length,
      newEnquiries:   docsToArr(enquiriesSnap).length,
      unpaidInvoices: unpaidInvoices.length,
      unpaidTotal,
      pipelineTotal,
      lowStockCount:  lowStock.length,
      today:          new Date().toLocaleDateString('en-GB')
    };
  } catch {}
}

// ——— System prompt ———
function buildSystemPrompt() {
  const s = getSettings();
  return `You are an AI business assistant for ${s.garageName || 'this UK independent garage'}. Today's date: ${contextData.today || new Date().toLocaleDateString('en-GB')}.

Current live data:
- Bookings today: ${contextData.bookingsToday ?? '?'}
- New enquiries: ${contextData.newEnquiries ?? '?'}
- Open opportunities: ${formatCurrency(contextData.pipelineTotal ?? 0)} pipeline
- Unpaid invoices: ${formatCurrency(contextData.unpaidTotal ?? 0)} (${contextData.unpaidInvoices ?? '?'} invoices)
- Low stock alerts: ${contextData.lowStockCount ?? '?'}

Instructions: Be concise and practical. Use £ for currency. Dates in DD/MM/YYYY format. Help the owner save time, make more money, and run the garage better. If drafting a WhatsApp message, format it clearly and end with "— ${s.garageName || 'Your Garage'}".`;
}

// ——— Send message ———
async function sendMessage() {
  const input = document.getElementById('aiInput');
  const text  = input?.value?.trim();
  if (!text) return;
  if (!anthropicApiKey) { showToast('Add your Anthropic API key in Settings → API Keys', 'warning'); return; }

  input.value = '';
  addMessageToUI('user', text);

  conversationHistory.push({ role: 'user', content: text });

  const typingId = addTypingIndicator();

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'x-api-key':         anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json'
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system:     buildSystemPrompt(),
        messages:   conversationHistory.slice(-20)
      })
    });

    removeTypingIndicator(typingId);

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data    = await response.json();
    const content = data.content?.[0]?.text || 'No response received.';
    conversationHistory.push({ role: 'assistant', content });
    addMessageToUI('assistant', content);

    // Keep last 20 messages in session
    if (conversationHistory.length > 20) conversationHistory = conversationHistory.slice(-20);
    sessionStorage.setItem('aiHistory', JSON.stringify(conversationHistory));

  } catch (err) {
    removeTypingIndicator(typingId);
    console.error('AI error:', err);
    const errMsg = err.message.includes('401') ? 'Invalid API key. Check Settings → API Keys.' :
                   err.message.includes('429') ? 'Rate limit reached. Please wait a moment.' :
                   'AI request failed. Check your API key and connection.';
    addMessageToUI('error', errMsg);
    showToast(errMsg, 'error');
  }
}

// ——— UI helpers ———
function addMessageToUI(role, content) {
  const container = document.getElementById('aiMessages');
  if (!container) return;

  // Remove welcome message on first real message
  container.querySelector('.ai-welcome')?.remove();

  const div = document.createElement('div');
  div.className = `ai-message ai-message-${role}`;
  const isWhatsApp = role === 'assistant' && (content.includes('Hi ') || content.includes('— ')) && content.length > 50;

  div.innerHTML = `
    <div class="ai-bubble">${formatAiContent(content)}</div>
    <div class="ai-actions">
      <button class="ai-copy" onclick="aiCopyMessage(this)" title="Copy"><i class="fas fa-copy"></i></button>
      ${isWhatsApp ? `<button class="ai-wa" onclick="aiSendWhatsApp(this)" title="Send via WhatsApp"><i class="fab fa-whatsapp"></i> Send via WhatsApp</button>` : ''}
    </div>`;

  div.querySelector('.ai-bubble').dataset.text = content;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return div;
}

function formatAiContent(text) {
  return text
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\n/g,'<br>');
}

function addTypingIndicator() {
  const container = document.getElementById('aiMessages');
  if (!container) return null;
  const id  = 'typing-' + Date.now();
  const div = document.createElement('div');
  div.id    = id;
  div.className = 'ai-message ai-message-assistant';
  div.innerHTML = '<div class="ai-bubble ai-typing"><span></span><span></span><span></span></div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  document.getElementById(id)?.remove();
}

function renderHistory() {
  const container = document.getElementById('aiMessages');
  if (!container) return;
  container.querySelector('.ai-welcome')?.remove();
  conversationHistory.forEach(m => addMessageToUI(m.role, m.content));
}

// ——— Window functions ———
window.aiCopyMessage = (btn) => {
  const text = btn.closest('.ai-message').querySelector('.ai-bubble').dataset.text;
  navigator.clipboard.writeText(text).then(() => { showToast('Copied to clipboard', 'success'); });
};

window.aiSendWhatsApp = (btn) => {
  const text  = btn.closest('.ai-message').querySelector('.ai-bubble').dataset.text;
  const phone = prompt('Enter phone number (e.g. 07712345678):');
  if (!phone) return;
  const p = phone.replace(/\s/g,'').replace(/^0/,'44');
  window.open(`https://wa.me/${p}?text=${encodeURIComponent(text)}`, '_blank');
};

window.clearAiHistory = () => {
  conversationHistory = [];
  sessionStorage.removeItem('aiHistory');
  const container = document.getElementById('aiMessages');
  if (container) {
    container.innerHTML = `<div class="ai-welcome"><i class="fas fa-sparkles ai-welcome-icon"></i><h4>Hi! I'm your GarageOS AI Assistant</h4><p>Ask me anything about your garage — revenue, bookings, customer reminders, or draft WhatsApp messages.</p></div>`;
  }
};
