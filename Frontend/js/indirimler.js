/**
 * Hacettepe AI Club — Üye İndirimleri Sayfası (indirimler.html)
 *
 * Sorumlulukları:
 *  - Tema (açık / karanlık) tercihini ana sayfayla paylaşmak
 *  - Hacettepe e-posta adresiyle üyelik doğrulama ekranı
 *  - Anlaşmalı kafelerin ve indirim oranlarının listelenmesi
 *
 * Bu sayfa kasıtlı olarak app.js / admin.js yüklemez: o dosyalar ana sayfadaki
 * hamburger menü, slider, sponsor ızgarası gibi burada bulunmayan DOM
 * öğelerine bağlıdır. Bu yüzden ihtiyaç duyulan az sayıda yardımcı burada
 * yeniden tanımlanır.
 */

'use strict';

// ==================== GLOBAL CONFIGURATION ====================
// app.js ile aynı adres; iki dosya birlikte yüklenmediği için çakışma olmaz.
const API_URL = 'https://api.hacettepeaiclub.com';

// ==================== UTILITIES ====================
function escapeHTML(str = '') {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
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

/** order_index (yoksa id) sırasına göre karşılaştırma. */
function byOrderIndex(a, b) {
    return (a.order_index ?? 0) - (b.order_index ?? 0) || (a.id ?? 0) - (b.id ?? 0);
}

/**
 * DİKKAT: /indirim/i gibi bir regex burada çalışmaz. JS'in büyük/küçük harf
 * eşlemesi Türkçe'ye duyarsız olduğu için "İndirim" (noktalı büyük İ) "i" ile
 * eşleşmez. Bu yüzden ad, hem Türkçe hem İngilizce kurallarıyla küçültülüp
 * karşılaştırılır ("İndirim" → tr, "INDIRIM" → en).
 */
function isDiscountCategory(category) {
    if (!category) return false;

    // Sütun mevcutsa admin panelindeki kutu tek yetkilidir.
    if (typeof category.is_discount === 'boolean') return category.is_discount;

    // Sütun henüz yoksa (göç çalıştırılmamışsa) kategori adına bakılır.
    const name = category.name || '';
    return name.toLocaleLowerCase('tr').includes('indirim')
        || name.toLocaleLowerCase('en').includes('indirim');
}

/**
 * Bir kaydın indirim oranı. Asıl alan `discount`; ancak veritabanında bu sütun
 * henüz yoksa (göç çalıştırılmamışsa) admin oranı serbest `tier` alanına
 * yazmış olabilir. Bu yüzden tier YALNIZCA oran gibi görünüyorsa (rakam ya da
 * % içeriyorsa) yedek olarak kullanılır; "Altın", "Platin" gibi seviye
 * değerleri indirim sanılmaz.
 */
function sponsorDiscountValue(item) {
  const explicit = (item.discount || '').trim();
  if (explicit) return explicit;

  const tier = (item.tier || '').trim();
  return /[\d%]/.test(tier) ? tier : '';
}

/**
 * İndirim alanı serbest metindir: "15", "%15", "%10 (kahvede)" gibi değerler
 * gelebilir. Yalın sayılar okunabilirlik için "%" ile gösterilir; geri kalan
 * her şey admin ne yazdıysa öyle bırakılır.
 */
function formatDiscount(raw) {
    const value = (raw || '').trim();
    if (!value) return '';
    if (/^\d+([.,]\d+)?$/.test(value)) return `%${value}`;
    return value;
}

// ==================== TEMA ====================
/**
 * Tema tercihi ana sayfayla aynı localStorage anahtarını kullanır.
 * Bu sayfada hero bölümü olmadığı için, karanlık mod kapalıysa açık tema
 * (`past-hero`) doğrudan uygulanır.
 */
class ThemeToggle {
    constructor() {
        this.button = document.getElementById('theme-toggle');
        this.isDarkMode = localStorage.getItem('dark-mode') === 'enabled';

        this.button?.addEventListener('click', () => {
            this.isDarkMode = !this.isDarkMode;
            localStorage.setItem('dark-mode', this.isDarkMode ? 'enabled' : 'disabled');
            this.apply();
        });

        this.apply();
    }

    apply() {
        const icon = this.button?.querySelector('i');
        document.body.classList.toggle('dark-mode-forced', this.isDarkMode);
        document.body.classList.toggle('past-hero', !this.isDarkMode);

        if (icon) icon.className = this.isDarkMode ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
        if (this.button) {
            this.button.title = this.isDarkMode ? 'Açık Modu Aç' : 'Karanlık Modu Aç';
        }
    }
}

// ==================== HEADER SCROLL ====================
function initHeaderScroll() {
    const header = document.getElementById('header');
    if (!header) return;

    const update = () => header.classList.toggle('header-scrolled', window.scrollY > 50);
    window.addEventListener('scroll', update, { passive: true });
    update();
}

// ==================== ÜYE DOĞRULAMA ====================
/**
 * "Beni hatırla" kaydı. Sayfa %99 telefondan kullanılacağı ve kasa önünde
 * her seferinde e-posta yazmak yavaş olduğu için son doğrulanan adres bu
 * cihazda saklanır. Saklanan şey yalnızca adres/ad; yetki belirteci değildir —
 * sayfa açıldığında sunucuya tekrar sorulur, yani üyelikten çıkan biri
 * eski kayıt yüzünden "aktif üye" görünmez.
 */
const LS_MEMBER_KEY = 'hacettepe_ai_member';

/** Saklanan kayıt bu süreden eskiyse yok sayılır (30 gün). */
const MEMBER_MEMORY_MS = 30 * 24 * 60 * 60 * 1000;

function readRememberedMember() {
    try {
        const stored = JSON.parse(localStorage.getItem(LS_MEMBER_KEY) || 'null');
        if (!stored || !stored.email) return null;
        if (stored.savedAt && Date.now() - stored.savedAt > MEMBER_MEMORY_MS) {
            localStorage.removeItem(LS_MEMBER_KEY);
            return null;
        }
        return stored;
    } catch (err) {
        return null;
    }
}

function rememberMember(email) {
    try {
        localStorage.setItem(LS_MEMBER_KEY, JSON.stringify({ email, savedAt: Date.now() }));
    } catch (err) {
        /* Gizli sekmede localStorage yazılamaz; hatırlamadan devam edilir. */
    }
}

function forgetMember() {
    try {
        localStorage.removeItem(LS_MEMBER_KEY);
    } catch (err) { /* yok sayılır */ }
}

/**
 * Sunucuya üyelik sorar.
 *
 * Girdi hem tam e-posta hem yalın kullanıcı adı olabilir; normalleştirmeyi
 * sunucu yapar (büyük/küçük harf, boşluk, eksik alan adı).
 *
 * @return {Promise<{is_member: boolean, full_name: string|null}>}
 */
async function verifyMembership(email) {
    const res = await fetch(`${API_URL}/members/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
    });

    let data = null;
    try {
        data = await res.json();
    } catch (err) { /* gövde boş ya da JSON değil */ }

    if (!res.ok) {
        if (res.status === 429) {
            throw new Error('Çok fazla deneme yapıldı. Lütfen bir dakika sonra tekrar deneyin.');
        }
        // Sunucunun hata biçimi: { message } (main.py'deki handler), bazı
        // durumlarda FastAPI'nin varsayılanı: { detail }.
        throw new Error(data?.message || data?.detail || 'Doğrulama yapılamadı. Lütfen tekrar deneyin.');
    }

    return data || { is_member: false, full_name: null };
}

class MembershipVerifier {
    constructor() {
        this.form = document.getElementById('discount-verify-form');
        this.input = document.getElementById('discount-email');
        this.button = document.getElementById('discount-verify-btn');
        this.message = document.getElementById('discount-verify-message');
        this.rememberBox = document.getElementById('discount-remember');

        this.result = document.getElementById('discount-result');
        this.resultIcon = document.getElementById('discount-result-icon');
        this.resultStatus = document.getElementById('discount-result-status');
        this.resultName = document.getElementById('discount-result-name');
        this.resultHint = document.getElementById('discount-result-hint');
        this.resetBtn = document.getElementById('discount-result-reset');

        if (!this.form || !this.input) return;

        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.submit();
        });
        this.input.addEventListener('input', () => this.clearMessage());
        this.resetBtn?.addEventListener('click', () => this.reset());

        this.restore();
    }

    /** Hatırlanan adres varsa kutuyu doldurur ve sessizce yeniden doğrular. */
    restore() {
        const stored = readRememberedMember();
        if (!stored) return;

        this.input.value = stored.email;
        this.submit({ silent: true });
    }

    clearMessage() {
        if (!this.message) return;
        this.message.textContent = '';
        this.message.classList.remove('is-error');
    }

    showError(text) {
        if (!this.message) return;
        this.message.textContent = text;
        this.message.classList.add('is-error');
    }

    /**
     * @param {object} options
     * @param {boolean} options.silent Hatırlanan adresle otomatik deneme;
     *        başarısız olursa kullanıcıya hata gösterilmez, form açık kalır.
     */
    async submit({ silent = false } = {}) {
        const email = this.input.value.trim();

        if (!email) {
            this.showError('Lütfen e-posta adresinizi girin.');
            this.input.focus();
            return;
        }

        this.clearMessage();
        this.button.disabled = true;
        const originalLabel = this.button.innerHTML;
        this.button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Kontrol ediliyor...';

        try {
            const result = await verifyMembership(email);

            if (result.is_member && this.rememberBox?.checked !== false) {
                // Kullanıcının yazdığı hâli değil, sunucunun döndürdüğü
                // normalleştirilmiş kullanıcı adını sakla; böylece sonraki
                // ziyarette kutuda "ABDULKADIR..." gibi bir şey görünmez.
                rememberMember(result.nickname
                    ? `${result.nickname}@hacettepe.edu.tr`
                    : email);
            } else if (!result.is_member) {
                forgetMember();
            }

            this.showResult(result);
        } catch (error) {
            forgetMember();
            if (!silent) this.showError(error.message);
        } finally {
            this.button.disabled = false;
            this.button.innerHTML = originalLabel;
        }
    }

    showResult({ is_member: isMember, full_name: fullName }) {
        this.result.classList.toggle('is-not-member', !isMember);

        if (this.resultIcon) {
            this.resultIcon.className = isMember
                ? 'fa-solid fa-circle-check'
                : 'fa-solid fa-circle-xmark';
        }

        if (this.resultStatus) {
            this.resultStatus.textContent = isMember ? 'Aktif Üyemiz' : 'Üyelik Bulunamadı';
        }

        if (this.resultName) {
            this.resultName.textContent = isMember ? (fullName || '') : '';
            this.resultName.hidden = !isMember;
        }

        if (this.resultHint) {
            this.resultHint.hidden = isMember;
            this.resultHint.textContent = isMember
                ? ''
                : 'Bu e-posta adresi güncel üye listemizde görünmüyor. '
                  + 'Yeni üye olduysanız listenin güncellenmesini bekleyin ya da bizimle iletişime geçin.';
        }

        this.form.setAttribute('hidden', '');
        this.result.removeAttribute('hidden');
    }

    reset() {
        forgetMember();
        this.result.setAttribute('hidden', '');
        this.form.removeAttribute('hidden');
        this.input.value = '';
        this.clearMessage();
        this.input.focus();
    }
}

// ==================== ANLAŞMALI KAFELER ====================
/**
 * Ana sayfadaki iş birlikleri bölümüyle aynı kaynaktan (/sponsors +
 * /sponsor-categories) beslenir. Ayrı bir kafe listesi tutulmadığı için
 * admin panelinden eklenen her indirim sponsoru bu sayfada da anında görünür.
 */
async function loadDiscounts() {
    const container = document.getElementById('discount-list');
    if (!container) return;

    const [sponsors, categories] = await Promise.all([
        apiGet('/sponsors'),
        apiGet('/sponsor-categories'),
    ]);

    const discountCategories = categories.filter(isDiscountCategory).sort(byOrderIndex);

    if (discountCategories.length === 0) {
        container.innerHTML = emptyDiscountHtml(
            'Henüz bir indirim anlaşması eklenmemiş.',
            'Yeni anlaşmalar eklendikçe burada görünecek.'
        );
        return;
    }

    const groups = discountCategories
        .map(category => ({
            category,
            items: sponsors.filter(s => s.category_id === category.id).sort(byOrderIndex),
        }))
        .filter(group => group.items.length > 0);

    if (groups.length === 0) {
        container.innerHTML = emptyDiscountHtml(
            'Henüz bir anlaşmalı kafe eklenmemiş.',
            'Yeni anlaşmalar eklendikçe burada görünecek.'
        );
        return;
    }

    container.innerHTML = groups.map(renderDiscountGroup).join('');
}

function emptyDiscountHtml(title, detail) {
    return `<div class="discount-empty">
        <i class="fa-solid fa-mug-hot"></i>
        <p class="discount-empty-title">${escapeHTML(title)}</p>
        <p class="discount-empty-detail">${escapeHTML(detail)}</p>
    </div>`;
}

/**
 * Tek bir indirim kategorisini başlığıyla birlikte basar. Birden fazla indirim
 * kategorisi (ör. "Kafe İndirimleri", "Kırtasiye İndirimleri") tanımlanmışsa
 * her biri kendi başlığı altında listelenir.
 */
function renderDiscountGroup({ category, items }) {
    // Tek bir indirim kategorisi varsa başlık gereksiz tekrar olur.
    const heading = `<h3 class="discount-group-title">${escapeHTML(category.name)}</h3>`;
    return `<div class="discount-group">
        ${heading}
        <ul class="discount-cards">${items.map(renderDiscountCard).join('')}</ul>
    </div>`;
}

function renderDiscountCard(item) {
    const logoHtml = item.logo_url && item.logo_url.startsWith('fa-')
        ? `<i class="${escapeHTML(item.logo_url)}"></i>`
        : item.logo_url
            ? `<img src="${escapeHTML(item.logo_url)}" alt="${escapeHTML(item.name)}" loading="lazy">`
            : `<i class="fa-solid fa-mug-saucer"></i>`;

    const discount = formatDiscount(sponsorDiscountValue(item));
    // "%15" gibi kısa oranlar iri puntoyla; "%10 (kahvede)" gibi serbest
    // metinler daha küçük puntoyla basılır, aksi halde rozet kartın yarısını
    // kaplayıp kurum adını sıkıştırıyor.
    const rateClass = discount.replace(/\s+/g, '').length > 6
        ? 'discount-rate discount-rate--long'
        : 'discount-rate';
    const badgeHtml = discount
        ? `<span class="${rateClass}">${escapeHTML(discount)}<small>indirim</small></span>`
        : `<span class="discount-rate discount-rate--empty">Üyelere<small>özel</small></span>`;

    const captionHtml = item.caption
        ? `<span class="discount-card-caption">${escapeHTML(item.caption)}</span>`
        : '';

    const nameHtml = item.website_url
        ? `<a href="${escapeHTML(item.website_url)}" target="_blank" rel="noopener">${escapeHTML(item.name)}</a>`
        : escapeHTML(item.name);

    return `<li class="discount-card">
        <div class="discount-card-logo">${logoHtml}</div>
        <div class="discount-card-body">
            <span class="discount-card-name">${nameHtml}</span>
            ${captionHtml}
        </div>
        ${badgeHtml}
    </li>`;
}

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
    new ThemeToggle();
    initHeaderScroll();
    new MembershipVerifier();
    loadDiscounts();

    document.body.classList.add('loaded');

    const bgVideo = document.getElementById('neural-canvas');
    if (bgVideo) bgVideo.playbackRate = 2.0;
});
