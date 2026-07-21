/**
 * Hacettepe AI Club - Contact Form Module
 * Handles modal popup with genie effect, form validation, and mailto submission.
 */

/* =========================================================================
 *  EmailJS Integration (Optional)
 * =========================================================================
 *  To send emails directly from the browser without a backend:
 *
 *  1. Create a free account at https://www.emailjs.com
 *  2. Add an email service (Gmail, Outlook, etc.) and note the SERVICE_ID.
 *  3. Create an email template with variables:
 *       {{from_name}}, {{from_surname}}, {{phone}}, {{from_email}}, {{message}}
 *     Note the TEMPLATE_ID.
 *  4. Go to Account → API Keys and copy your PUBLIC_KEY.
 *  5. Add the EmailJS SDK before this script:
 *       <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
 *  6. Uncomment the sendViaEmailJS() function below and call it instead of
 *     sendViaMailto() inside handleSubmit().
 *
 *  const EMAILJS_SERVICE_ID  = 'YOUR_SERVICE_ID';
 *  const EMAILJS_TEMPLATE_ID = 'YOUR_TEMPLATE_ID';
 *  const EMAILJS_PUBLIC_KEY  = 'YOUR_PUBLIC_KEY';
 *
 *  async function sendViaEmailJS(data) {
 *    try {
 *      emailjs.init(EMAILJS_PUBLIC_KEY);
 *      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
 *        from_name:    data.name,
 *        from_surname: data.surname,
 *        phone:        data.phone,
 *        from_email:   data.email,
 *        message:      data.message,
 *      });
 *      showSuccess('Mesajınız başarıyla gönderildi!');
 *      closeModal();
 *    } catch (err) {
 *      console.error('EmailJS error:', err);
 *      alert('Mesaj gönderilemedi. Lütfen tekrar deneyin.');
 *    }
 *  }
 * ======================================================================= */

const MAILTO_ADDRESS = 'contact@hacettepeaiclub.com';

// ---------------------------------------------------------------------------
//  DOM References
// ---------------------------------------------------------------------------
const contactModal = document.getElementById('contact-modal');
const contactContent = document.getElementById('contact-modal-content');
const contactForm = document.getElementById('contact-form');
const contactClose = document.getElementById('contact-close');
const contactCancel = document.getElementById('contact-cancel');
const contactTriggers = document.querySelectorAll('.contact-trigger');

const fields = {
  name: document.getElementById('contact-name'),
  surname: document.getElementById('contact-surname'),
  phone: document.getElementById('contact-phone'),
  email: document.getElementById('contact-email'),
  message: document.getElementById('contact-message'),
};

// ---------------------------------------------------------------------------
//  Modal Open / Close
// ---------------------------------------------------------------------------

/** Opens the contact modal. */
function openModal() {
  // Show the modal
  contactModal.classList.add('active');
  document.body.classList.add('modal-open');

  // Focus the first input for accessibility
  setTimeout(() => fields.name?.focus(), 250);
}

/** Closes the contact modal. */
function closeModal() {
  contactModal.classList.remove('active');
  document.body.classList.remove('modal-open');
}

// Trigger buttons
contactTriggers.forEach((trigger) => {
  trigger.addEventListener('click', (e) => {
    e.preventDefault();
    openModal();
  });
});

// Close button (X)
contactClose?.addEventListener('click', closeModal);

// İptal (Cancel) button
contactCancel?.addEventListener('click', closeModal);

// Click on overlay (outside the form) to close
contactModal?.addEventListener('click', (e) => {
  if (e.target === contactModal) closeModal();
});

// Escape key to close
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && contactModal?.classList.contains('active')) {
    closeModal();
  }
});

// ---------------------------------------------------------------------------
//  Validation
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates all required fields.
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateForm() {
  const errors = [];

  if (!fields.name?.value.trim()) {
    errors.push('Ad alanı zorunludur.');
  }
  if (!fields.surname?.value.trim()) {
    errors.push('Soyad alanı zorunludur.');
  }
  if (!fields.email?.value.trim()) {
    errors.push('E-posta alanı zorunludur.');
  } else if (!EMAIL_REGEX.test(fields.email.value.trim())) {
    errors.push('Geçerli bir e-posta adresi giriniz.');
  }
  if (!fields.message?.value.trim()) {
    errors.push('Mesaj alanı zorunludur.');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Highlights invalid fields with an error class.
 * @param {string[]} errors
 */
function showFieldErrors(errors) {
  // Reset previous errors
  Object.values(fields).forEach((f) => f?.classList.remove('field-error'));

  if (errors.some((e) => e.includes('Ad'))) fields.name?.classList.add('field-error');
  if (errors.some((e) => e.includes('Soyad'))) fields.surname?.classList.add('field-error');
  if (errors.some((e) => e.includes('posta'))) fields.email?.classList.add('field-error');
  if (errors.some((e) => e.includes('Mesaj'))) fields.message?.classList.add('field-error');
}

// ---------------------------------------------------------------------------
//  Submission
// ---------------------------------------------------------------------------

/**
 * Builds a mailto link and opens it.
 * @param {{ name: string, surname: string, phone: string, email: string, message: string }} data
 */
function sendViaMailto(data) {
  const subject = encodeURIComponent(`İletişim Formu: ${data.name} ${data.surname}`);
  const body = encodeURIComponent(
    `Ad: ${data.name}\nSoyad: ${data.surname}\nTelefon: ${data.phone}\nE-posta: ${data.email}\n\nMesaj:\n${data.message}`
  );

  const mailto = `mailto:${MAILTO_ADDRESS}?subject=${subject}&body=${body}`;
  window.open(mailto, '_blank');
}

/**
 * Displays a brief success toast inside the modal.
 * @param {string} text
 */
function showSuccess(text) {
  // Remove any existing toast
  const existing = contactModal?.querySelector('.contact-toast');
  existing?.remove();

  const toast = document.createElement('div');
  toast.className = 'contact-toast';
  toast.textContent = text;
  contactModal?.querySelector('.modal-content')?.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

/**
 * Main submit handler.
 * @param {SubmitEvent} e
 */
function handleSubmit(e) {
  e.preventDefault();

  const { valid, errors } = validateForm();

  if (!valid) {
    showFieldErrors(errors);
    alert(errors.join('\n'));
    return;
  }

  const data = {
    name: fields.name.value.trim(),
    surname: fields.surname.value.trim(),
    phone: fields.phone?.value.trim() || '-',
    email: fields.email.value.trim(),
    message: fields.message.value.trim(),
  };

  // Use mailto (swap to sendViaEmailJS(data) if EmailJS is configured)
  sendViaMailto(data);
  showSuccess('Mesajınız hazırlandı! E-posta istemciniz açılacak.');

  // Reset form and close after a short delay
  contactForm?.reset();
  Object.values(fields).forEach((f) => f?.classList.remove('field-error'));

  setTimeout(closeModal, 2000);
}

contactForm?.addEventListener('submit', handleSubmit);
