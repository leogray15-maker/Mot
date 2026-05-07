/* ===========================
   Premier MOT — Public Site JS
   =========================== */

import { db } from './firebase.js';
import { showToast, formatDate, esc } from './utils.js';
Object.assign(window, { showToast, formatDate, esc });
// Nav scroll behaviour
const nav = document.querySelector('.nav');
if (nav) {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 30);
  });
}

// Hamburger menu
const hamburger = document.querySelector('.nav-hamburger');
const mobileMenu = document.querySelector('.mobile-menu');
if (hamburger && mobileMenu) {
  hamburger.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
    const spans = hamburger.querySelectorAll('span');
    if (mobileMenu.classList.contains('open')) {
      spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    } else {
      spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    }
  });

  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.remove('open');
      hamburger.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
    }
  });
}

// Set active nav link
const currentPage = window.location.pathname.split('/').pop() || 'index.html';
document.querySelectorAll('.nav-links a, .mobile-menu a').forEach(link => {
  const href = link.getAttribute('href');
  if (href === currentPage || (currentPage === '' && href === 'index.html')) {
    link.classList.add('active');
  }
});

// ===========================
// MODAL
// ===========================

const modalOverlay = document.getElementById('enquiryModal');
const modalForm = document.getElementById('enquiryForm');
const modalSuccess = document.getElementById('enquirySuccess');

function openModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  if (modalForm) modalForm.style.display = '';
  if (modalSuccess) modalSuccess.classList.remove('show');
}

function closeModal() {
  if (!modalOverlay) return;
  modalOverlay.classList.remove('open');
  document.body.style.overflow = '';
  if (modalForm) { modalForm.reset(); modalForm.style.display = ''; }
  if (modalSuccess) modalSuccess.classList.remove('show');
}

// Open triggers
document.querySelectorAll('[data-modal="enquiry"], .open-modal').forEach(btn => {
  btn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
});

// Close triggers
document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
  el.addEventListener('click', (e) => {
    if (e.target === el) closeModal();
  });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// Form submission — save to Firestore
if (modalForm) {
  modalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(modalForm);
    const enquiry = {
      createdAt: new Date().toISOString(),
      date: new Date().toISOString(),
      name: data.get('name'),
      phone: data.get('phone'),
      email: data.get('email'),
      reg: data.get('reg'),
      service: data.get('service'),
      preferredDate: data.get('preferredDate'),
      message: data.get('message'),
      status: 'New',
      source: 'Modal'
    };
    modalForm.style.display = 'none';
    if (modalSuccess) modalSuccess.classList.add('show');
    setTimeout(closeModal, 4000);
    await saveEnquiry(enquiry);
  });
}

// ===========================
// CONTACT FORM (contact.html)
// ===========================

const contactForm = document.getElementById('contactForm');
const contactSuccess = document.getElementById('contactSuccess');
if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(contactForm);
    const enquiry = {
      createdAt: new Date().toISOString(),
      date: new Date().toISOString(),
      name: data.get('name'),
      phone: data.get('phone'),
      email: data.get('email'),
      reg: data.get('reg'),
      service: data.get('service'),
      preferredDate: data.get('preferredDate'),
      message: data.get('message'),
      status: 'New',
      source: 'Contact Form'
    };
    contactForm.style.display = 'none';
    if (contactSuccess) contactSuccess.style.display = 'block';
    await saveEnquiry(enquiry);
  });
}

async function saveEnquiry(enquiry) {
  try {
    await db.collection('enquiries').add(enquiry);
  } catch (e) {
    console.error('Failed to save enquiry', e);
  }
}

// ===========================
// SCROLL ANIMATIONS
// ===========================

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.service-card, .pricing-card, .step-card, .testimonial-card, .service-full-card').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});

// Set min date on date inputs
document.querySelectorAll('input[type="date"]').forEach(input => {
  const today = new Date().toISOString().split('T')[0];
  input.setAttribute('min', today);
});
