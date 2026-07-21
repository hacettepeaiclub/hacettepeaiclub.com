/**
 * Hacettepe AI Club - Admin Panel Module (API INTEGRATED)
 * Handle login, calendar events, and training management via FastAPI Backend.
 */

// ---------------------------------------------------------------------------
//  Constants & Configuration
// ---------------------------------------------------------------------------
const API_URL = 'http://localhost:8000'; // Canlıya alınca burası sunucu IP/Domain'i olacak
const LS_TOKEN_KEY = 'hacettepe_ai_token';
const LS_ADMIN_STATE = 'hacettepe_ai_admin';

const EVENT_TYPES = {
  egitim:   'Eğitim',
  yarisma:  'Yarışma',
  etkinlik: 'Etkinlik',
  party:    'Party',
};

// ---------------------------------------------------------------------------
//  DOM References
// ---------------------------------------------------------------------------
const adminModal     = document.getElementById('admin-modal');
const adminLoginForm = document.getElementById('admin-login-form');
const adminClose     = document.getElementById('admin-close');
const adminTrigger   = document.getElementById('admin-trigger');
const adminPassword  = document.getElementById('admin-password');

// ---------------------------------------------------------------------------
//  Fetch Interceptor (401 Hatalarını Otomatik Yakalama)
// ---------------------------------------------------------------------------
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch(...args);
  
  // Eğer sunucudan 401 (Yetkisiz) hatası dönerse ve admin modundaysak
  if (response.status === 401 && document.body.classList.contains('admin-mode')) {
     alert("Oturum süreniz doldu. Güvenliğiniz için lütfen tekrar giriş yapın.");
     
     // Çıkış fonksiyonumuzu çağırıp temizlik yapıyoruz
     deactivateAdminMode(); 
  }
  return response;
};

// ---------------------------------------------------------------------------
//  Admin Login Modal & Authentication
// ---------------------------------------------------------------------------

function openAdminModal() {
  adminModal?.classList.add('active');
  document.body.classList.add('modal-open');
  adminPassword?.focus();
  document.getElementById('side-menu-close')?.click();
}

function closeAdminModal() {
  adminModal?.classList.remove('active');
  adminModal?.classList.add('closing');

  const onEnd = () => {
    adminModal?.classList.remove('closing');
    document.body.classList.remove('modal-open');
    adminModal?.removeEventListener('transitionend', onEnd);
  };
  adminModal?.addEventListener('transitionend', onEnd);

  setTimeout(() => {
    adminModal?.classList.remove('closing');
    document.body.classList.remove('modal-open');
  }, 500);
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

/**
 * FastAPI Login Endpoint'ine istek atar
 */
async function handleAdminLogin(e) {
  e.preventDefault();
  
  const usernameInput = document.getElementById('admin-username');
  const passwordInput = document.getElementById('admin-password');
  
  const username = usernameInput?.value ?? '';
  const password = passwordInput?.value ?? '';

  try {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
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

function activateAdminMode() {
  document.body.classList.add('admin-mode');
  localStorage.setItem(LS_ADMIN_STATE, 'true');
  const toolbar = document.getElementById('admin-toolbar');
  if (toolbar) toolbar.style.display = 'block';
  
  // YENİ: admin-only class'ına sahip tüm elementleri görünür yap
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = 'block';
  });
  
  injectAdminButtons();
  loadAndRenderAll(); 
}

function deactivateAdminMode() {
  document.body.classList.remove('admin-mode');
  localStorage.removeItem(LS_ADMIN_STATE);
  localStorage.removeItem(LS_TOKEN_KEY);
  
  const toolbar = document.getElementById('admin-toolbar');
  if (toolbar) toolbar.style.display = 'none';

  // YENİ: Çıkış yapıldığında eklenmiş olan admin butonlarını anında DOM'dan söküp atıyoruz
  const addAdminBtn = document.getElementById('admin-add-admin-btn');
  if (addAdminBtn) addAdminBtn.remove();

  const manageBtn = document.getElementById('admin-manage-btn');
  if (manageBtn) manageBtn.remove();

  removeAdminButtons();
  loadAndRenderAll(); 
  
  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = 'none';
  });
}

// ---------------------------------------------------------------------------
//  API Call & Render Operations
// ---------------------------------------------------------------------------

/** Veritabanındaki tüm etkinlikleri çeker */
async function fetchAllEvents() {
  try {
    const res = await fetch(`${API_URL}/events`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("API'ye ulaşılamadı:", err);
    return [];
  }
}

/** Sayfa yüklendiğinde veya admin olunduğunda tüm verileri API'dan alıp arayüze basar */
async function loadAndRenderAll() {
  const events = await fetchAllEvents();
  
  // Takvim
  renderCalendarEvents(events);
  
  // YENİ: Etkinlikler (Slider)
  renderEventSlider(events);
  
  // Eğitimler
  const trainings = events.filter(e => e.event_type.toLowerCase() === 'eğitim' || e.event_type.toLowerCase() === 'egitim');
  renderTrainings(trainings);

  // Üyeler
  const members = await fetchBoardMembers();
  renderBoardMembers(members);

  // Projeler
  const projects = await fetchProjects();
  renderProjects(projects);

  // Duyurular
  const announcements = await fetchAnnouncements();
  renderAnnouncements(announcements);

  // Sponsorlar
  const sponsors = await fetchSponsors();
  renderSponsors(sponsors);

  // Yarışmaları Bas (YENİ EKLENEN)
  renderCompetitions(events);
}

// ---------------------------------------------------------------------------
//  Calendar Event Management
// ---------------------------------------------------------------------------

async function addCalendarEvent(eventData) {
  const token = localStorage.getItem(LS_TOKEN_KEY);
  try {
    await fetch(`${API_URL}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(eventData)
    });
    loadAndRenderAll();
  } catch (error) {
    alert("Etkinlik eklenirken hata oluştu.");
  }
}

async function deleteCalendarEvent(id) {
  const token = localStorage.getItem(LS_TOKEN_KEY);
  try {
    await fetch(`${API_URL}/events/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    loadAndRenderAll();
  } catch (error) {
    alert("Silme işlemi başarısız.");
  }
}

function parseTurkishDate(dateStr) {
  const months = {
    'ocak': '01', 'şubat': '02', 'mart': '03', 'nisan': '04',
    'mayıs': '05', 'haziran': '06', 'temmuz': '07', 'ağustos': '08',
    'eylül': '09', 'ekim': '10', 'kasım': '11', 'aralık': '12'
  };
  const cleanStr = dateStr.toLowerCase().trim();
  const parts = cleanStr.split(/\s+/);
  let day = '01', month = '01', year = new Date().getFullYear().toString();

  if (parts.length >= 3) {
    day = parts[0].padStart(2, '0');
    month = months[parts[1]] || '01';
    year = parts[2];
  } else {
    const match = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) return { year: match[1], month: match[2], day: match[3] };
  }
  return { year, month, day };
}

function getGoogleCalendarUrl(name, dateStr, location) {
  const parsed = parseTurkishDate(dateStr);
  const startDate = `${parsed.year}${parsed.month}${parsed.day}`;
  const dates = `${startDate}T160000Z/${startDate}T180000Z`;
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(name)}&dates=${dates}&details=${encodeURIComponent(name + ' - Hacettepe AI Club')}&location=${encodeURIComponent(location)}`;
}

function renderCalendarEvents(events) {
  const tbody = document.getElementById('calendar-body');
  if (!tbody) return;

  const isAdmin = document.body.classList.contains('admin-mode');
  tbody.querySelectorAll('.dynamic-event-row').forEach(row => row.remove());

  // Slider'ları filtreleyerek takvimden gizliyoruz
  const calendarEvents = events.filter(e => e.event_type.toLowerCase() !== 'slider' && e.event_type !== 'YarismaKarti');
  calendarEvents.forEach((evt) => {
    const tr = document.createElement('tr');
    tr.className = 'dynamic-event-row';

    let badgeClass = 'cal-event';
    const tType = evt.event_type.toLowerCase();
    if (tType === 'yarışma' || tType === 'yarisma') badgeClass = 'cal-competition';
    else if (tType === 'eğitim' || tType === 'egitim') badgeClass = 'cal-training';
    else if (tType === 'party') badgeClass = 'cal-party';

    const calUrl = getGoogleCalendarUrl(evt.title, evt.date, evt.location);

    tr.innerHTML = `
      <td>${escapeHTML(evt.title)}</td>
      <td><span class="cal-badge ${badgeClass}">${escapeHTML(evt.event_type)}</span></td>
      <td>${formatDateForDisplay(evt.date)}</td>
      <td>${escapeHTML(evt.location)}</td>
      <td>
        <a href="${calUrl}" target="_blank" rel="noopener" class="btn-cal-add" title="Takvime Ekle">
          <i class="fa-solid fa-calendar-plus"></i>
        </a>
      </td>
      ${isAdmin ? `<td><button class="admin-delete-btn" data-id="${evt.id}" title="Sil">✕</button></td>` : ''}
    `;
    tbody.appendChild(tr);
  });

  if (isAdmin) {
    tbody.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Bu etkinliği takvimden silmek istediğinize emin misiniz?')) {
          await deleteCalendarEvent(btn.dataset.id);
        }
      });
    });
  }
}

// ---------------------------------------------------------------------------
//  UI Injection (Admin Forms)
// ---------------------------------------------------------------------------

function injectAdminButtons() {
  if (!document.body.classList.contains('admin-mode')) return;

  // Takvim (Etkinlik) Butonu (Herkes Görür)
  const calendarSection = document.querySelector('#takvim, #calendar, .calendar-section');
  if (calendarSection && !calendarSection.querySelector('.admin-add-event-btn')) {
    const btn = document.createElement('button');
    btn.className = 'admin-add-event-btn btn-primary';
    btn.style.cssText = "display: block; margin: 20px auto 0 auto;";
    btn.innerHTML = '<i class="fa-solid fa-plus"></i> Takvime Ekle';
    btn.addEventListener('click', openEventForm);
    calendarSection.appendChild(btn);
  }

  // Slayt Gösterisi İçin Buton (Herkes Görür)
  const sliderSection = document.querySelector('#etkinlikler .container');
  if (sliderSection && !sliderSection.querySelector('.admin-add-slider-btn')) {
    const btn = document.createElement('button');
    btn.className = 'admin-add-slider-btn btn-primary';
    btn.style.cssText = "display: block; margin: 20px auto 0 auto;";
    btn.innerHTML = '<i class="fa-solid fa-plus"></i> Slayt Ekle';
    btn.addEventListener('click', openSliderForm);
    sliderSection.appendChild(btn);
  }

  // YENİ YAPI: Token'ı çözüp giriş yapanın kim olduğunu anlıyoruz
  const token = localStorage.getItem(LS_TOKEN_KEY);
  let currentUserEmail = "";
  if (token) {
    try {
      // JWT Token'ın içindeki veriyi okuma
      const payload = JSON.parse(atob(token.split('.')[1]));
      currentUserEmail = payload.sub; // .sub alanı e-postayı tutuyor
    } catch (e) {
      console.error("Token okunamadı");
    }
  }

  const toolbarInner = document.querySelector('.admin-toolbar-inner');
  if (toolbarInner) {
    
    // SADECE KURUCU ADMİN (admin@hacettepeaiclub.com) İSE BUTONLARI GÖSTER
    if (currentUserEmail === "arge_yk") {
      
      // Yeni Admin Ekle Butonu
      if (!document.getElementById('admin-add-admin-btn')) {
        const btn = document.createElement('button');
        btn.id = 'admin-add-admin-btn';
        btn.className = 'btn-primary';
        btn.style.marginLeft = '15px';
        btn.style.padding = '5px 15px';
        btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Yeni Admin';
        btn.addEventListener('click', openAddAdminForm);
        toolbarInner.insertBefore(btn, document.getElementById('admin-logout'));
      }
      
      // Adminleri Yönet Butonu
      if (!document.getElementById('admin-manage-btn')) {
        const manageBtn = document.createElement('button');
        manageBtn.id = 'admin-manage-btn';
        manageBtn.className = 'btn-primary';
        manageBtn.style.marginLeft = '15px';
        manageBtn.style.padding = '5px 15px';
        manageBtn.innerHTML = '<i class="fa-solid fa-users-gear"></i> Adminleri Yönet';
        manageBtn.addEventListener('click', openAdminListForm);
        toolbarInner.insertBefore(manageBtn, document.getElementById('admin-logout'));
      }
    }
  }
}

function removeAdminButtons() {
  // Sadece Javascript ile eklenen Takvim ve Slayt butonlarını temizle
  // (HTML içindeki orijinal Üye, Duyuru vb. butonlarına KESİNLİKLE DOKUNMA)
  document.querySelectorAll('.admin-add-event-btn, .admin-add-slider-btn').forEach(btn => btn.remove());
  document.querySelectorAll('.admin-inline-form').forEach(f => f.remove());
}

function openEventForm() {
  if (document.querySelector('.admin-event-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-event-form';
  form.innerHTML = `
    <h4>Yeni Etkinlik Ekle</h4>
    <label>Etkinlik Adı *<input type="text" id="event-name" required /></label>
    
    <!-- YENİ: Slider'da görünecek açıklama metni alanı -->
    <label>Açıklama (Slider'da Görünecek) *<textarea id="event-desc" rows="3" required></textarea></label>
    
    <label>Tarih *<input type="date" id="event-date" required /></label>
    <label>Konum *<input type="text" id="event-location" required /></label>
    <label>Tür
      <select id="event-type">
        <option value="Etkinlik">Etkinlik (Aynı zamanda Slider'a da ekler)</option>
        <option value="Yarışma">Yarışma</option>
        <option value="Eğitim">Eğitim</option>
        <option value="Party">Party</option>
      </select>
    </label>
    <div class="admin-form-actions">
      <button type="button" id="event-submit-btn" class="admin-btn">Ekle</button>
      <button type="button" id="event-cancel-btn" class="admin-btn admin-btn--secondary">İptal</button>
    </div>
  `;

  const addBtn = document.querySelector('.admin-add-event-btn');
  addBtn?.parentNode?.insertBefore(form, addBtn.nextSibling);

  document.getElementById('event-submit-btn')?.addEventListener('click', () => {
    const title = document.getElementById('event-name')?.value.trim();
    const description = document.getElementById('event-desc')?.value.trim();
    const date = document.getElementById('event-date')?.value;
    const location = document.getElementById('event-location')?.value.trim();
    const event_type = document.getElementById('event-type')?.value;

    if (!title || !description || !date || !location) return alert('Lütfen tüm zorunlu alanları doldurun.');

    addCalendarEvent({ title, description, date, location, event_type });
    form.remove();
  });

  document.getElementById('event-cancel-btn')?.addEventListener('click', () => form.remove());
}

// ---------------------------------------------------------------------------
//  Training Render & Forms
// ---------------------------------------------------------------------------

function renderTrainings(trainings) {
  const container = document.getElementById('trainings-dynamic');
  if (!container) return;

  const isAdmin = document.body.classList.contains('admin-mode');
  container.innerHTML = '';

  trainings.forEach((t) => {
    const card = document.createElement('div');
    card.className = 'training-card dynamic-training';
    card.innerHTML = `
      <h4 class="training-card__title">${escapeHTML(t.title)}</h4>
      <p class="training-card__desc">${escapeHTML(t.location)}</p>
      <div class="training-card__meta">
        <span>📅 ${escapeHTML(t.date)}</span>
        <span>👤 ${escapeHTML(t.instructor || 'Eğitmen Belirtilmemiş')}</span>
      </div>
      ${isAdmin ? `<button class="admin-delete-btn" data-id="${t.id}" title="Sil">✕</button>` : ''}
    `;
    container.appendChild(card);
  });

  if (isAdmin) {
    container.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (confirm('Bu eğitimi silmek istediğinize emin misiniz?')) {
          deleteCalendarEvent(btn.dataset.id); // Eğitimler de event tablosunda
        }
      });
    });
  }
}

function openTrainingForm() {
  if (document.querySelector('.admin-training-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-training-form';
  form.innerHTML = `
    <h4>Yeni Eğitim</h4>
    <label>Başlık <input type="text" id="training-title" required /></label>
    <label>Açıklama (Konum) <textarea id="training-description" rows="3" required></textarea></label>
    <label>Tarih <input type="date" id="training-date" required /></label>
    <label>Eğitmen <input type="text" id="training-instructor" required /></label>
    <div class="admin-form-actions">
      <button type="button" id="training-submit-btn" class="admin-btn">Ekle</button>
      <button type="button" id="training-cancel-btn" class="admin-btn admin-btn--secondary">İptal</button>
    </div>
  `;

  const addBtn = document.querySelector('.admin-add-training-btn');
  addBtn?.parentNode?.insertBefore(form, addBtn.nextSibling);

  document.getElementById('training-submit-btn')?.addEventListener('click', () => {
    const title = document.getElementById('training-title')?.value.trim();
    const location = document.getElementById('training-description')?.value.trim(); // Modellerimizde location olduğu için açıklamayı oraya basıyoruz
    const date = document.getElementById('training-date')?.value;
    const instructor = document.getElementById('training-instructor')?.value.trim();

    if (!title || !location || !date || !instructor) return alert('Lütfen tüm alanları doldurun.');

    addCalendarEvent({ title, date, location, event_type: 'Eğitim', instructor });
    form.remove();
  });

  document.getElementById('training-cancel-btn')?.addEventListener('click', () => form.remove());
}

// ---------------------------------------------------------------------------
//  Utilities & Initialization
// ---------------------------------------------------------------------------

function escapeHTML(str = '') {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function init() {
  if (localStorage.getItem(LS_ADMIN_STATE) === 'true') {
    activateAdminMode();
  } else {
    loadAndRenderAll();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
/** 
 * Veritabanından gelen karmaşık tarih formatını şık bir formata çevirir 
 */
function formatDateForDisplay(dateStr) {
    if (!dateStr) return "-";
    
    // Eğer tarih "2026-07-25T00:00:00" gibi geliyorsa sadece ilk kısmını alalım
    const datePart = dateStr.split("T")[0];
    const [y, m, d] = datePart.split("-");
    
    const months = {
        '01': 'Ocak', '02': 'Şubat', '03': 'Mart', '04': 'Nisan',
        '05': 'Mayıs', '06': 'Haziran', '07': 'Temmuz', '08': 'Ağustos',
        '09': 'Eylül', '10': 'Ekim', '11': 'Kasım', '12': 'Aralık'
    };
    
    return `${parseInt(d)} ${months[m] || ''} ${y}`;
}

// ===========================================================================
// EKİP ÜYELERİ (BOARD MEMBERS) İŞLEMLERİ
// ===========================================================================

// 1. Üyeleri API'den Çek
async function fetchBoardMembers() {
  try {
    const res = await fetch(`${API_URL}/board-members`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Ekip üyeleri çekilemedi:", err);
    return [];
  }
}

// ===========================================================================
// EKİP ÜYELERİ (BOARD MEMBERS) İŞLEMLERİ
// ===========================================================================

// 2. Üyeleri Gruplayarak Ekrana Bas
function renderBoardMembers(members) {
  const container = document.getElementById('team-dynamic');
  if (!container) return;

  const isAdmin = document.body.classList.contains('admin-mode');
  container.innerHTML = ''; 
  
  container.style.display = 'block';

  const groups = {
    baskanlik: [],
    kurumsal: { direktor: [], koordinator: [] },
    egitim: { direktor: [], koordinator: [] },
    medya: { direktor: [], koordinator: [] },
    arge: { direktor: [], koordinator: [] },
    organizasyon: { direktor: [], koordinator: [] },
    denetim: []
  };

  members.forEach(m => {
    const role = (m.role || '').toLowerCase(); 
    
    // GÜNCELLEME 1: "direkt" kelimesini aratarak "Direktörü", "Direktör" vb. hepsini garanti kapsıyoruz
    const isDirector = role.includes('direkt');

    if (role.includes('başkan') || role.includes('baskan')) {
      groups.baskanlik.push(m);
    } else if (role.includes('kurumsal')) {
      if (isDirector) groups.kurumsal.direktor.push(m);
      else groups.kurumsal.koordinator.push(m);
    } else if (role.includes('eğitim') || role.includes('egitim')) {
      if (isDirector) groups.egitim.direktor.push(m);
      else groups.egitim.koordinator.push(m);
    } else if (role.includes('medya') || role.includes('tanıtım') || role.includes('tanitim')) {
      if (isDirector) groups.medya.direktor.push(m);
      else groups.medya.koordinator.push(m);
    } else if (role.includes('ar-ge') || role.includes('arge')) {
      if (isDirector) groups.arge.direktor.push(m);
      else groups.arge.koordinator.push(m);
    } else if (role.includes('organizasyon')) {
      if (isDirector) groups.organizasyon.direktor.push(m);
      else groups.organizasyon.koordinator.push(m);
    } else if (role.includes('denetim')) {
      groups.denetim.push(m);
    } else {
      groups.baskanlik.push(m); 
    }
  });

  const createCard = (m) => {
    const roleText = (m.role || '');
    const isPresident = roleText.toLowerCase().includes('başkan') && !roleText.toLowerCase().includes('yardımcı');
    const cardClass = isPresident ? 'team-card team-card-president' : 'team-card';
    
    const photoHtml = m.image_url 
        ? `<img src="${m.image_url}" alt="${escapeHTML(m.full_name)}" style="width: 100%; height: 100%; object-fit: cover;">`
        : `<div class="team-photo-placeholder"><i class="fa-solid fa-user"></i></div>`;

    let socialHtml = '';
    if (m.linkedin_url) socialHtml += `<a href="${m.linkedin_url}" target="_blank" rel="noopener" class="team-linkedin" title="LinkedIn"><i class="fa-brands fa-linkedin"></i></a>`;
    if (m.github_url) socialHtml += `<a href="${m.github_url}" target="_blank" rel="noopener" class="team-linkedin" style="margin-left: 8px;" title="GitHub"><i class="fa-brands fa-github"></i></a>`;

    return `
      <div class="${cardClass} scroll-reveal revealed" style="margin: 10px; position: relative;">
        <div class="team-photo">${photoHtml}</div>
        <h3 class="team-name">${escapeHTML(m.full_name)}</h3>
        <p class="team-role" style="color: var(--glow);">${escapeHTML(roleText)}</p>
        <div class="team-social" style="margin-top: 10px;">${socialHtml}</div>
        ${isAdmin ? `<button class="admin-delete-btn" data-id="${m.id}" title="Sil" style="position:absolute; top:12px; right:12px; background: rgba(239, 83, 80, 0.9); z-index: 10;">✕</button>` : ''}
      </div>
    `;
  };

  const renderSection = (title, topRow, bottomRow) => {
    let html = '';
    
    if ((topRow && topRow.length > 0) || (bottomRow && bottomRow.length > 0)) {
        // GÜNCELLEME 2: flex-direction: column ve width: 100% vererek iki satırı kesinlikle ALT ALTA inmeye zorluyoruz.
        html += `<div style="display: flex; flex-direction: column; align-items: center; width: 100%; margin-bottom: 50px;">`;
        
        if (title) {
            html += `<h3 style="width:100%; text-align:center; margin-bottom: 30px; font-size: 1.8rem; color: var(--glow); letter-spacing: 1px; text-transform: uppercase;">${title}</h3>`;
        }
        
        // ÜST SATIR (Direktörler)
        if (topRow && topRow.length > 0) {
          html += `<div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 20px; width: 100%; margin-bottom: 20px;">`;
          topRow.forEach(m => html += createCard(m));
          html += `</div>`;
        }
        
        // ALT SATIR (Koordinatörler)
        if (bottomRow && bottomRow.length > 0) {
          html += `<div style="display: flex; justify-content: center; flex-wrap: wrap; gap: 20px; width: 100%;">`;
          bottomRow.forEach(m => html += createCard(m));
          html += `</div>`;
        }
        
        html += `</div>`;
    }
    return html;
  };

  let finalHtml = '';

  groups.baskanlik.sort((a, b) => (a.role || '').length - (b.role || '').length);
  finalHtml += renderSection('', groups.baskanlik, null);

  finalHtml += renderSection('KURUMSAL İLİŞKİLER KOMİSYONU', groups.kurumsal.direktor, groups.kurumsal.koordinator);
  finalHtml += renderSection('EĞİTİM KOMİSYONU', groups.egitim.direktor, groups.egitim.koordinator);
  finalHtml += renderSection('MEDYA TANITIM KOMİSYONU', groups.medya.direktor, groups.medya.koordinator);
  finalHtml += renderSection('AR-GE KOMİSYONU', groups.arge.direktor, groups.arge.koordinator);
  finalHtml += renderSection('ORGANİZASYON KOMİSYONU', groups.organizasyon.direktor, groups.organizasyon.koordinator);
  finalHtml += renderSection('DENETİM KURULU', groups.denetim, null);

  container.innerHTML = finalHtml;

  if (isAdmin) {
    container.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Bu ekip üyesini silmek istediğinize emin misiniz?')) {
          await deleteBoardMember(btn.dataset.id);
        }
      });
    });
  }
}

// 5. Orijinal Üye Ekle Butonunu Aktifleştirme
document.getElementById('admin-add-member-btn')?.addEventListener('click', () => {
  if (document.querySelector('.admin-member-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-member-form';
  form.style.margin = "20px auto";
  form.style.maxWidth = "800px";
  form.innerHTML = `
    <h4>Yeni Ekip Üyesi Ekle</h4>
    <label>Ad Soyad *<input type="text" id="member-name" required /></label>
    <label>Görev (Rol) *<input type="text" id="member-role" required /></label>
    <label>Dönem *<input type="text" id="member-period" required /></label>
    
    <div style="background: rgba(79, 195, 247, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0;">
        <label style="color: var(--glow);">Fotoğraf Yükle (Bilgisayardan) <input type="file" id="member-file" accept="image/*" /></label>
        <div style="text-align: center; margin: 5px 0;">VEYA</div>
        <label>Fotoğraf URL / İkon <input type="text" id="member-image" placeholder="Resim linki veya ikon kodu" /></label>
    </div>

    <label>LinkedIn URL <input type="text" id="member-linkedin" /></label>
    <label>GitHub URL <input type="text" id="member-github" /></label>
    <div class="admin-form-actions">
      <button type="button" id="member-submit-btn" class="admin-btn">Ekle</button>
      <button type="button" id="member-cancel-btn" class="admin-btn admin-btn--secondary">İptal</button>
    </div>
  `;

  // Formu HTML'de zaten var olan orijinal butonun hemen üstünde aç
  const addBtn = document.getElementById('admin-add-member-btn');
  addBtn.parentNode.insertBefore(form, addBtn);

  document.getElementById('member-submit-btn').addEventListener('click', async () => {
    const submitBtn = document.getElementById('member-submit-btn');
    const fileInput = document.getElementById('member-file');
    let imageUrl = document.getElementById('member-image').value.trim();
    
    const full_name = document.getElementById('member-name').value.trim();
    const role = document.getElementById('member-role').value.trim();
    const period = document.getElementById('member-period').value.trim();

    if (!full_name || !role || !period) {
        return alert('Ad Soyad, Görev ve Dönem alanları zorunludur.');
    }

    if (fileInput.files.length > 0) {
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...';
        submitBtn.disabled = true;
        
        const uploadedUrl = await uploadImage(fileInput.files[0]);
        if (!uploadedUrl) {
            submitBtn.innerHTML = 'Ekle';
            submitBtn.disabled = false;
            return; 
        }
        imageUrl = uploadedUrl; 
    }

    const data = {
        full_name, role, period,
        image_url: imageUrl || null,
        linkedin_url: document.getElementById('member-linkedin').value.trim() || null,
        github_url: document.getElementById('member-github').value.trim() || null,
        order_index: 0
    };

    await addBoardMember(data);
    form.remove();
  });

  document.getElementById('member-cancel-btn').addEventListener('click', () => form.remove());
});

// ===========================================================================
// PROJELER (PROJECTS) İŞLEMLERİ
// ===========================================================================

// 1. Projeleri API'den Çek
async function fetchProjects() {
  try {
    const res = await fetch(`${API_URL}/projects`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Projeler çekilemedi:", err);
    return [];
  }
}

// 2. Projeleri Ekrana Bas
function renderProjects(projects) {
  const container = document.getElementById('projects-dynamic');
  if (!container) return;

  const isAdmin = document.body.classList.contains('admin-mode');
  container.innerHTML = ''; 

  projects.forEach(p => {
    // --- BURASI DEĞİŞTİ: Akıllı İkon / Resim Kontrolü ---
    let imageHtml = '';
    if (p.image_url && p.image_url.startsWith('fa-')) {
      // Eğer girilen değer 'fa-' ile başlıyorsa FontAwesome ikonu olarak bas
      imageHtml = `<i class="${escapeHTML(p.image_url)}"></i>`;
    } else if (p.image_url) {
      // Normal bir link girildiyse resim olarak bas
      imageHtml = `<img src="${p.image_url}" alt="${escapeHTML(p.title)}" style="width: 100%; height: 100%; object-fit: cover;">`;
    } else {
      // Hiçbir şey girilmediyse varsayılan robot ikonu çıksın
      imageHtml = `<i class="fa-solid fa-robot"></i>`;
    }
    // ---------------------------------------------------

    // Etiketleri (tags) ayırıp bas (Örn: "Python, FastAPI" -> <span>Python</span><span>FastAPI</span>)
    let tagsHtml = '';
    if (p.tags) {
      const tagsArray = p.tags.split(',').map(t => t.trim());
      tagsHtml = tagsArray.map(t => `<span>${escapeHTML(t)}</span>`).join('');
    }

    // GitHub ve Demo Linkleri
    let linksHtml = '';
    if (p.github_url) linksHtml += `<a href="${p.github_url}" target="_blank" style="color: var(--glow); font-size: 1.2rem; margin-right:12px;" title="GitHub"><i class="fa-brands fa-github"></i></a>`;
    if (p.demo_url) linksHtml += `<a href="${p.demo_url}" target="_blank" style="color: var(--glow); font-size: 1.2rem;" title="Canlı Demo"><i class="fa-solid fa-up-right-from-square"></i></a>`;

    const card = document.createElement('div');
    card.className = 'project-card scroll-reveal revealed'; // Animasyon takılmaması için revealed eklendi
    card.innerHTML = `
      <div class="project-image">
        ${imageHtml}
      </div>
      <div class="project-content" style="position: relative;">
        ${isAdmin ? `<button class="admin-delete-btn" data-id="${p.id}" title="Sil" style="position:absolute; top: -45px; right: 10px; background: rgba(239, 83, 80, 0.9); z-index: 10;">✕</button>` : ''}
        <h3>${escapeHTML(p.title)}</h3>
        <p>${escapeHTML(p.description)}</p>
        <div class="project-tech" style="margin-bottom: 15px;">
          ${tagsHtml}
        </div>
        <div class="project-links">
          ${linksHtml}
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  // Silme Butonlarına Olay Dinleyicisi Ekle
  if (isAdmin) {
    container.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Bu projeyi silmek istediğinize emin misiniz?')) {
          await deleteProject(btn.dataset.id);
        }
      });
    });
  }
}

// 3. Proje Sil
async function deleteProject(id) {
  const token = localStorage.getItem(LS_TOKEN_KEY);
  try {
    await fetch(`${API_URL}/projects/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadAndRenderAll();
  } catch (error) {
    alert("Proje silinemedi.");
  }
}

// 4. Proje Ekle
async function addProject(data) {
  const token = localStorage.getItem(LS_TOKEN_KEY);
  try {
    await fetch(`${API_URL}/projects/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    loadAndRenderAll();
  } catch (error) {
    alert("Proje eklenirken hata oluştu.");
  }
}

// 5. Admin İçin Proje Ekleme Formunu Aç
// Admin İçin Proje Ekleme Formunu Aç
document.getElementById('admin-add-project-btn')?.addEventListener('click', () => {
  if (document.querySelector('.admin-project-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-project-form';
  form.innerHTML = `
    <h4>Yeni Proje Ekle</h4>
    <label>Proje Adı *<input type="text" id="proj-title" required /></label>
    <label>Açıklama *<textarea id="proj-desc" rows="3" required></textarea></label>
    <label>Etiketler (Kullandığınız Teknolojiler, Virgülle ayırın) <input type="text" id="proj-tags" placeholder="Örn: Python, PyTorch, React" /></label>
    
    <!-- YENİ: DOSYA YÜKLEME ALANI -->
    <div style="background: rgba(79, 195, 247, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0;">
        <label style="color: var(--glow);">Proje Görseli Yükle <input type="file" id="proj-file" accept="image/*" /></label>
        <div style="text-align: center; margin: 5px 0;">VEYA</div>
        <label>URL / İkon <input type="text" id="proj-image" placeholder="Örn: fa-solid fa-server" /></label>
    </div>

    <label>GitHub URL <input type="text" id="proj-github" /></label>
    <label>Canlı Demo URL <input type="text" id="proj-demo" /></label>
    <div class="admin-form-actions">
      <button type="button" id="proj-submit-btn" class="admin-btn">Ekle</button>
      <button type="button" id="proj-cancel-btn" class="admin-btn admin-btn--secondary">İptal</button>
    </div>
  `;

  const container = document.getElementById('projects-dynamic');
  container.parentNode.insertBefore(form, container);

  // 'async' ekledik çünkü resim yüklenmesini bekleyeceğiz
  document.getElementById('proj-submit-btn').addEventListener('click', async () => {
    const submitBtn = document.getElementById('proj-submit-btn');
    const fileInput = document.getElementById('proj-file');
    let imageUrl = document.getElementById('proj-image').value.trim();

    const title = document.getElementById('proj-title').value.trim();
    const description = document.getElementById('proj-desc').value.trim();

    if (!title || !description) {
        return alert('Lütfen zorunlu alanları (Proje Adı ve Açıklama) doldurun.');
    }

    // EĞER BİLGİSAYARDAN DOSYA SEÇİLMİŞSE ÖNCE ONU YÜKLE
    if (fileInput.files.length > 0) {
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...';
        submitBtn.disabled = true;
        
        const uploadedUrl = await uploadImage(fileInput.files[0]);
        if (!uploadedUrl) {
            submitBtn.innerHTML = 'Ekle';
            submitBtn.disabled = false;
            return; // Yükleme başarısızsa durdur
        }
        imageUrl = uploadedUrl; // Yüklenen resmin linkini kullan
    }

    const data = {
        title: title,
        description: description,
        tags: document.getElementById('proj-tags').value.trim() || null,
        image_url: imageUrl || null,
        github_url: document.getElementById('proj-github').value.trim() || null,
        demo_url: document.getElementById('proj-demo').value.trim() || null,
        is_featured: true
    };

    await addProject(data);
    form.remove();
  });

  document.getElementById('proj-cancel-btn').addEventListener('click', () => form.remove());
});

// ===========================================================================
// DUYURULAR (ANNOUNCEMENTS / UPCOMING EVENTS) İŞLEMLERİ
// ===========================================================================

async function fetchAnnouncements() {
  try {
    const res = await fetch(`${API_URL}/announcements`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Duyurular çekilemedi:", err);
    return [];
  }
}

function renderAnnouncements(announcements) {
  const track = document.getElementById('announcements-dynamic-track');
  if (!track) return;

  const isAdmin = document.body.classList.contains('admin-mode');
  track.innerHTML = '';

  if (announcements.length === 0) {
    track.innerHTML = '<div style="color: var(--text-muted); padding: 20px;">Henüz bir duyuru eklenmemiş.</div>';
    return;
  }

  // Animasyon için duyuruları bir grup (wrapper) içine alıyoruz
  let groupHtml = '<div class="upcoming-group">';

  announcements.forEach(a => {
    // Gizlediğimiz ekstra verileri (JSON) content içinden çıkarıyoruz
    let details = { status: "Planlanan", icon: "fa-solid fa-star", date: "Belirtilmedi", location: "Belirtilmedi" };
    try {
      if (a.content && a.content.startsWith('{')) {
        details = JSON.parse(a.content);
      }
    } catch(e) { console.error("Duyuru detayı çözülemedi"); }

    groupHtml += `
      <div class="upcoming-card" style="position: relative;">
        ${isAdmin ? `<button class="admin-delete-btn" data-id="${a.id}" title="Sil" style="position:absolute; top: 16px; right: 16px; background: rgba(239, 83, 80, 0.9); z-index: 10;">✕</button>` : ''}
        <div class="upcoming-status">${escapeHTML(details.status)}</div>
        <h3><i class="${escapeHTML(details.icon)}"></i> ${escapeHTML(a.title)}</h3>
        <p>${escapeHTML(a.summary)}</p>
        <div class="upcoming-meta">
            <span><i class="fa-regular fa-calendar"></i> ${escapeHTML(details.date)}</span>
            <span><i class="fa-solid fa-location-dot"></i> ${escapeHTML(details.location)}</span>
        </div>
      </div>
    `;
  });

  groupHtml += '</div>';

  // CSS marquee (kayan yazı) animasyonunun kesintisiz döngü yapması için
  // aynı grubu arka arkaya 2 kez basıyoruz!
  track.innerHTML = groupHtml + groupHtml;

  // Silme Butonlarına Olay Dinleyicisi
  if (isAdmin) {
    track.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Bu duyuruyu silmek istediğinize emin misiniz?')) {
          await deleteAnnouncement(btn.dataset.id);
        }
      });
    });
  }
}

async function deleteAnnouncement(id) {
  const token = localStorage.getItem(LS_TOKEN_KEY);
  try {
    await fetch(`${API_URL}/announcements/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadAndRenderAll();
  } catch (error) {
    alert("Duyuru silinemedi.");
  }
}

async function addAnnouncement(data) {
  const token = localStorage.getItem(LS_TOKEN_KEY);
  try {
    await fetch(`${API_URL}/announcements/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    loadAndRenderAll();
  } catch (error) {
    alert("Duyuru eklenirken hata oluştu.");
  }
}

// Admin İçin Duyuru Ekleme Formunu Aç
document.getElementById('admin-add-announcement-btn')?.addEventListener('click', () => {
  if (document.querySelector('.admin-announcement-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-announcement-form';
  form.style.margin = "20px auto";
  form.style.maxWidth = "800px";
  form.innerHTML = `
    <h4>Yeni Duyuru / Etkinlik Ekle</h4>
    <label>Başlık *<input type="text" id="ann-title" placeholder="Örn: Datathon 2027" required /></label>
    <label>Açıklama *<textarea id="ann-summary" rows="3" placeholder="Kısa etkinlik açıklaması" required></textarea></label>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 10px;">
        <label>Durum <input type="text" id="ann-status" placeholder="Örn: Yakında veya Planlanan" value="Yakında" /></label>
        <label>İkon <input type="text" id="ann-icon" placeholder="Örn: fa-solid fa-database" value="fa-solid fa-star" /></label>
        <label>Tarih <input type="text" id="ann-date" placeholder="Örn: Aralık 2026" /></label>
        <label>Konum <input type="text" id="ann-location" placeholder="Örn: Kongre Merkezi" /></label>
    </div>
    <div class="admin-form-actions">
      <button type="button" id="ann-submit-btn" class="admin-btn">Ekle</button>
      <button type="button" id="ann-cancel-btn" class="admin-btn admin-btn--secondary">İptal</button>
    </div>
  `;

  // HATA BURADAYDI: Doğrudan Duyuru butonunun hemen üstünde açılmasını sağladık
  const addBtn = document.getElementById('admin-add-announcement-btn');
  addBtn.parentNode.insertBefore(form, addBtn);

  document.getElementById('ann-submit-btn').addEventListener('click', () => {
    const title = document.getElementById('ann-title').value.trim();
    const summary = document.getElementById('ann-summary').value.trim();
    
    if (!title || !summary) return alert('Lütfen zorunlu alanları doldurun.');

    const details = {
        status: document.getElementById('ann-status').value.trim(),
        icon: document.getElementById('ann-icon').value.trim(),
        date: document.getElementById('ann-date').value.trim(),
        location: document.getElementById('ann-location').value.trim()
    };

    const data = {
        title: title,
        slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now(),
        summary: summary,
        content: JSON.stringify(details),
        is_active: true
    };

    addAnnouncement(data);
    form.remove();
  });

  document.getElementById('ann-cancel-btn').addEventListener('click', () => form.remove());
}); 

// ===========================================================================
// İŞ BİRLİKLERİ (SPONSORS) İŞLEMLERİ
// ===========================================================================

async function fetchSponsors() {
  try {
    const res = await fetch(`${API_URL}/sponsors`);
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("Sponsorlar çekilemedi:", err);
    return [];
  }
}

// ===========================================================================
// İŞ BİRLİKLERİ (SPONSORS) İŞLEMLERİ
// ===========================================================================

function renderSponsors(sponsors) {
  const track = document.getElementById('sponsors-dynamic-track');
  if (!track) return;

  const isAdmin = document.body.classList.contains('admin-mode');
  track.innerHTML = '';

  if (sponsors.length === 0) {
    track.innerHTML = '<div style="color: var(--text-muted); padding: 20px; width: 100%; text-align: center;">Henüz bir iş birliği eklenmemiş.</div>';
    return;
  }

  // Logolar arasına boşluk ekliyoruz
  let groupHtml = '<div class="partners-group" style="display: flex; align-items: center; gap: 40px; padding: 20px;">';

  sponsors.forEach(s => {
    let logoHtml = '';
    
    // 1. ADIM: Logoyu kare bir beyaz kutu içine alıp orijinal renklerini (filter: none) zorunlu kılıyoruz
    // Arka planı beyaz (#ffffff) yerine siyah (#000000) yaptık
    if (s.logo_url && s.logo_url.startsWith('fa-')) {
      logoHtml = `<div style="width: 120px; height: 120px; background: #000000; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 3rem; color: #fff; box-shadow: 0 4px 15px rgba(0,0,0,0.5);"><i class="${escapeHTML(s.logo_url)}"></i></div>`;
    } else {
      logoHtml = `<img src="${escapeHTML(s.logo_url)}" alt="${escapeHTML(s.name)}" style="width: 120px; height: 120px; object-fit: contain; background: #000000; border-radius: 16px; padding: 15px; filter: none !important; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">`;
    }

    // 2. ADIM: Logonun hemen altına neon mavi (var(--glow)) şirket ismini ekliyoruz
    const innerContent = `
      <div style="display: flex; flex-direction: column; align-items: center; gap: 12px; transition: transform 0.3s ease;">
        ${logoHtml}
        <span style="color: var(--glow); font-size: 1.05rem; font-weight: 600; text-align: center; letter-spacing: 0.5px; white-space: nowrap;">${escapeHTML(s.name)}</span>
      </div>
    `;

    // Link varsa tıklanabilir yapıyoruz
    const contentHtml = s.website_url 
        ? `<a href="${escapeHTML(s.website_url)}" target="_blank" rel="noopener" style="text-decoration: none;">${innerContent}</a>` 
        : innerContent;

    groupHtml += `
      <div class="partner-item" style="position: relative;">
        ${isAdmin ? `<button class="admin-delete-btn" data-id="${s.id}" title="Sil" style="position:absolute; top: -10px; right: -10px; background: rgba(239, 83, 80, 0.9); z-index: 10; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px;">✕</button>` : ''}
        ${contentHtml}
      </div>
    `;
  });

  groupHtml += '</div>';

  // Animasyonun kesintisiz dönmesi için HTML'i iki kere basıyoruz[cite: 2]
  track.innerHTML = groupHtml + groupHtml;

  if (isAdmin) {
    track.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation(); // Butona tıklarken linke gitmesini engeller
        if (confirm('Bu iş birliğini silmek istediğinize emin misiniz?')) {
          await deleteSponsor(btn.dataset.id);
        }
      });
    });
  }
}

async function deleteSponsor(id) {
  const token = localStorage.getItem(LS_TOKEN_KEY);
  try {
    await fetch(`${API_URL}/sponsors/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    loadAndRenderAll();
  } catch (error) {
    alert("İş birliği silinemedi.");
  }
}

async function addSponsor(data) {
  const token = localStorage.getItem(LS_TOKEN_KEY);
  try {
    await fetch(`${API_URL}/sponsors/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });
    loadAndRenderAll();
  } catch (error) {
    alert("İş birliği eklenirken hata oluştu.");
  }
}

document.getElementById('admin-add-sponsor-btn')?.addEventListener('click', () => {
  if (document.querySelector('.admin-sponsor-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-sponsor-form';
  form.style.margin = "20px auto";
  form.style.maxWidth = "800px";
  form.innerHTML = `
    <h4>Yeni İş Birliği Ekle</h4>
    <label>Kurum/Şirket Adı *<input type="text" id="sp-name" required /></label>
    
    <!-- YENİ: DOSYA YÜKLEME ALANI EKLENDİ -->
    <div style="background: rgba(79, 195, 247, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0;">
        <label style="color: var(--glow);">Logo Yükle (Bilgisayardan) <input type="file" id="sp-file" accept="image/*" /></label>
        <div style="text-align: center; margin: 5px 0;">VEYA</div>
        <label>Logo URL / İkon <input type="text" id="sp-logo" placeholder="Resim linki veya ikon (Örn: fa-solid fa-building)" /></label>
    </div>

    <label>Website URL (İsteğe bağlı) <input type="text" id="sp-website" placeholder="Örn: https://www.hacettepe.edu.tr" /></label>
    <div class="admin-form-actions">
      <button type="button" id="sp-submit-btn" class="admin-btn">Ekle</button>
      <button type="button" id="sp-cancel-btn" class="admin-btn admin-btn--secondary">İptal</button>
    </div>
  `;

  const trackContainer = document.querySelector('.partners-grid');
  trackContainer.parentNode.insertBefore(form, trackContainer.nextSibling);

  // YENİ: "async" eklendi çünkü resim yükleme işlemini bekleyeceğiz
  document.getElementById('sp-submit-btn').addEventListener('click', async () => {
    const submitBtn = document.getElementById('sp-submit-btn');
    const fileInput = document.getElementById('sp-file');
    
    const name = document.getElementById('sp-name').value.trim();
    let logo_url = document.getElementById('sp-logo').value.trim();
    
    if (!name || (!logo_url && fileInput.files.length === 0)) {
        return alert('Lütfen Kurum Adı ve Logo alanlarını doldurun.');
    }

    // YENİ: EĞER DOSYA SEÇİLMİŞSE ÖNCE ONU YÜKLE
    if (fileInput.files.length > 0) {
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...';
        submitBtn.disabled = true;
        
        const uploadedUrl = await uploadImage(fileInput.files[0]);
        if (!uploadedUrl) {
            submitBtn.innerHTML = 'Ekle';
            submitBtn.disabled = false;
            return; // Yükleme başarısızsa işlemi durdur
        }
        logo_url = uploadedUrl; // Başarılıysa linki buraya yaz
    }

    const data = {
        name: name,
        logo_url: logo_url,
        website_url: document.getElementById('sp-website').value.trim() || null,
        tier: "Standart",
        order_index: 0,
        is_active: true
    };

    await addSponsor(data);
    form.remove();
  });

  document.getElementById('sp-cancel-btn').addEventListener('click', () => form.remove());
});

// ===========================================================================
// RESİM YÜKLEME (UPLOAD) İŞLEMLERİ
// ===========================================================================
async function uploadImage(file) {
  const token = localStorage.getItem(LS_TOKEN_KEY);
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_URL}/uploads/image`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
        // ÖNEMLİ: FormData gönderirken 'Content-Type' başlığını BİZ YAZMIYORUZ.
        // Tarayıcı bunu multipart/form-data olarak sınır (boundary) değerleriyle kendi ayarlar.
      },
      body: formData
    });

    if (!res.ok) {
      throw new Error("Resim yüklenemedi.");
    }

    const data = await res.json();
    // Backend "/static/uploads/resim.png" dönüyor, biz bunu tam URL'ye çeviriyoruz
    return API_URL + data.url; 
  } catch (error) {
    alert("Resim yüklenirken hata oluştu: " + error.message);
    return null;
  }
}

// ===========================================================================
// ETKİNLİKLER SLIDER İŞLEMLERİ
// ===========================================================================
function renderEventSlider(events) {
  const track = document.getElementById('event-slider-track');
  if (!track) return;

  // Sadece türü "Slider" olanları çekiyoruz
  const sliderEvents = events.filter(e => e.event_type.toLowerCase() === 'slider');

  if (sliderEvents.length === 0) {
    track.innerHTML = '<div style="color: var(--text-muted); text-align: center; width: 100%; padding: 40px;">Henüz gösterilecek bir slayt yok.</div>';
    return;
  }

  const isAdmin = document.body.classList.contains('admin-mode');
  track.innerHTML = '';

  sliderEvents.forEach(evt => {
    const slide = document.createElement('div');
    slide.className = 'slider-slide';
    slide.innerHTML = `
      <div class="event-banner" style="position: relative;">
        ${isAdmin ? `<button class="admin-delete-btn" data-id="${evt.id}" title="Sil" style="position:absolute; top: 16px; right: 16px; background: rgba(239, 83, 80, 0.9); z-index: 10;">✕</button>` : ''}
        <div class="event-banner-content">
          <h3>${escapeHTML(evt.title)}</h3>
          <p style="text-align: left;">${escapeHTML(evt.description)}</p>
        </div>
      </div>
    `;
    track.appendChild(slide);
  });

  if (isAdmin) {
    track.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Bu slaytı silmek istediğinize emin misiniz?')) {
          await deleteCalendarEvent(btn.dataset.id);
        }
      });
    });
  }

  // Slider animasyonu
  const oldPrev = document.getElementById('event-slider-prev');
  const oldNext = document.getElementById('event-slider-next');
  if (oldPrev && oldNext) {
      const newPrev = oldPrev.cloneNode(true);
      const newNext = oldNext.cloneNode(true);
      oldPrev.parentNode.replaceChild(newPrev, oldPrev);
      oldNext.parentNode.replaceChild(newNext, oldNext);

      let currentIndex = 0;
      const totalSlides = sliderEvents.length;
      const updateSlider = () => { track.style.transform = `translateX(-${currentIndex * 100}%)`; };

      newNext.addEventListener('click', () => {
          currentIndex++;
          if (currentIndex >= totalSlides) currentIndex = 0;
          updateSlider();
      });
      newPrev.addEventListener('click', () => {
          currentIndex--;
          if (currentIndex < 0) currentIndex = totalSlides - 1;
          updateSlider();
      });
  }
}

// Özel Slayt Ekleme Formu
function openSliderForm() {
  if (document.querySelector('.admin-slider-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-slider-form';
  form.innerHTML = `
    <h4>Yeni Slayt Ekle</h4>
    <label>Slayt Başlığı *<input type="text" id="slider-title" required /></label>
    <label>Slayt Açıklaması *<textarea id="slider-desc" rows="3" required></textarea></label>
    <div class="admin-form-actions">
      <button type="button" id="slider-submit-btn" class="admin-btn">Ekle</button>
      <button type="button" id="slider-cancel-btn" class="admin-btn admin-btn--secondary">İptal</button>
    </div>
  `;

  const addBtn = document.querySelector('.admin-add-slider-btn');
  addBtn?.parentNode?.insertBefore(form, addBtn.nextSibling);

  document.getElementById('slider-submit-btn').addEventListener('click', async () => {
    const title = document.getElementById('slider-title').value.trim();
    const description = document.getElementById('slider-desc').value.trim();
    
    if (!title || !description) return alert('Lütfen tüm zorunlu alanları doldurun.');

    // Veritabanı "date" ve "location" zorunlu tuttuğu için sahte veri (dummy) yolluyoruz
    const data = { 
        title: title, 
        description: description, 
        date: new Date().toISOString().split('T')[0], 
        location: "-", 
        event_type: "Slider" 
    };
    
    await addCalendarEvent(data); 
    form.remove();
  });

  document.getElementById('slider-cancel-btn').addEventListener('click', () => form.remove());
}

// Takvim Formunu Düzeltme (Eski haline getirme)
function openEventForm() {
  if (document.querySelector('.admin-event-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-event-form';
  form.innerHTML = `
    <h4>Yeni Etkinlik Ekle (Takvim)</h4>
    <label>Etkinlik Adı *<input type="text" id="event-name" required /></label>
    <label>Tarih *<input type="date" id="event-date" required /></label>
    <label>Konum *<input type="text" id="event-location" required /></label>
    <label>Tür
      <select id="event-type">
        <option value="Etkinlik">Etkinlik</option>
        <option value="Yarışma">Yarışma</option>
        <option value="Eğitim">Eğitim</option>
        <option value="Party">Party</option>
      </select>
    </label>
    <div class="admin-form-actions">
      <button type="button" id="event-submit-btn" class="admin-btn">Ekle</button>
      <button type="button" id="event-cancel-btn" class="admin-btn admin-btn--secondary">İptal</button>
    </div>
  `;

  const addBtn = document.querySelector('.admin-add-event-btn');
  addBtn?.parentNode?.insertBefore(form, addBtn.nextSibling);

  document.getElementById('event-submit-btn')?.addEventListener('click', () => {
    const title = document.getElementById('event-name')?.value.trim();
    const date = document.getElementById('event-date')?.value;
    const location = document.getElementById('event-location')?.value.trim();
    const event_type = document.getElementById('event-type')?.value;

    if (!title || !date || !location) return alert('Lütfen tüm zorunlu alanları doldurun.');

    addCalendarEvent({ title, date, location, event_type });
    form.remove();
  });

  document.getElementById('event-cancel-btn')?.addEventListener('click', () => form.remove());
}

// ===========================================================================
// YARIŞMA KARTLARI (KAYAN ANİMASYON) İŞLEMLERİ
// ===========================================================================
function renderCompetitions(events) {
  const track = document.getElementById('competitions-dynamic-track');
  if (!track) return;

  const compEvents = events.filter(e => e.event_type === 'YarismaKarti');
  const isAdmin = document.body.classList.contains('admin-mode');
  
  track.innerHTML = '';
  if (compEvents.length === 0) {
    track.innerHTML = '<div style="color: var(--text-muted); text-align: center; width: 100%; padding: 40px;">Henüz yarışma eklenmemiş.</div>';
    return;
  }

  // gap: 30px ile kartlar arasına net bir boşluk bırakıyoruz
  let groupHtml = '<div class="upcoming-group" style="display: flex; gap: 30px; padding: 10px;">';

  compEvents.forEach(evt => {
    const imageUrl = (evt.location && evt.location !== '-') ? evt.location : '';
    
    // GÜNCELLEME: Arka planı eski resimdeki gibi tam siyah (#000000) yaptık
    const imageHtml = imageUrl 
        ? `<img src="${escapeHTML(imageUrl)}" alt="${escapeHTML(evt.title)}" style="width: 100%; height: 200px; object-fit: contain; background: #000000; border-radius: 12px 12px 0 0; padding: 15px;">` 
        : `<div style="height:200px; background:#000000; border-radius:12px 12px 0 0; display:flex; align-items:center; justify-content:center;"><i class="fa-solid fa-trophy fa-3x" style="color:var(--glow)"></i></div>`;

    groupHtml += `
      <!-- flex: 0 0 350px; komutu kartın sıkışmasını ve üst üste binmesini KESİN engeller -->
      <div class="project-card" style="position: relative; width: 350px; flex: 0 0 350px; display: flex; flex-direction: column; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 16px; overflow: hidden;">
        ${isAdmin ? `<button class="admin-delete-btn" data-id="${evt.id}" title="Sil" style="position:absolute; top: 12px; right: 12px; background: rgba(239, 83, 80, 0.9); z-index: 10;">✕</button>` : ''}
        ${imageHtml}
        <div class="project-content" style="padding: 20px; text-align: left; flex: 1;">
          <h3 style="margin-bottom: 10px; color: #fff; font-size: 1.3rem;">${escapeHTML(evt.title)}</h3>
          <p style="font-size: 0.95rem; line-height: 1.5; color: var(--text-muted);">${escapeHTML(evt.description)}</p>
        </div>
      </div>
    `;
  });

  groupHtml += '</div>';

  // Kayan animasyonun kesintisiz dönmesi için aynı grubu iki kez basıyoruz
  track.innerHTML = groupHtml + groupHtml;

  if (isAdmin) {
    track.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Bu yarışmayı silmek istediğinize emin misiniz?')) {
          await deleteCalendarEvent(btn.dataset.id);
        }
      });
    });
  }
}

// YARIŞMA EKLEME FORMU
document.getElementById('admin-add-competition-btn')?.addEventListener('click', () => {
  if (document.querySelector('.admin-competition-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-competition-form';
  form.style.margin = "20px auto";
  form.style.maxWidth = "800px";
  form.innerHTML = `
    <h4>Yeni Yarışma Ekle</h4>
    <label>Yarışma Adı *<input type="text" id="comp-title" required /></label>
    <label>Açıklama (Detaylı Metin) *<textarea id="comp-desc" rows="5" required></textarea></label>
    <div style="background: rgba(79, 195, 247, 0.1); padding: 10px; border-radius: 8px; margin: 10px 0;">
        <label style="color: var(--glow);">Yarışma Logosu Yükle <input type="file" id="comp-file" accept="image/*" /></label>
        <div style="text-align: center; margin: 5px 0;">VEYA</div>
        <label>Görsel URL <input type="text" id="comp-image" placeholder="https://..." /></label>
    </div>
    <div class="admin-form-actions">
      <button type="button" id="comp-submit-btn" class="admin-btn">Ekle</button>
      <button type="button" id="comp-cancel-btn" class="admin-btn admin-btn--secondary">İptal</button>
    </div>
  `;

  const trackContainer = document.getElementById('competitions-dynamic-track').parentNode;
  trackContainer.parentNode.insertBefore(form, trackContainer.nextSibling);

  document.getElementById('comp-submit-btn').addEventListener('click', async () => {
    const submitBtn = document.getElementById('comp-submit-btn');
    const fileInput = document.getElementById('comp-file');
    let imageUrl = document.getElementById('comp-image').value.trim();

    const title = document.getElementById('comp-title').value.trim();
    const description = document.getElementById('comp-desc').value.trim();

    if (!title || !description) return alert('Lütfen zorunlu alanları doldurun.');

    if (fileInput.files.length > 0) {
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...';
        submitBtn.disabled = true;
        const uploadedUrl = await uploadImage(fileInput.files[0]);
        if (!uploadedUrl) {
            submitBtn.innerHTML = 'Ekle';
            submitBtn.disabled = false;
            return;
        }
        imageUrl = uploadedUrl;
    }

    // Görüntü linkini location alanına saklıyoruz
    const data = {
        title: title,
        description: description,
        date: new Date().toISOString().split('T')[0], // Mecburi alan için sahte tarih
        location: imageUrl || '-', // Location içine image URL gömüyoruz
        event_type: 'YarismaKarti'
    };

    await addCalendarEvent(data); // Takvim ekleme API'sini gizlice yarışma için kullanıyoruz
    form.remove();
  });

  document.getElementById('comp-cancel-btn').addEventListener('click', () => form.remove());
});

// ===========================================================================
// YENİ ADMİN EKLEME İŞLEMLERİ
// ===========================================================================
function openAddAdminForm() {
  if (document.querySelector('.admin-add-admin-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-add-admin-form';
  form.style.position = 'fixed';
  form.style.top = '50%';
  form.style.left = '50%';
  form.style.transform = 'translate(-50%, -50%)';
  form.style.zIndex = '10000';
  form.style.background = 'var(--bg-card)';
  form.style.padding = '25px';
  form.style.borderRadius = '12px';
  form.style.boxShadow = '0 10px 30px rgba(0,0,0,0.8)';
  form.style.border = '1px solid var(--border-color)';
  form.style.width = '90%';
  form.style.maxWidth = '350px';

  form.innerHTML = `
    <h4 style="margin-bottom: 20px; color: var(--glow); text-align: center;"><i class="fa-solid fa-user-shield"></i> Yeni Admin Kaydı</h4>
    <label style="display: block; margin-bottom: 10px;">Kullanıcı Adı *<input type="text" id="new-admin-username" required style="width: 100%; margin-top: 5px; background: var(--bg-body); border: 1px solid var(--border-color); color: #fff; padding: 8px; border-radius: 6px;"/></label>
    <label style="display: block; margin-bottom: 20px;">Şifre *<input type="password" id="new-admin-password" required style="width: 100%; margin-top: 5px; background: var(--bg-body); border: 1px solid var(--border-color); color: #fff; padding: 8px; border-radius: 6px;"/></label>
    <div class="admin-form-actions" style="display: flex; gap: 10px; justify-content: center;">
      <button type="button" id="new-admin-submit" class="admin-btn btn-primary" style="flex: 1;">Oluştur</button>
      <button type="button" id="new-admin-cancel" class="admin-btn admin-btn--secondary" style="flex: 1;">İptal</button>
    </div>
  `;

  document.body.appendChild(form);

  document.getElementById('new-admin-submit').addEventListener('click', async () => {
    const username = document.getElementById('new-admin-username').value.trim();
    const password = document.getElementById('new-admin-password').value.trim();

    if (!username || !password) return alert('Lütfen kullanıcı adı ve şifre girin.');

    const submitBtn = document.getElementById('new-admin-submit');
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';
    submitBtn.disabled = true;

    const token = localStorage.getItem(LS_TOKEN_KEY);
    try {
      // DİKKAT: Backend'de yeni admin ekleme yolun "/users/register" veya "/auth/register" olabilir. Kendi API'ne göre burayı düzeltmen gerekebilir.
      const response = await fetch(`${API_URL}/users/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ username: username, password: password })
      });

      if (response.ok) {
        alert('Yeni admin başarıyla eklendi!');
        form.remove();
      } else {
        const err = await response.json();
        alert('Admin eklenirken hata oluştu: ' + (err.detail || 'Bilinmeyen hata'));
        submitBtn.innerHTML = 'Oluştur';
        submitBtn.disabled = false;
      }
    } catch (error) {
      alert('Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.');
      submitBtn.innerHTML = 'Oluştur';
      submitBtn.disabled = false;
    }
  });

  document.getElementById('new-admin-cancel').addEventListener('click', () => form.remove());
}

// Adminleri Listeleme ve Silme Modalı (En alta ekleyebilirsin)
async function openAdminListForm() {
  if (document.querySelector('.admin-list-form')) return;

  const form = document.createElement('div');
  form.className = 'admin-inline-form admin-list-form';
  form.style.position = 'fixed';
  form.style.top = '50%';
  form.style.left = '50%';
  form.style.transform = 'translate(-50%, -50%)';
  form.style.zIndex = '10000';
  form.style.background = 'var(--bg-card)';
  form.style.padding = '25px';
  form.style.borderRadius = '12px';
  form.style.boxShadow = '0 10px 30px rgba(0,0,0,0.8)';
  form.style.border = '1px solid var(--border-color)';
  form.style.width = '90%';
  form.style.maxWidth = '500px';
  form.style.maxHeight = '70vh';
  form.style.overflowY = 'auto';

  form.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h4 style="color: var(--glow); margin: 0;"><i class="fa-solid fa-users-gear"></i> Kayıtlı Adminler</h4>
        <button type="button" id="close-admin-list" class="admin-btn admin-btn--secondary" style="padding: 5px 10px;">✕</button>
    </div>
    <div id="admin-list-container" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="text-align: center; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Yükleniyor...</div>
    </div>
  `;

  document.body.appendChild(form);
  document.getElementById('close-admin-list').addEventListener('click', () => form.remove());

  const container = document.getElementById('admin-list-container');
  const token = localStorage.getItem(LS_TOKEN_KEY);

  try {
    const res = await fetch(`${API_URL}/users`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (!res.ok) throw new Error("Veri çekilemedi");
    const admins = await res.json();
    
    container.innerHTML = ''; 
    
    admins.forEach(admin => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.background = 'rgba(255,255,255,0.05)';
        row.style.padding = '10px 15px';
        row.style.borderRadius = '8px';
        
        row.innerHTML = `
            <div>
                <div style="font-weight: 600; color: #fff;">${admin.email}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted);">Role: ${admin.role}</div>
            </div>
            <button class="admin-delete-btn" title="Sil" style="background: rgba(239, 83, 80, 0.2); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; color: #ef5350; border: none; cursor: pointer;">✕</button>
        `;

        // ÇÖZÜM: Silme olayını doğrudan bu satırın (row) içine bağladık
        const deleteBtn = row.querySelector('.admin-delete-btn');
        deleteBtn.addEventListener('click', async () => {
            if (confirm('Bu admini silmek istediğinize emin misiniz?')) {
                deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
                try {
                    const deleteRes = await fetch(`${API_URL}/users/${admin.id}`, {
                        method: 'DELETE',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                    
                    if (deleteRes.ok) {
                        row.remove(); // Şimdi satırı sorunsuz bulup anında ekrandan silecek
                    } else {
                        const err = await deleteRes.json();
                        alert("Silinemedi: " + (err.detail || "Bilinmeyen hata"));
                        deleteBtn.innerHTML = '✕';
                    }
                } catch (e) {
                    alert("Sunucuyla bağlantı koptu veya bir hata oluştu.");
                    deleteBtn.innerHTML = '✕';
                }
            }
        });

        container.appendChild(row);
    });

  } catch (error) {
    container.innerHTML = '<div style="color: #ef5350;">Admin listesi yüklenemedi.</div>';
  }
}