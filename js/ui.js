/* ===========================
   GarageOS — UI Toolkit
   =========================== */

import { showToast as _showToast } from './utils.js';

// Re-export showToast so ui.js is self-sufficient for modular use
/**
 * Shows a stacking toast notification (bottom-right, auto-dismiss 3 s).
 * Delegates to utils.showToast.
 * @param {string} msg
 * @param {'success'|'error'|'info'|'warning'} type
 */
export function showToast(msg, type = 'success') {
  _showToast(msg, type);
}

// ——— Modal helpers ———

/**
 * Shows a modal overlay by its element ID.
 * Adds the CSS class 'active', sets aria-hidden=false, and wires backdrop-click to close.
 * @param {string} id
 */
export function showModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('active');
  el.setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
  el.addEventListener('click', _backdropClose);
}

/**
 * Hides a modal overlay by its element ID.
 * Removes 'active', sets aria-hidden=true, unwires the backdrop listener.
 * @param {string} id
 */
export function closeModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('active');
  el.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
  el.removeEventListener('click', _backdropClose);
}

function _backdropClose(e) {
  if (e.target === e.currentTarget) {
    closeModal(e.currentTarget.id);
  }
}

// ——— Confirm dialog ———

let _confirmCounter = 0;

/**
 * Promise-based confirm dialog injected into the DOM.
 * Resolves true on confirm, false on cancel/backdrop/Escape.
 * Calls onConfirm() callback if provided and user confirms.
 *
 * @param {{ title?: string, message: string, confirmText?: string, danger?: boolean, onConfirm?: function }} options
 * @returns {Promise<boolean>}
 */
export function showConfirm({
  title       = 'Are you sure?',
  message,
  confirmText = 'Confirm',
  danger      = false,
  onConfirm
} = {}) {
  return new Promise(resolve => {
    const uid = `confirm-dialog-${++_confirmCounter}`;

    const overlay = document.createElement('div');
    overlay.id        = uid;
    overlay.className = 'modal-overlay confirm-overlay active';
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-labelledby', `${uid}-title`);

    overlay.innerHTML = `
      <div class="modal-panel confirm-panel animate-slide-up" role="document">
        <div class="confirm-header">
          <h3 id="${uid}-title" class="confirm-title">${title}</h3>
        </div>
        <div class="confirm-body">
          <p class="confirm-message">${message}</p>
        </div>
        <div class="confirm-footer">
          <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm">
            ${confirmText}
          </button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    function cleanup(result) {
      overlay.classList.remove('active');
      setTimeout(() => overlay.remove(), 250);
      resolve(result);
      if (result && typeof onConfirm === 'function') onConfirm();
    }

    overlay.addEventListener('click', e => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'confirm')    cleanup(true);
      else if (action === 'cancel') cleanup(false);
      else if (e.target === overlay) cleanup(false); // backdrop click
    });

    // Keyboard: Escape cancels, Enter confirms
    function onKey(e) {
      if (e.key === 'Escape') { cleanup(false); document.removeEventListener('keydown', onKey); }
      if (e.key === 'Enter')  { cleanup(true);  document.removeEventListener('keydown', onKey); }
    }
    document.addEventListener('keydown', onKey);

    // Focus the confirm button for accessibility
    requestAnimationFrame(() => overlay.querySelector('[data-action="confirm"]')?.focus());
  });
}

// ——— Skeleton loaders ———

/**
 * Injects animated skeleton loader rows into a container.
 * @param {string} containerId
 * @param {number} rows  Number of skeleton rows to render (default 3)
 */
export function showSkeleton(containerId, rows = 3) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const skeletonHtml = Array.from({ length: rows }, (_, i) => `
    <div class="skeleton-row" aria-hidden="true" style="animation-delay:${i * 80}ms">
      <div class="skeleton-block" style="width:${30 + (i % 3) * 15}%; height:0.85rem;"></div>
      <div class="skeleton-block" style="width:${50 + (i % 2) * 20}%; height:0.75rem; margin-top:0.35rem;"></div>
    </div>
  `).join('');

  const wrapper = document.createElement('div');
  wrapper.className = 'skeleton-wrapper';
  wrapper.setAttribute('data-skeleton', containerId);
  wrapper.setAttribute('aria-busy', 'true');
  wrapper.setAttribute('aria-label', 'Loading content');
  wrapper.innerHTML = skeletonHtml;
  el.prepend(wrapper);
}

/**
 * Removes the skeleton loader from a container.
 * @param {string} containerId
 */
export function hideSkeleton(containerId) {
  document.querySelector(`[data-skeleton="${containerId}"]`)?.remove();
}

// ——— Empty state ———

/**
 * Renders a branded empty state into a container.
 * Replaces any existing .empty-state element inside the container.
 *
 * @param {string} containerId
 * @param {{
 *   icon?: string,
 *   title?: string,
 *   subtitle?: string,
 *   actionText?: string,
 *   onAction?: function
 * }} options
 */
export function showEmptyState(containerId, {
  icon       = 'fa-inbox',
  title      = 'Nothing here yet',
  subtitle   = '',
  actionText = '',
  onAction
} = {}) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const actionBtn = actionText
    ? `<button type="button" class="btn btn-primary empty-state-action">${actionText}</button>`
    : '';

  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state animate-fade-in';
  wrapper.innerHTML = `
    <div class="empty-state-icon"><i class="fas ${icon}" aria-hidden="true"></i></div>
    <h4 class="empty-state-title">${title}</h4>
    ${subtitle   ? `<p class="empty-state-subtitle">${subtitle}</p>` : ''}
    ${actionBtn}
  `;

  if (actionText && typeof onAction === 'function') {
    wrapper.querySelector('.empty-state-action').addEventListener('click', onAction);
  }

  // Replace any pre-existing empty state before appending
  el.querySelector('.empty-state')?.remove();
  el.appendChild(wrapper);
}

// ——— Badge helper ———

/**
 * Sets the text content of a badge element. Hides the badge when count is 0.
 * Caps display at 99+.
 * @param {string} id     Element ID of the badge span/div
 * @param {number} count
 */
export function updateBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  const n = parseInt(count, 10) || 0;
  el.textContent = n > 99 ? '99+' : String(n);
  el.style.display = n > 0 ? '' : 'none';
  el.setAttribute('aria-label', `${n} notification${n !== 1 ? 's' : ''}`);
}

// ——— Sidebar section switcher ———

/**
 * Switches the active section in a sidebar-driven layout.
 * Expects:
 *   .nav-item[data-section]  — sidebar navigation links
 *   .section[data-section]   — main content panels
 *
 * The active section name is persisted to sessionStorage so it survives
 * soft page refreshes.
 *
 * @param {string} name  The data-section value to activate
 */
export function openSection(name) {
  // Toggle active on sidebar nav links (both .sidebar-link and .nav-item)
  document.querySelectorAll('.sidebar-link[data-section], .nav-item[data-section]').forEach(el => {
    el.classList.toggle('active', el.dataset.section === name);
  });

  // Show matching .section-page (id="page-{name}"), hide all others
  document.querySelectorAll('.section-page').forEach(el => {
    const match = el.id === `page-${name}`;
    el.classList.toggle('active', match);
    el.hidden = !match;
  });

  // Legacy: also handle .section[data-section]
  document.querySelectorAll('.section[data-section]').forEach(el => {
    const match = el.dataset.section === name;
    el.classList.toggle('active', match);
    el.hidden = !match;
  });

  try { sessionStorage.setItem('activeSection', name); } catch (_) {}
}

// ——— Expose on window for non-module scripts ———

window.showToast      = showToast;
window.showModal      = showModal;
window.closeModal     = closeModal;
window.showConfirm    = showConfirm;
window.showSkeleton   = showSkeleton;
window.hideSkeleton   = hideSkeleton;
window.showEmptyState = showEmptyState;
window.updateBadge    = updateBadge;
window.openSection    = openSection;
