/**
 * Hacettepe AI Club - Main Application JavaScript
 * Handles: Navigation, Hamburger Menu, Scroll Animations, Stats Counter, 
 * Contact Dropdown, Scroll-to-top, Smooth Scroll
 */

'use strict';

// ==================== GLOBAL CONFIGURATION ====================
// Canlıya alınca burası sunucu IP/Domain'i olacak.
// app.js ilk yüklenen dosya olduğu için tüm modüller bu değeri kullanabilir.
const API_URL = 'http://127.0.0.1:8000';

// ==================== DOM REFERENCES ====================
const DOM = {
    header: document.getElementById('header'),
    hamburgerBtn: document.getElementById('hamburger-btn'),
    sideMenu: document.getElementById('side-menu'),
    sideMenuOverlay: document.getElementById('side-menu-overlay'),
    sideMenuClose: document.getElementById('side-menu-close'),
    sideMenuLinks: document.querySelectorAll('.side-menu-link'),
    contactDropdownWrapper: document.getElementById('contact-dropdown-wrapper'),
    contactDropdown: document.getElementById('contact-dropdown'),
    btnContact: document.getElementById('btn-contact'),
    scrollTopBtn: document.getElementById('scroll-top'),
    heroSection: document.getElementById('hero'),
    statNumbers: document.querySelectorAll('.stat-number'),
    scrollRevealElements: document.querySelectorAll('.scroll-reveal'),
};

// ==================== HAMBURGER MENU ====================
class HamburgerMenu {
    constructor() {
        this.isOpen = false;
        this.bindEvents();
    }

    bindEvents() {
        // Open menu
        DOM.hamburgerBtn.addEventListener('click', () => this.toggle());

        // Close menu via overlay
        DOM.sideMenuOverlay.addEventListener('click', () => this.close());

        // Close menu via X button
        DOM.sideMenuClose?.addEventListener('click', () => this.close());

        // Close menu when a link is clicked
        DOM.sideMenuLinks.forEach(link => {
            link.addEventListener('click', () => this.close());
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) {
                this.close();
            }
        });
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        this.isOpen = true;
        DOM.hamburgerBtn.classList.add('active');
        DOM.sideMenu.classList.add('open');
        DOM.sideMenuOverlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    close() {
        this.isOpen = false;
        DOM.hamburgerBtn.classList.remove('active');
        DOM.sideMenu.classList.remove('open');
        DOM.sideMenuOverlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ==================== CONTACT DROPDOWN ====================
class ContactDropdown {
    constructor() {
        this.isOpen = false;
        this.bindEvents();
    }

    bindEvents() {
        // Toggle on click (mobile-friendly)
        DOM.btnContact.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Show on hover (desktop)
        DOM.contactDropdownWrapper.addEventListener('mouseenter', () => {
            this.open();
        });

        DOM.contactDropdownWrapper.addEventListener('mouseleave', () => {
            this.close();
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!DOM.contactDropdownWrapper.contains(e.target)) {
                this.close();
            }
        });
    }

    toggle() {
        this.isOpen ? this.close() : this.open();
    }

    open() {
        this.isOpen = true;
        DOM.contactDropdown.classList.add('show');
    }

    close() {
        this.isOpen = false;
        DOM.contactDropdown.classList.remove('show');
    }
}

// ==================== HEADER SCROLL EFFECT ====================
class HeaderScroll {
    constructor() {
        this.lastScroll = 0;
        this.handleScroll = this.handleScroll.bind(this);
        window.addEventListener('scroll', this.handleScroll, { passive: true });

        // Initialize Theme Toggle
        this.btnThemeToggle = document.getElementById('theme-toggle');
        const savedMode = localStorage.getItem('dark-mode');
        // Default to dark-mode disabled (false), meaning light mode on scroll is active
        this.isDarkMode = savedMode === 'enabled';

        if (this.btnThemeToggle) {
            this.btnThemeToggle.addEventListener('click', () => {
                this.isDarkMode = !this.isDarkMode;
                localStorage.setItem('dark-mode', this.isDarkMode ? 'enabled' : 'disabled');
                this.updateTheme();
            });
        }

        this.updateTheme();
    }

    updateTheme() {
        const icon = this.btnThemeToggle ? this.btnThemeToggle.querySelector('i') : null;
        if (this.isDarkMode) {
            document.body.classList.add('dark-mode-forced');
            document.body.classList.remove('past-hero');
            if (icon) {
                icon.className = 'fa-solid fa-moon';
            }
            if (this.btnThemeToggle) {
                this.btnThemeToggle.title = 'Açık Modu Aç';
            }
        } else {
            document.body.classList.remove('dark-mode-forced');
            if (icon) {
                icon.className = 'fa-solid fa-sun';
            }
            if (this.btnThemeToggle) {
                this.btnThemeToggle.title = 'Karanlık Modu Aç';
            }
            this.handleScroll(); // apply scroll-based light theme
        }
    }

    handleScroll() {
        const scrollY = window.scrollY;

        // Add scrolled class for background blur
        if (scrollY > 50) {
            DOM.header.classList.add('header-scrolled');
        } else {
            DOM.header.classList.remove('header-scrolled');
        }

        // Toggle light theme when scrolled past hero section and dark mode is not forced
        const heroHeight = DOM.heroSection ? DOM.heroSection.offsetHeight : window.innerHeight;
        if (scrollY >= heroHeight - 80 && !this.isDarkMode) {
            document.body.classList.add('past-hero');
        } else {
            document.body.classList.remove('past-hero');
        }

        // Show/hide scroll-to-top button
        if (scrollY > 500) {
            DOM.scrollTopBtn.classList.add('visible');
        } else {
            DOM.scrollTopBtn.classList.remove('visible');
        }

        this.lastScroll = scrollY;
    }
}

// ==================== SMOOTH SCROLL ====================
class SmoothScroll {
    constructor() {
        this.bindEvents();
    }

    bindEvents() {
        // Handle all anchor links with hash
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', (e) => {
                const targetId = anchor.getAttribute('href');
                if (targetId === '#') return;

                e.preventDefault();
                const target = document.querySelector(targetId);
                if (target) {
                    const headerHeight = DOM.header.offsetHeight;
                    const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;

                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });

        // Scroll-to-top button
        DOM.scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}

// ==================== SCROLL REVEAL ANIMATIONS ====================
class ScrollReveal {
    constructor() {
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const el = entry.target;
                        const delay = el.dataset.delay || 0;
                        setTimeout(() => {
                            el.classList.add('revealed');
                        }, parseInt(delay));
                        this.observer.unobserve(el);
                    }
                });
            },
            {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            }
        );

        // Add stagger delays to grid children
        this.addStaggerDelays();

        // Observe all elements
        DOM.scrollRevealElements.forEach(el => {
            this.observer.observe(el);
        });
    }

    addStaggerDelays() {
        const grids = document.querySelectorAll('.card-grid, .team-grid, .commission-grid, .competition-grid, .upcoming-grid, .partners-grid');
        grids.forEach(grid => {
            const children = grid.querySelectorAll('.scroll-reveal');
            children.forEach((child, index) => {
                child.dataset.delay = index * 100;
            });
        });
    }
}

// ==================== STATS COUNTER ANIMATION ====================
class StatsCounter {
    constructor() {
        this.animated = false;
        this.observer = new IntersectionObserver(
            (entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting && !this.animated) {
                        this.animated = true;
                        this.animateAll();
                        this.observer.disconnect();
                    }
                });
            },
            { threshold: 0.5 }
        );

        // Observe the hero stats container
        const statsContainer = document.querySelector('.hero-stats');
        if (statsContainer) {
            this.observer.observe(statsContainer);
        }
    }

    animateAll() {
        DOM.statNumbers.forEach(num => {
            const target = parseInt(num.dataset.target);
            this.animateNumber(num, target);
        });
    }

    animateNumber(element, target) {
        const duration = 2000;
        const startTime = performance.now();
        const start = 0;

        const step = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Ease out cubic
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const current = Math.floor(start + (target - start) * easeOut);

            element.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                element.textContent = target;
            }
        };

        requestAnimationFrame(step);
    }
}

// ==================== ACTIVE SECTION HIGHLIGHTING ====================
class ActiveSection {
    constructor() {
        this.sections = document.querySelectorAll('section[id]');
        this.menuLinks = document.querySelectorAll('.side-menu-link');

        window.addEventListener('scroll', () => this.highlightActive(), { passive: true });
    }

    highlightActive() {
        const scrollY = window.scrollY;
        const headerHeight = DOM.header.offsetHeight;

        this.sections.forEach(section => {
            const sectionTop = section.offsetTop - headerHeight - 100;
            const sectionBottom = sectionTop + section.offsetHeight;

            if (scrollY >= sectionTop && scrollY < sectionBottom) {
                const id = section.getAttribute('id');
                this.menuLinks.forEach(link => {
                    link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
                });
            }
        });
    }
}

// ==================== TYPED TEXT EFFECT (Hero) ====================
class TypedText {
    constructor() {
        const highlight = document.querySelector('.hero-highlight');
        if (!highlight) return;

        const text = highlight.textContent;
        highlight.textContent = '';
        highlight.style.borderRight = '3px solid #ffffff';
        highlight.style.animation = 'typewriter-blink 0.8s infinite';

        let i = 0;
        const type = () => {
            if (i < text.length) {
                highlight.textContent += text.charAt(i);
                i++;
                setTimeout(type, 60 + Math.random() * 40);
            } else {
                // Remove cursor after typing is complete
                setTimeout(() => {
                    highlight.style.borderRight = 'none';
                    highlight.style.animation = 'none';
                }, 1500);
            }
        };

        // Start typing after a short delay
        setTimeout(type, 800);
    }
}

// ==================== PARALLAX EFFECT ====================
class ParallaxEffect {
    constructor() {
        this.handleScroll = this.handleScroll.bind(this);
        window.addEventListener('scroll', this.handleScroll, { passive: true });
    }

    handleScroll() {
        const scrollY = window.scrollY;
        const hero = DOM.heroSection;
        if (hero && scrollY < window.innerHeight) {
            const content = hero.querySelector('.hero-content');
            if (content) {
                content.style.transform = `translateY(${scrollY * 0.3}px)`;
                content.style.opacity = 1 - (scrollY / (window.innerHeight * 0.8));
            }
        }
    }
}

// ==================== MARQUEE ENGINE ====================
/**
 * Ölçüme dayalı, sonsuz ve boşluksuz kayan şerit.
 *
 * Sorun: eski sürüm HTML'i iki kez basıp `translateX(-50%)` uyguluyordu.
 * Bu yöntem yalnızca içerik ekrandan geniş olduğunda ve tam iki kopya
 * bulunduğunda düzgün çalışır; 2 elemanlı listelerde boşluk, 15 elemanlı
 * listelerde ise okunamayacak kadar yüksek hız oluşuyordu.
 *
 * Yeni yöntem:
 *  - Orijinal elemanların toplam genişliği ölçülür.
 *  - Ekrana sığıyorsa animasyon çalışmaz, içerik ortalanır (statik mod).
 *  - Sığmıyorsa ekranı dolduracak kadar kopya üretilir ve tam olarak
 *    bir tur (bir kopya genişliği) kaydırılır → dikişsiz döngü.
 *  - Süre = mesafe / hız olduğu için hız eleman sayısından bağımsızdır.
 */
class Marquee {
    static instances = new WeakMap();

    /** Sayfadaki tüm [data-marquee] alanlarını hazırlar. */
    static initAll() {
        document.querySelectorAll('[data-marquee]').forEach(el => Marquee.get(el));
    }

    /** İlgili alanı (varsa) getirir, yoksa oluşturur. */
    static get(el) {
        if (!el) return null;
        let instance = Marquee.instances.get(el);
        if (!instance) {
            instance = new Marquee(el);
            Marquee.instances.set(el, instance);
        }
        return instance;
    }

    /** İçerik JS ile yeniden basıldıktan sonra çağrılır. */
    static refresh(trackOrId) {
        const track = typeof trackOrId === 'string'
            ? document.getElementById(trackOrId)
            : trackOrId;
        const root = track?.closest('[data-marquee]');
        Marquee.get(root)?.layout();
    }

    constructor(root) {
        this.root = root;
        this.track = root.querySelector('.marquee-track');
        // Saniyedeki piksel cinsinden hız; eleman sayısı değişse de sabit kalır.
        this.speed = parseFloat(root.dataset.marqueeSpeed) || 45;
        if (root.dataset.marqueeReverse === 'true') {
            root.classList.add('is-reverse');
        }

        this.layout = this.layout.bind(this);

        if (typeof ResizeObserver !== 'undefined') {
            this.observer = new ResizeObserver(() => this.scheduleLayout());
            this.observer.observe(this.root);
        } else {
            window.addEventListener('resize', () => this.scheduleLayout(), { passive: true });
        }

        this.layout();
    }

    scheduleLayout() {
        clearTimeout(this._timer);
        this._timer = setTimeout(this.layout, 120);
    }

    /** Kopyaları temizleyip yalnızca orijinal elemanları bırakır. */
    resetClones() {
        if (!this.track) return [];
        this.track.querySelectorAll('[data-marquee-clone]').forEach(node => node.remove());
        return Array.from(this.track.children);
    }

    layout() {
        if (!this.track) return;

        const originals = this.resetClones();
        this.root.classList.remove('is-animating', 'is-static');
        this.track.style.removeProperty('--marquee-shift');
        this.track.style.removeProperty('--marquee-duration');

        // İçerik yoksa yapacak bir şey de yok.
        if (originals.length === 0) return;

        // Admin modunda animasyon yerine elle kaydırma kullanılır: kopya üretilmez.
        if (document.body.classList.contains('admin-mode')) return;

        const styles = getComputedStyle(this.track);
        const gap = parseFloat(styles.columnGap || styles.gap) || 0;

        const groupWidth = originals.reduce(
            (total, node) => total + node.getBoundingClientRect().width + gap,
            0
        );
        const viewportWidth = this.root.clientWidth;

        // Ekrana sığıyorsa: sabit ve ortalanmış göster.
        if (groupWidth <= viewportWidth + 1 || groupWidth === 0) {
            this.root.classList.add('is-static');
            return;
        }

        // Ekranı kesintisiz doldurmak için yeterli sayıda kopya üret.
        const copiesNeeded = Math.ceil(viewportWidth / groupWidth) + 1;
        const fragment = document.createDocumentFragment();
        for (let copy = 0; copy < copiesNeeded; copy++) {
            originals.forEach(node => {
                const clone = node.cloneNode(true);
                clone.setAttribute('data-marquee-clone', 'true');
                clone.setAttribute('aria-hidden', 'true');
                // Kopyalardaki interaktif öğeler klavye/ekran okuyucu için pasifleştirilir.
                clone.querySelectorAll('a, button, input, [tabindex]').forEach(el => {
                    el.setAttribute('tabindex', '-1');
                });
                fragment.appendChild(clone);
            });
        }
        this.track.appendChild(fragment);

        // Tam bir kopya boyu kaydırılır → döngü dikişsiz kapanır.
        this.track.style.setProperty('--marquee-shift', `${groupWidth}px`);
        this.track.style.setProperty('--marquee-duration', `${groupWidth / this.speed}s`);
        this.root.classList.add('is-animating');
    }
}

window.Marquee = Marquee;

// ==================== EVENT SLIDER ====================
class EventSlider {
    constructor() {
        this.track = document.getElementById('event-slider-track');
        this.prevBtn = document.getElementById('event-slider-prev');
        this.nextBtn = document.getElementById('event-slider-next');

        if (!this.track || !this.prevBtn || !this.nextBtn) return;

        this.currentIndex = 0;
        this.bindEvents();
        this.update();
    }

    get totalSlides() {
        return this.track.querySelectorAll('.slider-slide').length;
    }

    bindEvents() {
        this.nextBtn.addEventListener('click', () => this.go(1));
        this.prevBtn.addEventListener('click', () => this.go(-1));
        window.addEventListener('resize', () => this.update(), { passive: true });
    }

    go(step) {
        const total = this.totalSlides;
        if (total === 0) return;
        // Modulo ile hem ileri hem geri yönde güvenli döngü
        this.currentIndex = (this.currentIndex + step + total) % total;
        this.update();
    }

    update() {
        const total = this.totalSlides;
        if (total === 0) {
            this.track.style.transform = 'translateX(0)';
            return;
        }
        if (this.currentIndex >= total) this.currentIndex = 0;
        this.track.style.transform = `translateX(-${this.currentIndex * 100}%)`;
        // Tek slayt varsa okları gizle
        const single = total <= 1;
        this.prevBtn.style.visibility = single ? 'hidden' : 'visible';
        this.nextBtn.style.visibility = single ? 'hidden' : 'visible';
    }
}

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
    // Core functionality
    window.hamburgerMenu = new HamburgerMenu();
    new ContactDropdown();
    new HeaderScroll();
    new SmoothScroll();
    new ScrollReveal();
    new StatsCounter();
    new ActiveSection();
    // Tek bir slider örneği tutulur; admin.js içerik bastıktan sonra bunu yeniler.
    window.eventSlider = new EventSlider();
    Marquee.initAll();

    // Visual effects
    new TypedText();
    new ParallaxEffect();

    // Preloader - remove after content loads
    document.body.classList.add('loaded');

    // Set background video playback rate to 1.5x
    const bgVideo = document.getElementById('neural-canvas');
    if (bgVideo) {
        bgVideo.playbackRate = 2.0;
    }

    console.log('🤖 Hacettepe AI Club website initialized successfully!');
});

// ==========================================
// E-BÜLTEN (NEWSLETTER) İŞLEMLERİ
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Header'daki buton ile yan menüdeki buton aynı modalı açar
    const newsletterTriggers = [
        document.getElementById('nav-newsletter-btn'),
        document.getElementById('side-menu-newsletter-btn'),
    ].filter(Boolean);
    const newsletterModal = document.getElementById('newsletter-modal');
    const closeNewsletterBtn = document.getElementById('close-newsletter-modal');
    const newsletterSubmit = document.getElementById('newsletter-submit-btn');
    const newsletterEmail = document.getElementById('newsletter-email');
    const newsletterMessage = document.getElementById('newsletter-message');

    // Modalı Aç
    if (newsletterModal) {
        newsletterTriggers.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                window.hamburgerMenu?.close(); // Yan menüden açıldıysa menüyü kapat
                newsletterModal.classList.add('active'); // active sınıfı ile CSS geçişini tetikliyoruz
                document.body.classList.add('modal-open'); // Arkadaki sayfanın kaymasını engeller
                if (newsletterMessage) newsletterMessage.textContent = '';
                if (newsletterEmail) newsletterEmail.value = '';
            });
        });
    }

    // Modalı Kapat
    if (closeNewsletterBtn && newsletterModal) {
        closeNewsletterBtn.addEventListener('click', () => {
            newsletterModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        });
    }

    // Dışarı tıklayınca kapat
    window.addEventListener('click', (e) => {
        if (e.target === newsletterModal) {
            newsletterModal.classList.remove('active');
            document.body.classList.remove('modal-open');
        }
    });

    // Abone Ol Butonuna Tıklama
    if (newsletterSubmit) {
        newsletterSubmit.addEventListener('click', async () => {
            const email = newsletterEmail.value.trim();
            
            // Basit e-posta formatı kontrolü
            if (!email || !email.includes('@') || !email.includes('.')) {
                newsletterMessage.style.color = '#ef5350'; 
                newsletterMessage.textContent = 'Lütfen geçerli bir e-posta adresi girin.';
                return;
            }

            // Butonu yükleniyor durumuna al
            newsletterSubmit.disabled = true;
            newsletterSubmit.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> İşleniyor...';

            try {
                const res = await fetch(`${API_URL}/newsletter/subscribe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email })
                });
                
                const data = await res.json();
                
                if (res.ok) {
                    newsletterMessage.style.color = '#66bb6a'; 
                    newsletterMessage.textContent = data.message || 'Başarıyla abone oldunuz!';
                    newsletterEmail.value = '';
                    
                    // 2 saniye sonra pencereyi otomatik kapat
                    setTimeout(() => { 
                        newsletterModal.classList.remove('active'); 
                        document.body.classList.remove('modal-open');
                    }, 2000);
                } else {
                    newsletterMessage.style.color = '#ef5350';
                    newsletterMessage.textContent = data.detail || 'Bir hata oluştu.';
                }
            } catch (err) {
                newsletterMessage.style.color = '#ef5350';
                newsletterMessage.textContent = 'Sunucuya bağlanılamadı. Lütfen daha sonra tekrar deneyin.';
            } finally {
                newsletterSubmit.disabled = false;
                newsletterSubmit.textContent = 'Abone Ol';
            }
        });
    }
});