/**
 * Hacettepe AI Club - Admin Panel Module (API INTEGRATED)
 *
 * Sorumlulukları:
 *  - Admin girişi / çıkışı
 *  - Tüm dinamik içeriğin API'den çekilip ekrana basılması
 *  - Admin modunda ekleme, DÜZENLEME, silme ve SIRALAMA
 *
 * Not: API_URL app.js içinde tanımlıdır (app.js bu dosyadan önce yüklenir).
 */

'use strict';

// ---------------------------------------------------------------------------
//  Constants & Configuration
// ---------------------------------------------------------------------------
const LS_TOKEN_KEY = 'hacettepe_ai_token';
const LS_ADMIN_STATE = 'hacettepe_ai_admin';

/** Kurucu admin: yalnızca bu hesap diğer adminleri yönetebilir. */
const OWNER_EMAIL = 'hacettepeyapayzeka@gmail.com';

/** Etkinlik tablosunu paylaşan farklı içerik türleri. */
const EVENT_KIND = {
  SLIDER: 'Slider',
  COMPETITION: 'YarismaKarti',
};

/**
 * order_index tüm etkinlikler için tek bir sütun olduğundan, her içerik türüne
 * ayrı bir sayı aralığı veriyoruz. Böylece takvim / slayt / yarışma sıralamaları
 * birbirine karışmaz.
 */
const ORDER_BASE = {
  calendar: 0,
  slider: 10000,
  competition: 20000,
};

/** Sunucunun (routers/uploads.py) kabul ettiği uzantılar ile birebir aynı olmalı. */
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/** Sunucudaki sınırla aynı: 8 MB */
const MAX_IMAGE_SIZE_MB = 8;

const TURKISH_MONTHS = {
  '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
  '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
  '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık',
};

// ---------------------------------------------------------------------------
//  Fetch Interceptor (401 Hatalarını Otomatik Yakalama)
// ---------------------------------------------------------------------------
const originalFetch = window.fetch.bind(window);
window.fetch = async function (...args) {
  const response = await originalFetch(...args);

  // Sunucu 401 (Yetkisiz) dönerse ve admin modundaysak oturumu kapat
  if (response.status === 401 && document.body.classList.contains('admin-mode')) {
    alert('Oturum süreniz doldu. Güvenliğiniz için lütfen tekrar giriş yapın.');
    deactivateAdminMode();
  }
  return response;
};

// ---------------------------------------------------------------------------
//  Utilities
// ---------------------------------------------------------------------------

function escapeHTML(str = '') {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function getToken() {
  return localStorage.getItem(LS_TOKEN_KEY);
}

function isAdmin() {
  return document.body.classList.contains('admin-mode');
}

/** Yetkisiz (public) GET isteği. Hata durumunda boş dizi döner. */
async function apiGet(path) {
  try {
    const res = await fetch(`${API_URL}${path}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error(`API'ye ulaşılamadı (${path}):`, err);
    return [];
  }
}

/**
 * Yetkili istek (POST / PUT / DELETE).
 * Başarısız olursa kullanıcıya anlaşılır bir mesaj gösterir ve false döner.
 */
async function apiSend(method, path, body, errorMessage) {
  try {
    const options = {
      method,
      headers: { Authorization: `Bearer ${getToken()}` },
    };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    const res = await fetch(`${API_URL}${path}`, options);
    if (!res.ok) {
      let detail = '';
      try {
        const payload = await res.json();
        detail = payload.detail || payload.message || '';
      } catch (_) { /* gövde JSON değilse yoksay */ }
      throw new Error(detail || `Sunucu ${res.status} döndü.`);
    }
    return true;
  } catch (error) {
    alert(`${errorMessage}\n${error.message}`);
    return false;
  }
}

/** "2026-07-25T00:00:00" → "25 Temmuz 2026" */
function formatDateForDisplay(dateStr) {
  if (!dateStr) return '-';
  const [y, m, d] = String(dateStr).split('T')[0].split('-');
  if (!y || !m || !d) return escapeHTML(dateStr);
  return `${parseInt(d, 10)} ${TURKISH_MONTHS[m] || ''} ${y}`;
}

/**
 * Çok günlü etkinlikler için okunabilir tarih aralığı üretir.
 * Aynı ay içindeyse "12 – 14 Aralık 2026", değilse iki tarihi de yazar.
 */
function formatDateRange(startStr, endStr) {
  if (!endStr) return formatDateForDisplay(startStr);

  const [sy, sm, sd] = String(startStr).split('T')[0].split('-');
  const [ey, em, ed] = String(endStr).split('T')[0].split('-');

  if (sy === ey && sm === em) {
    return `${parseInt(sd, 10)} – ${parseInt(ed, 10)} ${TURKISH_MONTHS[sm] || ''} ${sy}`;
  }
  if (sy === ey) {
    return `${parseInt(sd, 10)} ${TURKISH_MONTHS[sm] || ''} – ${parseInt(ed, 10)} ${TURKISH_MONTHS[em] || ''} ${sy}`;
  }
  return `${formatDateForDisplay(startStr)} – ${formatDateForDisplay(endStr)}`;
}

/** <input type="date"> için "YYYY-MM-DD" değeri üretir. */
function toDateInputValue(dateStr) {
  if (!dateStr) return '';
  return String(dateStr).split('T')[0];
}

/** "YYYY-MM-DD" → "YYYYMMDD" (Google Takvim formatı) */
function toCompactDate(dateStr) {
  return toDateInputValue(dateStr).replace(/-/g, '');
}

/** Google Takvim bağlantısı. Çok günlü etkinliklerde tüm aralığı kapsar. */
function getGoogleCalendarUrl(name, startStr, endStr, location) {
  const start = toCompactDate(startStr);
  if (!start) return '#';

  // Google'da tüm gün süren etkinliklerde bitiş tarihi dışlayıcıdır: +1 gün eklenir.
  const lastDay = endStr ? new Date(`${toDateInputValue(endStr)}T00:00:00`) : new Date(`${toDateInputValue(startStr)}T00:00:00`);
  lastDay.setDate(lastDay.getDate() + 1);
  const end = `${lastDay.getFullYear()}${String(lastDay.getMonth() + 1).padStart(2, '0')}${String(lastDay.getDate()).padStart(2, '0')}`;

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: name,
    dates: `${start}/${end}`,
    details: `${name} - Hacettepe AI Club`,
    location: location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Başlıktan URL dostu slug üretir (Türkçe karakterler sadeleştirilir). */
function slugify(text) {
  const map = { ı: 'i', İ: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };
  return String(text)
    .replace(/[ıİşŞğĞüÜöÖçÇ]/g, (ch) => map[ch])
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'kayit';
}

// ---------------------------------------------------------------------------
//  Görsel Yükleme
// ---------------------------------------------------------------------------
/**
 * Dosyayı sunucuya göndermeden önce yerel olarak doğrular.
 * @returns {string|null} Hata mesajı, sorun yoksa null
 */
function validateImageFile(file) {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  if (!ALLOWED_IMAGE_EXTENSIONS.includes(ext)) {
    return `"${file.name}" desteklenmiyor.\nİzin verilen formatlar: ${ALLOWED_IMAGE_EXTENSIONS.join(', ')}`;
  }
  if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
    return `Dosya çok büyük (${(file.size / 1024 / 1024).toFixed(1)} MB).\nEn fazla ${MAX_IMAGE_SIZE_MB} MB yükleyebilirsiniz.`;
  }
  if (file.size === 0) {
    return 'Seçilen dosya boş görünüyor.';
  }
  return null;
}

async function uploadImage(file) {
  const localError = validateImageFile(file);
  if (localError) {
    alert(localError);
    return null;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_URL}/uploads/image`, {
      method: 'POST',
      // ÖNEMLİ: FormData'da Content-Type başlığını tarayıcı kendisi ayarlar.
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });

    if (!res.ok) {
      // Sunucunun gerçek hata açıklamasını göster (ör. geçersiz format)
      let detail = `Sunucu ${res.status} döndü.`;
      try {
        const payload = await res.json();
        detail = payload.detail || payload.message || detail;
      } catch (_) { /* gövde JSON değilse yoksay */ }
      throw new Error(detail);
    }

    const data = await res.json();
    // Backend "/static/uploads/resim.png" döner; tam URL'ye çeviriyoruz.
    return API_URL + data.url;
  } catch (error) {
    const message = error.name === 'TypeError'
      ? 'Sunucuya bağlanılamadı. Backend çalışıyor mu?'
      : error.message;
    alert(`Resim yüklenemedi: ${message}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
//  Admin Login Modal & Authentication
// ---------------------------------------------------------------------------
const adminModal = document.getElementById('admin-modal');
const adminLoginForm = document.getElementById('admin-login-form');
const adminClose = document.getElementById('admin-close');
const adminTrigger = document.getElementById('admin-trigger');

function openAdminModal() {
  adminModal?.classList.add('active');
  document.body.classList.add('modal-open');
  document.getElementById('admin-username')?.focus();
  document.getElementById('side-menu-close')?.click();
}

function closeAdminModal() {
  adminModal?.classList.remove('active');
  document.body.classList.remove('modal-open');
}

adminTrigger?.addEventListener('click', (e) => {
  e.preventDefault();
  openAdminModal();
});

adminClose?.addEventListener('click', closeAdminModal);
adminModal?.addEventListener('click', (e) => {
  if (e.target === adminModal) closeAdminModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && adminModal?.classList.contains('active')) {
    closeAdminModal();
  }
});
document.getElementById('admin-logout')?.addEventListener('click', deactivateAdminMode);

async function handleAdminLogin(e) {
  e.preventDefault();

  const usernameInput = document.getElementById('admin-username');
  const passwordInput = document.getElementById('admin-password');

  const formData = new URLSearchParams();
  formData.append('username', usernameInput?.value ?? '');
  formData.append('password', passwordInput?.value ?? '');

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!response.ok) throw new Error('Giriş başarısız');

    const data = await response.json();
    localStorage.setItem(LS_TOKEN_KEY, data.access_token);
    activateAdminMode();
    closeAdminModal();
    e.target.reset();
  } catch (error) {
    alert('Kullanıcı adı, şifre hatalı veya sunucuya ulaşılamıyor.');
    passwordInput?.focus();
  }
}

adminLoginForm?.addEventListener('submit', handleAdminLogin);

/** JWT içindeki e-posta bilgisini okur. */
function getCurrentUserEmail() {
  const token = getToken();
  if (!token) return '';
  try {
    return JSON.parse(atob(token.split('.')[1])).sub || '';
  } catch (e) {
    console.error('Token okunamadı');
    return '';
  }
}

/**
 * Araç çubuğunun gerçek yüksekliğini ölçüp CSS'e bildirir.
 * Mobilde butonlar alt satıra kaydığında header ve yan menünün
 * çubuğun altında kalmasını engeller.
 */
function syncToolbarHeight() {
  const toolbar = document.getElementById('admin-toolbar');
  if (!toolbar || !isAdmin()) {
    document.body.style.removeProperty('--admin-toolbar-h');
    return;
  }
  document.body.style.setProperty('--admin-toolbar-h', `${toolbar.offsetHeight}px`);
}

window.addEventListener('resize', syncToolbarHeight, { passive: true });

function activateAdminMode() {
  document.body.classList.add('admin-mode');
  localStorage.setItem(LS_ADMIN_STATE, 'true');

  const toolbar = document.getElementById('admin-toolbar');
  if (toolbar) toolbar.style.display = 'block';

  injectToolbarButtons();
  syncToolbarHeight();
  loadAndRenderAll();
}

function deactivateAdminMode() {
  document.body.classList.remove('admin-mode');
  localStorage.removeItem(LS_ADMIN_STATE);
  localStorage.removeItem(LS_TOKEN_KEY);

  const toolbar = document.getElementById('admin-toolbar');
  if (toolbar) toolbar.style.display = 'none';

  // Araç çubuğuna sonradan eklenmiş butonları temizle
  ['admin-show-newsletter-btn', 'admin-add-admin-btn', 'admin-manage-btn']
    .forEach(id => document.getElementById(id)?.remove());
  document.querySelectorAll('.admin-modal-form').forEach(f => f.remove());
  syncToolbarHeight();

  loadAndRenderAll();
}

/** Araç çubuğundaki yönetim butonlarını ekler. */
function injectToolbarButtons() {
  const toolbarInner = document.querySelector('.admin-toolbar-inner');
  const logoutBtn = document.getElementById('admin-logout');
  if (!toolbarInner || !logoutBtn) return;

  const addButton = (id, icon, label, handler) => {
    if (document.getElementById(id)) return;
    const btn = document.createElement('button');
    btn.id = id;
    btn.className = 'btn-primary';
    btn.style.cssText = 'margin-left: 12px; padding: 5px 15px;';
    btn.innerHTML = `<i class="fa-solid ${icon}"></i> ${label}`;
    btn.addEventListener('click', handler);
    toolbarInner.insertBefore(btn, logoutBtn);
  };

  addButton('admin-show-newsletter-btn', 'fa-list', 'Aboneler', openNewsletterListModal);

  // Yalnızca kurucu admin diğer adminleri yönetebilir
  if (getCurrentUserEmail() === OWNER_EMAIL) {
    addButton('admin-add-admin-btn', 'fa-user-plus', 'Yeni Admin', openAddAdminForm);
    addButton('admin-manage-btn', 'fa-users-gear', 'Adminleri Yönet', openAdminListForm);
  }
}

// ---------------------------------------------------------------------------
//  Generic Admin Form Builder
// ---------------------------------------------------------------------------
/**
 * Ekleme ve düzenleme için ortak modal form.
 * Aynı alan tanımı hem "Ekle" hem "Düzenle" için kullanılır; böylece iki
 * ekranın birbirinden ayrışması (ve unutulan alanlar) mümkün olmaz.
 *
 * @param {object}   config
 * @param {string}   config.title    Modal başlığı
 * @param {string}   config.icon     Font Awesome ikon sınıfı
 * @param {Array}    config.fields   Alan tanımları
 * @param {object}   config.values   Düzenleme modunda mevcut değerler
 * @param {Function} config.onSubmit Doğrulanmış değerlerle çağrılır
 */
function openAdminForm({ title, icon = 'fa-pen-to-square', fields, values = {}, onSubmit }) {
  // Aynı anda tek form açık kalsın
  document.querySelectorAll('.admin-modal-form').forEach(f => f.remove());

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-form';

  const fieldHtml = fields.map((field) => {
    const value = values[field.name] ?? field.default ?? '';
    const required = field.required ? ' *' : '';
    const hint = field.hint ? `<small class="admin-form-hint">${escapeHTML(field.hint)}</small>` : '';

    switch (field.type) {
      case 'textarea':
        return `<label>${escapeHTML(field.label)}${required}
          <textarea data-field="${field.name}" rows="${field.rows || 3}" placeholder="${escapeHTML(field.placeholder || '')}">${escapeHTML(value)}</textarea>${hint}</label>`;

      case 'select': {
        const options = field.options.map(opt =>
          `<option value="${escapeHTML(opt)}" ${String(value) === String(opt) ? 'selected' : ''}>${escapeHTML(opt)}</option>`
        ).join('');
        return `<label>${escapeHTML(field.label)}${required}
          <select data-field="${field.name}">${options}</select>${hint}</label>`;
      }

      case 'image':
        return `<div class="admin-upload-box">
            <label style="color: var(--glow);">${escapeHTML(field.label)}${required} (Bilgisayardan)
              <input type="file" data-file="${field.name}" accept="${ALLOWED_IMAGE_EXTENSIONS.join(',')}" />
            </label>
            <div class="admin-upload-or">VEYA</div>
            <label>Görsel URL ${field.allowIcon ? '/ İkon' : ''}
              <input type="text" data-field="${field.name}" value="${escapeHTML(value)}" placeholder="${escapeHTML(field.placeholder || 'https://...')}" />
            </label>
            <div class="admin-upload-preview" data-preview="${field.name}">
              ${value && !value.startsWith('fa-') ? `<img src="${escapeHTML(value)}" alt="">` : ''}
              <span data-preview-label="${field.name}">${value ? 'Mevcut görsel' : ''}</span>
            </div>${hint}
          </div>`;

      case 'date':
        return `<label>${escapeHTML(field.label)}${required}
          <input type="date" data-field="${field.name}" value="${escapeHTML(toDateInputValue(value))}" />${hint}</label>`;

      default:
        return `<label>${escapeHTML(field.label)}${required}
          <input type="text" data-field="${field.name}" value="${escapeHTML(value)}" placeholder="${escapeHTML(field.placeholder || '')}" />${hint}</label>`;
    }
  }).join('');

  overlay.innerHTML = `
    <div class="admin-inline-form">
      <h4><i class="fa-solid ${icon}"></i> ${escapeHTML(title)}</h4>
      ${fieldHtml}
      <div class="admin-form-actions">
        <button type="button" class="admin-btn" data-action="submit">Kaydet</button>
        <button type="button" class="admin-btn admin-btn--secondary" data-action="cancel">İptal</button>
      </div>
    </div>
  `;

  const close = () => overlay.remove();

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', close);

  /** İlgili resim alanında bilgisayardan dosya seçilmiş mi? */
  const pickedFile = (name) => {
    const input = overlay.querySelector(`[data-file="${name}"]`);
    return input?.files?.length ? input.files[0] : null;
  };

  // Dosya seçilince anında önizleme ve dosya adı gösterilir
  fields.filter(f => f.type === 'image').forEach((field) => {
    const fileInput = overlay.querySelector(`[data-file="${field.name}"]`);
    const preview = overlay.querySelector(`[data-preview="${field.name}"]`);
    const label = overlay.querySelector(`[data-preview-label="${field.name}"]`);

    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      preview.querySelector('img')?.remove();

      if (!file) {
        label.textContent = '';
        return;
      }

      const error = validateImageFile(file);
      if (error) {
        alert(error);
        fileInput.value = '';
        label.textContent = '';
        return;
      }

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.alt = '';
      img.onload = () => URL.revokeObjectURL(img.src);
      preview.prepend(img);
      label.textContent = `${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
    });
  });

  const submitBtn = overlay.querySelector('[data-action="submit"]');
  submitBtn.addEventListener('click', async () => {
    const data = {};

    for (const field of fields) {
      const input = overlay.querySelector(`[data-field="${field.name}"]`);
      data[field.name] = input ? input.value.trim() : '';
    }

    // Zorunlu alan kontrolü.
    // DİKKAT: Resim alanlarında değer ya URL kutusundan ya da seçilen dosyadan gelir.
    // Dosya yüklemesi bu kontrolden SONRA yapıldığı için, seçili dosyayı da
    // "dolu" saymazsak dosya seçen kullanıcıya haksız yere uyarı çıkar.
    const missing = fields.filter((f) => {
      if (!f.required) return false;
      if (f.type === 'image') return !data[f.name] && !pickedFile(f.name);
      return !data[f.name];
    });

    if (missing.length > 0) {
      alert(`Lütfen şu alanları doldurun:\n• ${missing.map(f => f.label).join('\n• ')}`);
      return;
    }

    submitBtn.disabled = true;
    const originalLabel = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kaydediliyor...';

    // Seçilen dosyalar yüklenir ve ilgili alana yazılır.
    // Dosya seçimi URL kutusundan önceliklidir.
    for (const field of fields.filter(f => f.type === 'image')) {
      const file = pickedFile(field.name);
      if (!file) continue;

      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Görsel yükleniyor...';
      const uploadedUrl = await uploadImage(file);
      if (!uploadedUrl) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalLabel;
        return;
      }
      data[field.name] = uploadedUrl;
    }

    try {
      const success = await onSubmit(data);
      if (success !== false) close();
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalLabel;
    }
  });

  document.body.appendChild(overlay);
  overlay.querySelector('input, textarea, select')?.focus();
}

// ---------------------------------------------------------------------------
//  Admin Controls (Düzenle / Sil / Sırala)
// ---------------------------------------------------------------------------
/**
 * Her düzenlenebilir öğenin üstüne yerleşen kontrol kümesini üretir.
 * @param {object} handlers { onEdit, onDelete, onMoveUp, onMoveDown }
 * @param {object} state    { isFirst, isLast, inline }
 */
function buildAdminControls(handlers, state = {}) {
  const wrap = document.createElement('div');
  wrap.className = `admin-controls${state.inline ? ' admin-controls--inline' : ''}`;

  const addBtn = (variant, icon, titleText, handler, disabled = false) => {
    if (!handler) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `admin-ctrl-btn admin-ctrl-btn--${variant}`;
    btn.title = titleText;
    btn.setAttribute('aria-label', titleText);
    btn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
    btn.disabled = disabled;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handler();
    });
    wrap.appendChild(btn);
  };

  addBtn('move', 'fa-arrow-up', 'Yukarı Taşı', handlers.onMoveUp, state.isFirst);
  addBtn('move', 'fa-arrow-down', 'Aşağı Taşı', handlers.onMoveDown, state.isLast);
  addBtn('edit', 'fa-pen', 'Düzenle', handlers.onEdit);
  addBtn('delete', 'fa-xmark', 'Sil', handlers.onDelete);

  return wrap;
}

/**
 * Bir listedeki iki komşu öğenin yerini değiştirir ve yeni sıralamayı kaydeder.
 *
 * order_index değerleri baştan 0 olabileceği için, önce listenin tamamına
 * ardışık indeks atanır; ardından yalnızca değeri değişen kayıtlar sunucuya
 * gönderilir. Bu sayede tek tıklamada gereksiz istek atılmaz.
 *
 * @param {Array}    items      Ekrandaki sırayla dizilmiş kayıtlar
 * @param {number}   index      Taşınacak kaydın konumu
 * @param {number}   direction  -1 (yukarı) veya +1 (aşağı)
 * @param {string}   endpoint   "/sponsors" gibi kaynak yolu
 * @param {number}   base       order_index taban değeri (etkinlik türleri için)
 */
async function reorderItems(items, index, direction, endpoint, base = 0) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return;

  const ordered = items.slice();
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  const updates = [];
  ordered.forEach((item, position) => {
    const newIndex = base + position;
    if (item.order_index !== newIndex) {
      updates.push({ item, newIndex });
    }
  });

  const results = await Promise.all(
    updates.map(({ item, newIndex }) =>
      apiSend('PUT', `${endpoint}/${item.id}`, { ...item, order_index: newIndex }, 'Sıralama kaydedilemedi.')
    )
  );

  if (results.every(Boolean)) {
    await loadAndRenderAll();
  }
}

// ---------------------------------------------------------------------------
//  Data Loading & Rendering
// ---------------------------------------------------------------------------

async function loadAndRenderAll() {
  const [events, members, projects, announcements, sponsors, stakeholders] = await Promise.all([
    apiGet('/events'),
    apiGet('/board-members'),
    apiGet('/projects'),
    apiGet('/announcements'),
    apiGet('/sponsors'),
    apiGet('/stakeholders'),
  ]);

  renderCalendarEvents(events);
  renderEventSlider(events);
  renderCompetitions(events);
  renderBoardMembers(members);
  renderProjects(projects);
  renderAnnouncements(announcements);
  renderPartners(sponsors, {
    trackId: 'sponsors-dynamic-track',
    endpoint: '/sponsors',
    emptyText: 'Henüz bir iş birliği eklenmemiş.',
    entityLabel: 'iş birliği',
  });
  renderPartners(stakeholders, {
    trackId: 'stakeholders-dynamic-track',
    endpoint: '/stakeholders',
    emptyText: 'Henüz bir paydaş topluluk eklenmemiş.',
    entityLabel: 'paydaş topluluk',
  });

  injectSectionButtons();
}

/** Boş liste durumunda gösterilecek bilgilendirme kutusu. */
function emptyStateHtml(text) {
  return `<div class="marquee-item" style="color: var(--text-muted); padding: 20px; text-align: center; width: 100%;">${escapeHTML(text)}</div>`;
}

// ===========================================================================
// TAKVİM
// ===========================================================================
function renderCalendarEvents(events) {
  const tbody = document.getElementById('calendar-body');
  if (!tbody) return;

  // Slayt ve yarışma kartları takvimde gösterilmez
  const calendarEvents = events.filter(e =>
    e.event_type !== EVENT_KIND.SLIDER && e.event_type !== EVENT_KIND.COMPETITION
  );

  tbody.innerHTML = '';

  if (calendarEvents.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${isAdmin() ? 6 : 5}" style="text-align:center; color: var(--text-muted);">Henüz takvime etkinlik eklenmemiş.</td></tr>`;
    return;
  }

  calendarEvents.forEach((evt, index) => {
    const tr = document.createElement('tr');
    tr.className = 'dynamic-event-row';

    const type = (evt.event_type || '').toLowerCase();
    let badgeClass = 'cal-event';
    if (type === 'yarışma' || type === 'yarisma') badgeClass = 'cal-competition';
    else if (type === 'eğitim' || type === 'egitim') badgeClass = 'cal-training';
    else if (type === 'party') badgeClass = 'cal-party';

    const calUrl = getGoogleCalendarUrl(evt.title, evt.date, evt.end_date, evt.location);
    const dayCount = evt.end_date
      ? Math.round((new Date(toDateInputValue(evt.end_date)) - new Date(toDateInputValue(evt.date))) / 86400000) + 1
      : 1;

    tr.innerHTML = `
      <td>${escapeHTML(evt.title)}</td>
      <td><span class="cal-badge ${badgeClass}">${escapeHTML(evt.event_type)}</span></td>
      <td>
        ${formatDateRange(evt.date, evt.end_date)}
        ${dayCount > 1 ? `<span class="cal-badge cal-event" style="margin-left:8px;">${dayCount} gün</span>` : ''}
      </td>
      <td>${escapeHTML(evt.location)}</td>
      <td>
        <a href="${calUrl}" target="_blank" rel="noopener" class="btn-cal-add" title="Takvime Ekle">
          <i class="fa-solid fa-calendar-plus"></i>
        </a>
      </td>
    `;

    if (isAdmin()) {
      const cell = document.createElement('td');
      cell.className = 'admin-only';
      cell.appendChild(buildAdminControls({
        onEdit: () => openEventForm(evt),
        onDelete: () => confirmDelete('Bu etkinliği takvimden silmek', `/events/${evt.id}`),
        onMoveUp: () => reorderItems(calendarEvents, index, -1, '/events', ORDER_BASE.calendar),
        onMoveDown: () => reorderItems(calendarEvents, index, 1, '/events', ORDER_BASE.calendar),
      }, { isFirst: index === 0, isLast: index === calendarEvents.length - 1, inline: true }));
      tr.appendChild(cell);
    }

    tbody.appendChild(tr);
  });
}

/** Takvim etkinliği ekleme / düzenleme formu (çoklu gün destekli). */
function openEventForm(existing = null) {
  const editing = Boolean(existing);

  openAdminForm({
    title: editing ? 'Etkinliği Düzenle' : 'Takvime Yeni Etkinlik Ekle',
    icon: editing ? 'fa-pen-to-square' : 'fa-calendar-plus',
    values: existing || {},
    fields: [
      { name: 'title', label: 'Etkinlik Adı', required: true },
      { name: 'event_type', label: 'Tür', type: 'select', options: ['Etkinlik', 'Yarışma', 'Eğitim', 'Party'] },
      { name: 'date', label: 'Başlangıç Tarihi', type: 'date', required: true },
      {
        name: 'end_date',
        label: 'Bitiş Tarihi',
        type: 'date',
        hint: 'Etkinlik birden fazla gün sürüyorsa doldurun. Tek günlük etkinliklerde boş bırakın.',
      },
      { name: 'location', label: 'Konum', required: true },
    ],
    onSubmit: async (data) => {
      if (data.end_date && data.end_date < data.date) {
        alert('Bitiş tarihi başlangıç tarihinden önce olamaz.');
        return false;
      }

      const payload = {
        title: data.title,
        event_type: data.event_type,
        date: data.date,
        end_date: data.end_date || null,
        location: data.location,
        description: existing?.description || `${data.title} etkinliği hakkında detaylar yakında paylaşılacak.`,
        content: existing?.content || '-',
      };

      const ok = editing
        ? await apiSend('PUT', `/events/${existing.id}`, payload, 'Etkinlik güncellenemedi.')
        : await apiSend('POST', '/events/', { ...payload, slug: slugify(data.title) }, 'Etkinlik eklenemedi.');

      if (ok) await loadAndRenderAll();
      return ok;
    },
  });
}

// ===========================================================================
// ETKİNLİK SLAYTLARI
// ===========================================================================
function renderEventSlider(events) {
  const track = document.getElementById('event-slider-track');
  if (!track) return;

  const slides = events.filter(e => e.event_type === EVENT_KIND.SLIDER);
  track.innerHTML = '';

  if (slides.length === 0) {
    track.innerHTML = '<div class="slider-slide" style="color: var(--text-muted); text-align: center; padding: 40px;">Henüz gösterilecek bir slayt yok.</div>';
    window.eventSlider?.update();
    return;
  }

  slides.forEach((evt, index) => {
    const slide = document.createElement('div');
    slide.className = 'slider-slide';
    slide.innerHTML = `
      <div class="event-banner" style="position: relative;">
        <div class="event-banner-content">
          <h3>${escapeHTML(evt.title)}</h3>
          <p style="text-align: left;">${escapeHTML(evt.description)}</p>
        </div>
      </div>
    `;

    if (isAdmin()) {
      slide.querySelector('.event-banner').appendChild(buildAdminControls({
        onEdit: () => openSliderForm(evt),
        onDelete: () => confirmDelete('Bu slaytı silmek', `/events/${evt.id}`),
        onMoveUp: () => reorderItems(slides, index, -1, '/events', ORDER_BASE.slider),
        onMoveDown: () => reorderItems(slides, index, 1, '/events', ORDER_BASE.slider),
      }, { isFirst: index === 0, isLast: index === slides.length - 1 }));
    }

    track.appendChild(slide);
  });

  window.eventSlider?.update();
}

function openSliderForm(existing = null) {
  const editing = Boolean(existing);

  openAdminForm({
    title: editing ? 'Slaytı Düzenle' : 'Yeni Slayt Ekle',
    icon: 'fa-images',
    values: existing || {},
    fields: [
      { name: 'title', label: 'Slayt Başlığı', required: true },
      { name: 'description', label: 'Slayt Açıklaması', type: 'textarea', rows: 4, required: true },
    ],
    onSubmit: async (data) => {
      const payload = {
        title: data.title,
        description: data.description,
        // Veritabanı bu alanları zorunlu tuttuğu için yer tutucu değer gönderiyoruz
        date: existing ? toDateInputValue(existing.date) : new Date().toISOString().split('T')[0],
        location: '-',
        content: '-',
        event_type: EVENT_KIND.SLIDER,
      };

      const ok = editing
        ? await apiSend('PUT', `/events/${existing.id}`, payload, 'Slayt güncellenemedi.')
        : await apiSend('POST', '/events/', { ...payload, slug: slugify(data.title) }, 'Slayt eklenemedi.');

      if (ok) await loadAndRenderAll();
      return ok;
    },
  });
}

// ===========================================================================
// YARIŞMA KARTLARI
// ===========================================================================
function renderCompetitions(events) {
  const track = document.getElementById('competitions-dynamic-track');
  if (!track) return;

  const competitions = events.filter(e => e.event_type === EVENT_KIND.COMPETITION);
  track.innerHTML = '';

  if (competitions.length === 0) {
    track.innerHTML = emptyStateHtml('Henüz yarışma eklenmemiş.');
    Marquee.refresh(track);
    return;
  }

  competitions.forEach((evt, index) => {
    // Görsel bağlantısı location alanında saklanır
    const imageUrl = evt.location && evt.location !== '-' ? evt.location : '';

    const item = document.createElement('div');
    item.className = 'marquee-item';
    item.innerHTML = `
      <div class="project-card" style="position: relative; width: min(350px, 82vw); display: flex; flex-direction: column; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; overflow: hidden; height: 100%;">
        ${imageUrl
          ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(evt.title)}" style="width: 100%; height: 200px; object-fit: contain; background: #000000; padding: 15px;">`
          : `<div style="height:200px; background:#000000; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-trophy fa-3x" style="color:var(--glow)"></i></div>`}
        <div class="project-content" style="padding: 20px; text-align: left; flex: 1;">
          <h3 style="margin-bottom: 10px; color: var(--text-primary); font-size: 1.3rem;">${escapeHTML(evt.title)}</h3>
          <p style="font-size: 0.95rem; line-height: 1.5; color: var(--text-secondary);">${escapeHTML(evt.description)}</p>
        </div>
      </div>
    `;

    if (isAdmin()) {
      item.querySelector('.project-card').appendChild(buildAdminControls({
        onEdit: () => openCompetitionForm(evt),
        onDelete: () => confirmDelete('Bu yarışmayı silmek', `/events/${evt.id}`),
        onMoveUp: () => reorderItems(competitions, index, -1, '/events', ORDER_BASE.competition),
        onMoveDown: () => reorderItems(competitions, index, 1, '/events', ORDER_BASE.competition),
      }, { isFirst: index === 0, isLast: index === competitions.length - 1 }));
    }

    track.appendChild(item);
  });

  Marquee.refresh(track);
}

function openCompetitionForm(existing = null) {
  const editing = Boolean(existing);
  const currentImage = existing && existing.location !== '-' ? existing.location : '';

  openAdminForm({
    title: editing ? 'Yarışmayı Düzenle' : 'Yeni Yarışma Ekle',
    icon: 'fa-trophy',
    values: { ...(existing || {}), image: currentImage },
    fields: [
      { name: 'title', label: 'Yarışma Adı', required: true },
      { name: 'description', label: 'Açıklama', type: 'textarea', rows: 5, required: true },
      { name: 'image', label: 'Yarışma Logosu', type: 'image' },
    ],
    onSubmit: async (data) => {
      const payload = {
        title: data.title,
        description: data.description,
        date: existing ? toDateInputValue(existing.date) : new Date().toISOString().split('T')[0],
        location: data.image || '-',
        content: '-',
        event_type: EVENT_KIND.COMPETITION,
      };

      const ok = editing
        ? await apiSend('PUT', `/events/${existing.id}`, payload, 'Yarışma güncellenemedi.')
        : await apiSend('POST', '/events/', { ...payload, slug: slugify(data.title) }, 'Yarışma eklenemedi.');

      if (ok) await loadAndRenderAll();
      return ok;
    },
  });
}

// ===========================================================================
// DUYURULAR
// ===========================================================================
/** Duyuru detayları content alanında JSON olarak saklanır. */
function parseAnnouncementDetails(announcement) {
  const details = { status: '', date: '', location: '', image_url: '' };
  try {
    if (announcement.content && announcement.content.trim().startsWith('{')) {
      return { ...details, ...JSON.parse(announcement.content) };
    }
  } catch (e) {
    console.error('Duyuru detayı çözülemedi:', e);
  }
  return details;
}

function renderAnnouncements(announcements) {
  const track = document.getElementById('announcements-dynamic-track');
  if (!track) return;

  track.innerHTML = '';

  if (announcements.length === 0) {
    track.innerHTML = emptyStateHtml('Henüz bir duyuru eklenmemiş.');
    Marquee.refresh(track);
    return;
  }

  announcements.forEach((a, index) => {
    const details = parseAnnouncementDetails(a);

    const item = document.createElement('div');
    item.className = 'marquee-item';
    item.innerHTML = `
      <div class="upcoming-card">
        <div class="upcoming-image">
          ${details.status ? `<div class="upcoming-status">${escapeHTML(details.status)}</div>` : ''}
          ${details.image_url
            ? `<img src="${escapeHTML(details.image_url)}" alt="${escapeHTML(a.title)}">`
            : `<div style="font-size: 3rem; color: var(--glow);"><i class="fa-solid fa-bullhorn"></i></div>`}
        </div>
        <div class="upcoming-content">
          <h3>${escapeHTML(a.title)}</h3>
          <p>${escapeHTML(a.summary)}</p>
          <div class="upcoming-meta">
            <span><i class="fa-regular fa-calendar"></i> ${escapeHTML(details.date || 'Belirtilmedi')}</span>
            <span><i class="fa-solid fa-location-dot"></i> ${escapeHTML(details.location || 'Belirtilmedi')}</span>
          </div>
        </div>
      </div>
    `;

    if (isAdmin()) {
      item.querySelector('.upcoming-card').appendChild(buildAdminControls({
        onEdit: () => openAnnouncementForm(a),
        onDelete: () => confirmDelete('Bu duyuruyu silmek', `/announcements/${a.id}`),
        onMoveUp: () => reorderItems(announcements, index, -1, '/announcements'),
        onMoveDown: () => reorderItems(announcements, index, 1, '/announcements'),
      }, { isFirst: index === 0, isLast: index === announcements.length - 1 }));
    }

    track.appendChild(item);
  });

  Marquee.refresh(track);
}

function openAnnouncementForm(existing = null) {
  const editing = Boolean(existing);
  const details = existing ? parseAnnouncementDetails(existing) : {};

  openAdminForm({
    title: editing ? 'Duyuruyu Düzenle' : 'Yeni Duyuru Ekle',
    icon: 'fa-bullhorn',
    values: {
      title: existing?.title || '',
      summary: existing?.summary || '',
      image_url: details.image_url || '',
      status: details.status || '',
      date: details.date || '',
      location: details.location || '',
    },
    fields: [
      { name: 'title', label: 'Başlık', required: true, placeholder: 'Örn: Datathon 2026' },
      { name: 'summary', label: 'Açıklama', type: 'textarea', rows: 4, required: true },
      { name: 'image_url', label: 'Görsel', type: 'image' },
      { name: 'status', label: 'Rozet (Durum)', placeholder: 'Örn: Yakında', default: 'Yakında' },
      { name: 'date', label: 'Tarih', placeholder: 'Örn: Aralık 2026' },
      { name: 'location', label: 'Konum', placeholder: 'Örn: Kongre Merkezi' },
    ],
    onSubmit: async (data) => {
      const payload = {
        title: data.title,
        summary: data.summary,
        content: JSON.stringify({
          status: data.status,
          date: data.date,
          location: data.location,
          image_url: data.image_url,
        }),
        is_active: true,
      };

      const ok = editing
        ? await apiSend('PUT', `/announcements/${existing.id}`, payload, 'Duyuru güncellenemedi.')
        : await apiSend('POST', '/announcements/', {
            ...payload,
            slug: `${slugify(data.title)}-${Date.now()}`,
          }, 'Duyuru eklenemedi.');

      if (ok) await loadAndRenderAll();
      return ok;
    },
  });
}

// ===========================================================================
// STANT PROJELERİ
// ===========================================================================
function renderProjects(projects) {
  const container = document.getElementById('projects-dynamic');
  if (!container) return;

  container.innerHTML = '';

  if (projects.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); text-align:center; grid-column: 1 / -1;">Henüz bir proje eklenmemiş.</div>`;
    return;
  }

  projects.forEach((p, index) => {
    // Değer "fa-" ile başlıyorsa ikon, değilse görsel olarak basılır
    let imageHtml;
    if (p.image_url && p.image_url.startsWith('fa-')) {
      imageHtml = `<i class="${escapeHTML(p.image_url)}"></i>`;
    } else if (p.image_url) {
      imageHtml = `<img src="${escapeHTML(p.image_url)}" alt="${escapeHTML(p.title)}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
      imageHtml = '<i class="fa-solid fa-robot"></i>';
    }

    const tagsHtml = p.tags
      ? p.tags.split(',').map(t => `<span>${escapeHTML(t.trim())}</span>`).join('')
      : '';

    let linksHtml = '';
    if (p.github_url) linksHtml += `<a href="${escapeHTML(p.github_url)}" target="_blank" rel="noopener" style="color: var(--glow); font-size: 1.2rem; margin-right:12px;" title="GitHub"><i class="fa-brands fa-github"></i></a>`;
    if (p.demo_url) linksHtml += `<a href="${escapeHTML(p.demo_url)}" target="_blank" rel="noopener" style="color: var(--glow); font-size: 1.2rem;" title="Canlı Demo"><i class="fa-solid fa-up-right-from-square"></i></a>`;

    const card = document.createElement('div');
    card.className = 'project-card scroll-reveal revealed';
    card.style.position = 'relative';
    card.innerHTML = `
      <div class="project-image">${imageHtml}</div>
      <div class="project-content">
        <h3>${escapeHTML(p.title)}</h3>
        <p>${escapeHTML(p.description)}</p>
        <div class="project-tech" style="margin-bottom: 15px;">${tagsHtml}</div>
        <div class="project-links">${linksHtml}</div>
      </div>
    `;

    if (isAdmin()) {
      card.appendChild(buildAdminControls({
        onEdit: () => openProjectForm(p),
        onDelete: () => confirmDelete('Bu projeyi silmek', `/projects/${p.id}`),
        onMoveUp: () => reorderProjects(projects, index, -1),
        onMoveDown: () => reorderProjects(projects, index, 1),
      }, { isFirst: index === 0, isLast: index === projects.length - 1 }));
    }

    container.appendChild(card);
  });
}

/**
 * Projelerde order_index sütunu yok; liste id'ye göre azalan sırada gelir.
 * Bu yüzden sıralama, iki kaydın id'lerini takas edemeyeceğimiz için
 * başlık/açıklama takası yerine kayıtların tüm alanlarının yer değiştirmesiyle
 * yapılır (görsel sonuç kullanıcı için aynıdır).
 */
async function reorderProjects(projects, index, direction) {
  const target = index + direction;
  if (target < 0 || target >= projects.length) return;

  const a = projects[index];
  const b = projects[target];

  const swap = (source) => ({
    title: source.title,
    description: source.description,
    tags: source.tags,
    image_url: source.image_url,
    github_url: source.github_url,
    demo_url: source.demo_url,
    is_featured: source.is_featured,
  });

  const results = await Promise.all([
    apiSend('PUT', `/projects/${a.id}`, swap(b), 'Sıralama kaydedilemedi.'),
    apiSend('PUT', `/projects/${b.id}`, swap(a), 'Sıralama kaydedilemedi.'),
  ]);

  if (results.every(Boolean)) await loadAndRenderAll();
}

function openProjectForm(existing = null) {
  const editing = Boolean(existing);

  openAdminForm({
    title: editing ? 'Projeyi Düzenle' : 'Yeni Proje Ekle',
    icon: 'fa-diagram-project',
    values: existing || {},
    fields: [
      { name: 'title', label: 'Proje Adı', required: true },
      { name: 'description', label: 'Açıklama', type: 'textarea', rows: 4, required: true },
      { name: 'tags', label: 'Etiketler', placeholder: 'Örn: Python, PyTorch, React', hint: 'Virgülle ayırın.' },
      { name: 'image_url', label: 'Proje Görseli', type: 'image', allowIcon: true, placeholder: 'Örn: fa-solid fa-server' },
      { name: 'github_url', label: 'GitHub URL' },
      { name: 'demo_url', label: 'Canlı Demo URL' },
    ],
    onSubmit: async (data) => {
      const payload = {
        title: data.title,
        description: data.description,
        tags: data.tags || null,
        image_url: data.image_url || null,
        github_url: data.github_url || null,
        demo_url: data.demo_url || null,
        is_featured: true,
      };

      const ok = editing
        ? await apiSend('PUT', `/projects/${existing.id}`, payload, 'Proje güncellenemedi.')
        : await apiSend('POST', '/projects/', payload, 'Proje eklenemedi.');

      if (ok) await loadAndRenderAll();
      return ok;
    },
  });
}

// ===========================================================================
// YÖNETİM KURULU
// ===========================================================================
function renderBoardMembers(members) {
  const container = document.getElementById('team-dynamic');
  if (!container) return;

  container.innerHTML = '';
  container.style.display = 'block';

  const groups = {
    baskanlik: [],
    kurumsal: { direktor: [], koordinator: [] },
    egitim: { direktor: [], koordinator: [] },
    medya: { direktor: [], koordinator: [] },
    arge: { direktor: [], koordinator: [] },
    organizasyon: { direktor: [], koordinator: [] },
    denetim: [],
  };

  members.forEach(m => {
    const role = (m.role || '').toLowerCase();
    // "direkt" araması "Direktör", "Direktörü" gibi tüm varyasyonları kapsar
    const isDirector = role.includes('direkt');

    if (role.includes('başkan') || role.includes('baskan')) groups.baskanlik.push(m);
    else if (role.includes('kurumsal')) (isDirector ? groups.kurumsal.direktor : groups.kurumsal.koordinator).push(m);
    else if (role.includes('eğitim') || role.includes('egitim')) (isDirector ? groups.egitim.direktor : groups.egitim.koordinator).push(m);
    else if (role.includes('medya') || role.includes('tanıtım') || role.includes('tanitim')) (isDirector ? groups.medya.direktor : groups.medya.koordinator).push(m);
    else if (role.includes('ar-ge') || role.includes('arge')) (isDirector ? groups.arge.direktor : groups.arge.koordinator).push(m);
    else if (role.includes('organizasyon')) (isDirector ? groups.organizasyon.direktor : groups.organizasyon.koordinator).push(m);
    else if (role.includes('denetim')) groups.denetim.push(m);
    else groups.baskanlik.push(m);
  });

  const createCard = (m) => {
    const roleText = m.role || '';
    const isPresident = roleText.toLowerCase().includes('başkan') && !roleText.toLowerCase().includes('yardımcı');

    const photoHtml = m.image_url
      ? `<img src="${escapeHTML(m.image_url)}" alt="${escapeHTML(m.full_name)}" style="width: 100%; height: 100%; object-fit: cover;">`
      : '<div class="team-photo-placeholder"><i class="fa-solid fa-user"></i></div>';

    let socialHtml = '';
    if (m.linkedin_url) socialHtml += `<a href="${escapeHTML(m.linkedin_url)}" target="_blank" rel="noopener" class="team-linkedin" title="LinkedIn"><i class="fa-brands fa-linkedin"></i></a>`;
    if (m.github_url) socialHtml += `<a href="${escapeHTML(m.github_url)}" target="_blank" rel="noopener" class="team-linkedin" style="margin-left: 8px;" title="GitHub"><i class="fa-brands fa-github"></i></a>`;

    const card = document.createElement('div');
    card.className = `team-card${isPresident ? ' team-card-president' : ''} scroll-reveal revealed`;
    card.style.cssText = 'margin: 10px; position: relative;';
    card.innerHTML = `
      <div class="team-photo">${photoHtml}</div>
      <h3 class="team-name">${escapeHTML(m.full_name)}</h3>
      <p class="team-role" style="color: var(--glow);">${escapeHTML(roleText)}</p>
      <div class="team-social" style="margin-top: 10px;">${socialHtml}</div>
    `;

    if (isAdmin()) {
      const index = members.indexOf(m);
      card.appendChild(buildAdminControls({
        onEdit: () => openMemberForm(m),
        onDelete: () => confirmDelete('Bu ekip üyesini silmek', `/board-members/${m.id}`),
        onMoveUp: () => reorderItems(members, index, -1, '/board-members'),
        onMoveDown: () => reorderItems(members, index, 1, '/board-members'),
      }, { isFirst: index === 0, isLast: index === members.length - 1 }));
    }

    return card;
  };

  const renderSection = (title, topRow, bottomRow) => {
    const top = topRow || [];
    const bottom = bottomRow || [];
    if (top.length === 0 && bottom.length === 0) return;

    const section = document.createElement('div');
    section.style.cssText = 'display: flex; flex-direction: column; align-items: center; width: 100%; margin-bottom: 50px;';

    if (title) {
      const heading = document.createElement('h3');
      heading.style.cssText = 'width:100%; text-align:center; margin-bottom: 30px; font-size: 1.8rem; color: var(--glow); letter-spacing: 1px; text-transform: uppercase;';
      heading.textContent = title;
      section.appendChild(heading);
    }

    [top, bottom].forEach((row, rowIndex) => {
      if (row.length === 0) return;
      const rowEl = document.createElement('div');
      rowEl.style.cssText = `display: flex; justify-content: center; flex-wrap: wrap; gap: 20px; width: 100%;${rowIndex === 0 ? ' margin-bottom: 20px;' : ''}`;
      row.forEach(m => rowEl.appendChild(createCard(m)));
      section.appendChild(rowEl);
    });

    container.appendChild(section);
  };

  groups.baskanlik.sort((a, b) => (a.role || '').length - (b.role || '').length);
  renderSection('', groups.baskanlik, null);
  renderSection('KURUMSAL İLİŞKİLER KOMİSYONU', groups.kurumsal.direktor, groups.kurumsal.koordinator);
  renderSection('EĞİTİM KOMİSYONU', groups.egitim.direktor, groups.egitim.koordinator);
  renderSection('MEDYA TANITIM KOMİSYONU', groups.medya.direktor, groups.medya.koordinator);
  renderSection('AR-GE KOMİSYONU', groups.arge.direktor, groups.arge.koordinator);
  renderSection('ORGANİZASYON KOMİSYONU', groups.organizasyon.direktor, groups.organizasyon.koordinator);
  renderSection('DENETİM KURULU', groups.denetim, null);
}

function openMemberForm(existing = null) {
  const editing = Boolean(existing);

  openAdminForm({
    title: editing ? 'Ekip Üyesini Düzenle' : 'Yeni Ekip Üyesi Ekle',
    icon: 'fa-user-plus',
    values: existing || {},
    fields: [
      { name: 'full_name', label: 'Ad Soyad', required: true },
      { name: 'role', label: 'Görev (Rol)', required: true, hint: 'Komisyon adını içermeli. Örn: Ar-Ge Komisyonu Direktörü' },
      { name: 'period', label: 'Dönem', required: true, placeholder: 'Örn: 2026-2027' },
      { name: 'image_url', label: 'Fotoğraf', type: 'image' },
      { name: 'linkedin_url', label: 'LinkedIn URL' },
      { name: 'github_url', label: 'GitHub URL' },
    ],
    onSubmit: async (data) => {
      const payload = {
        full_name: data.full_name,
        role: data.role,
        period: data.period,
        image_url: data.image_url || null,
        linkedin_url: data.linkedin_url || null,
        github_url: data.github_url || null,
        order_index: existing?.order_index ?? 0,
      };

      const ok = editing
        ? await apiSend('PUT', `/board-members/${existing.id}`, payload, 'Üye güncellenemedi.')
        : await apiSend('POST', '/board-members/', payload, 'Üye eklenemedi.');

      if (ok) await loadAndRenderAll();
      return ok;
    },
  });
}

// ===========================================================================
// İŞ BİRLİKLERİ & AI FEST PAYDAŞLARI (ortak render)
// ===========================================================================
/**
 * Logo şeritlerini basar. Logolar kare bir kutuya sıkıştırılmaz; yalnızca
 * yükseklikleri sınırlanır, genişlik serbest bırakılır. Böylece yatay logo
 * yatay, dikey logo dikey görünür.
 */
function renderPartners(items, { trackId, endpoint, emptyText, entityLabel }) {
  const track = document.getElementById(trackId);
  if (!track) return;

  track.innerHTML = '';

  if (items.length === 0) {
    track.innerHTML = emptyStateHtml(emptyText);
    Marquee.refresh(track);
    return;
  }

  items.forEach((item, index) => {
    const logoHtml = item.logo_url && item.logo_url.startsWith('fa-')
      ? `<i class="${escapeHTML(item.logo_url)}"></i>`
      : `<img src="${escapeHTML(item.logo_url)}" alt="${escapeHTML(item.name)}" loading="lazy">`;

    const inner = `
      <div class="partner-logo-box">${logoHtml}</div>
      <span class="partner-name">${escapeHTML(item.name)}</span>
    `;

    const wrapper = document.createElement('div');
    wrapper.className = 'marquee-item';
    wrapper.innerHTML = `
      <div class="partner-item">
        ${item.website_url
          ? `<a href="${escapeHTML(item.website_url)}" target="_blank" rel="noopener">${inner}</a>`
          : inner}
      </div>
    `;

    if (isAdmin()) {
      wrapper.querySelector('.partner-item').style.position = 'relative';
      wrapper.querySelector('.partner-item').appendChild(buildAdminControls({
        onEdit: () => openPartnerForm({ endpoint, entityLabel, existing: item }),
        onDelete: () => confirmDelete(`Bu ${entityLabel} kaydını silmek`, `${endpoint}/${item.id}`),
        onMoveUp: () => reorderItems(items, index, -1, endpoint),
        onMoveDown: () => reorderItems(items, index, 1, endpoint),
      }, { isFirst: index === 0, isLast: index === items.length - 1 }));
    }

    track.appendChild(wrapper);
  });

  Marquee.refresh(track);
}

function openPartnerForm({ endpoint, entityLabel, existing = null }) {
  const editing = Boolean(existing);
  const titleWord = entityLabel.charAt(0).toLocaleUpperCase('tr') + entityLabel.slice(1);

  openAdminForm({
    title: editing ? `${titleWord} Kaydını Düzenle` : `Yeni ${titleWord} Ekle`,
    icon: 'fa-handshake',
    values: existing || {},
    fields: [
      { name: 'name', label: 'Kurum / Topluluk Adı', required: true },
      {
        name: 'logo_url',
        label: 'Logo',
        type: 'image',
        allowIcon: true,
        required: true,
        placeholder: 'Resim linki veya ikon (Örn: fa-solid fa-building)',
        hint: 'Logo kare kutuya sığdırılmaz; yatay logo yatay, dikey logo dikey görünür.',
      },
      { name: 'website_url', label: 'Website URL', placeholder: 'Örn: https://www.hacettepe.edu.tr' },
    ],
    onSubmit: async (data) => {
      const payload = {
        name: data.name,
        logo_url: data.logo_url,
        website_url: data.website_url || null,
        order_index: existing?.order_index ?? 0,
        is_active: true,
      };
      // Sponsor tablosunda ek bir "tier" alanı bulunur
      if (endpoint === '/sponsors') payload.tier = existing?.tier || 'Standart';

      const ok = editing
        ? await apiSend('PUT', `${endpoint}/${existing.id}`, payload, 'Kayıt güncellenemedi.')
        : await apiSend('POST', `${endpoint}/`, payload, 'Kayıt eklenemedi.');

      if (ok) await loadAndRenderAll();
      return ok;
    },
  });
}

// ---------------------------------------------------------------------------
//  Silme Onayı (ortak)
// ---------------------------------------------------------------------------
async function confirmDelete(question, path) {
  if (!confirm(`${question} istediğinize emin misiniz?`)) return;
  const ok = await apiSend('DELETE', path, undefined, 'Silme işlemi başarısız.');
  if (ok) await loadAndRenderAll();
}

// ---------------------------------------------------------------------------
//  Bölüm İçi "Ekle" Butonları
// ---------------------------------------------------------------------------
/** HTML'de karşılığı bulunmayan (takvim / slayt) ekleme butonlarını yerleştirir. */
function injectSectionButtons() {
  const ensureButton = (parentSelector, className, label, handler) => {
    const parent = document.querySelector(parentSelector);
    if (!parent) return;

    let btn = parent.querySelector(`.${className}`);
    if (!isAdmin()) {
      btn?.remove();
      return;
    }
    if (btn) return;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `${className} btn-primary admin-only`;
    btn.style.cssText = 'margin: 24px auto 0 auto;';
    btn.innerHTML = `<i class="fa-solid fa-plus"></i> ${label}`;
    btn.addEventListener('click', handler);
    parent.appendChild(btn);
  };

  ensureButton('#takvim .container', 'admin-add-event-btn', 'Takvime Etkinlik Ekle', () => openEventForm());
  ensureButton('#etkinlikler .container', 'admin-add-slider-btn', 'Slayt Ekle', () => openSliderForm());

  // Butonlar eklendikten sonra araç çubuğu yüksekliği değişmiş olabilir
  syncToolbarHeight();
}

// HTML içinde zaten var olan "Ekle" butonları
document.getElementById('admin-add-announcement-btn')?.addEventListener('click', () => openAnnouncementForm());
document.getElementById('admin-add-project-btn')?.addEventListener('click', () => openProjectForm());
document.getElementById('admin-add-member-btn')?.addEventListener('click', () => openMemberForm());
document.getElementById('admin-add-competition-btn')?.addEventListener('click', () => openCompetitionForm());
document.getElementById('admin-add-sponsor-btn')?.addEventListener('click', () =>
  openPartnerForm({ endpoint: '/sponsors', entityLabel: 'iş birliği' }));
document.getElementById('admin-add-stakeholder-btn')?.addEventListener('click', () =>
  openPartnerForm({ endpoint: '/stakeholders', entityLabel: 'paydaş topluluk' }));

// ===========================================================================
// ADMİN YÖNETİMİ
// ===========================================================================
function openAddAdminForm() {
  openAdminForm({
    title: 'Yeni Admin Kaydı',
    icon: 'fa-user-shield',
    fields: [
      { name: 'username', label: 'Kullanıcı Adı (E-posta)', required: true },
      { name: 'password', label: 'Şifre', required: true },
    ],
    onSubmit: async (data) => {
      const ok = await apiSend('POST', '/users/register', {
        username: data.username,
        password: data.password,
      }, 'Admin eklenemedi.');
      if (ok) alert('Yeni admin başarıyla eklendi!');
      return ok;
    },
  });
}

/**
 * Basit liste modalı üreticisi (adminler ve bülten aboneleri için ortak).
 */
function openListModal({ title, icon, endpoint, emptyText, renderRow, deletePath }) {
  document.querySelectorAll('.admin-modal-form').forEach(f => f.remove());

  const overlay = document.createElement('div');
  overlay.className = 'admin-modal-form';
  overlay.innerHTML = `
    <div class="admin-inline-form" style="max-width: 500px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h4 style="margin: 0;"><i class="fa-solid ${icon}"></i> ${escapeHTML(title)}</h4>
        <button type="button" class="admin-btn admin-btn--secondary" data-action="close" style="padding: 5px 12px;">✕</button>
      </div>
      <div data-role="list" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="text-align: center; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...</div>
      </div>
    </div>
  `;

  const close = () => overlay.remove();
  overlay.querySelector('[data-action="close"]').addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  document.body.appendChild(overlay);

  const list = overlay.querySelector('[data-role="list"]');

  (async () => {
    try {
      const res = await fetch(`${API_URL}${endpoint}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Veri çekilemedi');

      const records = await res.json();
      list.innerHTML = '';

      if (records.length === 0) {
        list.innerHTML = `<div style="text-align: center; color: var(--text-muted);">${escapeHTML(emptyText)}</div>`;
        return;
      }

      records.forEach(record => {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.05); padding: 10px 15px; border-radius: 8px; gap: 12px;';
        row.innerHTML = `<div style="min-width:0;">${renderRow(record)}</div>`;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'admin-ctrl-btn admin-ctrl-btn--delete';
        deleteBtn.title = 'Sil';
        deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        deleteBtn.addEventListener('click', async () => {
          if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
          deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          const ok = await apiSend('DELETE', deletePath(record), undefined, 'Silinemedi.');
          if (ok) row.remove();
          else deleteBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
        });

        row.appendChild(deleteBtn);
        list.appendChild(row);
      });
    } catch (error) {
      list.innerHTML = '<div style="color: #ef5350;">Liste yüklenemedi. Yetkiniz olmayabilir.</div>';
    }
  })();
}

function openAdminListForm() {
  openListModal({
    title: 'Kayıtlı Adminler',
    icon: 'fa-users-gear',
    endpoint: '/users',
    emptyText: 'Kayıtlı admin bulunmuyor.',
    deletePath: (admin) => `/users/${admin.id}`,
    renderRow: (admin) => `
      <div style="font-weight: 600; color: var(--text-primary); overflow-wrap: anywhere;">${escapeHTML(admin.email)}</div>
      <div style="font-size: 0.8rem; color: var(--text-muted);">Rol: ${escapeHTML(admin.role)}</div>
    `,
  });
}

function openNewsletterListModal() {
  openListModal({
    title: 'Bülten Aboneleri',
    icon: 'fa-envelope-open-text',
    endpoint: '/newsletter/',
    emptyText: 'Henüz abone bulunmuyor.',
    deletePath: (sub) => `/newsletter/${sub.id}`,
    renderRow: (sub) => {
      const date = new Date(sub.subscribed_at).toLocaleDateString('tr-TR', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
      return `
        <div style="font-weight: 600; color: var(--text-primary); overflow-wrap: anywhere;">${escapeHTML(sub.email)}</div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">Kayıt: ${escapeHTML(date)}</div>
      `;
    },
  });
}

// ---------------------------------------------------------------------------
//  Initialization
// ---------------------------------------------------------------------------
function init() {
  if (localStorage.getItem(LS_ADMIN_STATE) === 'true' && getToken()) {
    activateAdminMode();
  } else {
    // Yarım kalmış oturum kalıntılarını temizle
    localStorage.removeItem(LS_ADMIN_STATE);
    loadAndRenderAll();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
