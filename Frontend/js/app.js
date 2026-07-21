/**
 * Hacettepe AI Club - Main Application JavaScript
 * Handles: Navigation, Hamburger Menu, Scroll Animations, Stats Counter, 
 * Contact Dropdown, Scroll-to-top, Smooth Scroll
 */

'use strict';

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

// ==================== EVENT SLIDER ====================
class EventSlider {
    constructor() {
        this.track = document.getElementById('event-slider-track');
        this.prevBtn = document.getElementById('event-slider-prev');
        this.nextBtn = document.getElementById('event-slider-next');

        if (!this.track || !this.prevBtn || !this.nextBtn) return;

        this.slides = this.track.querySelectorAll('.slider-slide');
        this.totalSlides = this.slides.length;
        this.currentIndex = 0;

        this.bindEvents();
    }

    bindEvents() {
        this.nextBtn.addEventListener('click', () => {
            this.currentIndex++;
            if (this.currentIndex >= this.totalSlides) {
                this.currentIndex = 0; // loop back to first
            }
            this.updateSlider();
        });

        this.prevBtn.addEventListener('click', () => {
            this.currentIndex--;
            if (this.currentIndex < 0) {
                this.currentIndex = this.totalSlides - 1; // loop to last
            }
            this.updateSlider();
        });

        // Handle resize to update translation value if necessary
        window.addEventListener('resize', () => this.updateSlider());
    }

    updateSlider() {
        // Since each slide is min-width: 100%, we translate by currentIndex * 100%
        this.track.style.transform = `translateX(-${this.currentIndex * 100}%)`;
    }
}

// ==================== INITIALIZE ====================
document.addEventListener('DOMContentLoaded', () => {
    // Core functionality
    new HamburgerMenu();
    new ContactDropdown();
    new HeaderScroll();
    new SmoothScroll();
    new ScrollReveal();
    new StatsCounter();
    new ActiveSection();
    new EventSlider();

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
