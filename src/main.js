import { supabase } from './supabaseClient.js'
import { speakWithElevenLabs } from './elevenLabsTTS.js'
import { initPortfolioDrilldown } from './portfolioDrilldown.js'
import './style.css'

// Initialize Portfolio Drill-down after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initPortfolioDrilldown);
} else {
  initPortfolioDrilldown();
}

// ==========================================
// Page Loader Logic
// ==========================================
window.addEventListener('load', () => {
  const loader = document.getElementById('page-loader');
  if (loader) {
    // Small delay to ensure smooth transition
    setTimeout(() => {
      loader.classList.add('hidden');
    }, 100);
  }
});

// Fallback: Force remove loader after 3s if something hangs
setTimeout(() => {
  const loader = document.getElementById('page-loader');
  if (loader && !loader.classList.contains('hidden')) {
    loader.classList.add('hidden');
  }
}, 3000);

// ==========================================
// Hero Role & Description Text Rotation (Simple Fade)
// ==========================================
const rolesData = [
  {
    role: "Creative Developer",
    desc: "I build interactive, high-performance web experiences that blend modern code with stunning aesthetics."
  },
  {
    role: "UI/UX Designer",
    desc: "I craft intuitive, user-centric interfaces focused on engaging user journeys and seamless interactions."
  },
  {
    role: "Graphic Designer",
    desc: "I create compelling visuals and brand identities that communicate your message with impact and style."
  },
  {
    role: "Video Editor",
    desc: "I produce dynamic, engaging video content tailored for modern platforms, from cutting to post-production."
  },
  {
    role: "Social Media Manager",
    desc: "I strategize, manage, and grow digital communities with data-driven content and engaging campaigns."
  },
  {
    role: "Digital Marketer",
    desc: "I drive growth through targeted campaigns, SEO optimization, and strategic online marketing initiatives."
  }
];

let roleIndex = 0;
const heroCopyStackEl = document.querySelector('.hero-copy-stack');
const heroHeadingGroupEl = document.querySelector('.hero-heading-group');
const heroHeadingEl = document.querySelector('.hero-heading');
const heroRoleWrapEl = document.querySelector('.hero-role-wrap');
const heroLeadEl = document.querySelector('.hero-lead');
const heroRoleEl = document.getElementById('hero-role');
const heroDescEl = document.getElementById('hero-desc');

if (heroCopyStackEl && heroHeadingGroupEl && heroHeadingEl && heroRoleWrapEl && heroLeadEl && heroRoleEl && heroDescEl) {
  const lockHeroTextHeights = () => {
    const copyProbe = heroCopyStackEl.cloneNode(true);
    const roleProbeWrap = heroRoleWrapEl.cloneNode(true);
    const descProbe = heroLeadEl.cloneNode(true);
    const isMobileHeroLock = window.matchMedia('(max-width: 480px)').matches;

    [copyProbe, roleProbeWrap, descProbe].forEach((probe) => {
      probe.style.position = 'absolute';
      probe.style.visibility = 'hidden';
      probe.style.pointerEvents = 'none';
      probe.style.left = '-9999px';
      probe.style.top = '0';
      probe.style.opacity = '1';
      probe.style.transform = 'none';
      probe.querySelectorAll?.('.animate-up').forEach((node) => node.classList.remove('animate-up'));
    });

    copyProbe.style.width = `${heroCopyStackEl.getBoundingClientRect().width}px`;
    copyProbe.style.maxWidth = `${heroCopyStackEl.getBoundingClientRect().width}px`;
    copyProbe.style.minHeight = '0';

    roleProbeWrap.style.width = `${heroRoleWrapEl.getBoundingClientRect().width}px`;
    roleProbeWrap.style.maxWidth = `${heroRoleWrapEl.getBoundingClientRect().width}px`;
    roleProbeWrap.style.minHeight = '0';

    descProbe.style.width = `${heroLeadEl.getBoundingClientRect().width}px`;
    descProbe.style.maxWidth = `${heroLeadEl.getBoundingClientRect().width}px`;
    descProbe.style.minHeight = '0';

    document.body.append(copyProbe, roleProbeWrap, descProbe);

    let maxCopyHeight = 0;
    let maxRoleHeight = 0;
    let maxDescHeight = 0;

    rolesData.forEach(({ role, desc }) => {
      const roleNode = copyProbe.querySelector('#hero-role');
      const descNode = copyProbe.querySelector('#hero-desc');
      const roleOnlyNode = roleProbeWrap.querySelector('#hero-role');
      const descOnlyNode = descProbe.querySelector('#hero-desc');

      if (roleNode) roleNode.textContent = role;
      if (descNode) descNode.textContent = desc;
      if (roleOnlyNode) roleOnlyNode.textContent = role;
      if (descOnlyNode) descOnlyNode.textContent = desc;

      maxCopyHeight = Math.max(maxCopyHeight, copyProbe.getBoundingClientRect().height);
      maxRoleHeight = Math.max(maxRoleHeight, roleProbeWrap.getBoundingClientRect().height);
      maxDescHeight = Math.max(maxDescHeight, descProbe.getBoundingClientRect().height);
    });

    copyProbe.remove();
    roleProbeWrap.remove();
    descProbe.remove();

    heroCopyStackEl.style.minHeight = `${Math.ceil(maxCopyHeight)}px`;
    heroHeadingEl.style.minHeight = '0';
    heroHeadingGroupEl.style.minHeight = '0';
    heroRoleWrapEl.style.minHeight = isMobileHeroLock ? `${Math.ceil(maxRoleHeight)}px` : '0';
    heroRoleEl.style.minHeight = '0';
    heroDescEl.style.minHeight = isMobileHeroLock ? `${Math.ceil(maxDescHeight)}px` : '0';
  };

  heroRoleEl.style.transition = 'opacity 0.8s ease-in-out';
  heroDescEl.style.transition = 'opacity 0.8s ease-in-out';

  // Set the initial description on load
  heroDescEl.textContent = rolesData[0].desc;
  lockHeroTextHeights();

  let heroResizeFrame = null;
  window.addEventListener('resize', () => {
    if (heroResizeFrame) cancelAnimationFrame(heroResizeFrame);
    heroResizeFrame = requestAnimationFrame(() => {
      lockHeroTextHeights();
    });
  });

  const VISIBLE_DURATION = 8000;
  const ROLE_EXIT_DELAY = 300;
  const EXIT_DURATION = 800;
  const DESC_ENTER_DELAY = 600;
  const CYCLE_DURATION = VISIBLE_DURATION + EXIT_DURATION + ROLE_EXIT_DELAY + DESC_ENTER_DELAY;
  
  // Fix for Vite HMR stacking intervals
  if (window.heroRotationInterval) {
    clearInterval(window.heroRotationInterval);
  }
  
  window.heroRotationInterval = setInterval(() => {
    // Reverse the exit timing: description fades first, then the role.
    heroDescEl.style.opacity = '0';
    
    setTimeout(() => {
      heroRoleEl.style.opacity = '0';
    }, ROLE_EXIT_DELAY);
    
    setTimeout(() => {
      roleIndex = (roleIndex + 1) % rolesData.length;
      
      // Update both text contents at the same time so layout adjusts while invisible
      heroRoleEl.textContent = rolesData[roleIndex].role;
      heroDescEl.textContent = rolesData[roleIndex].desc;
      
      // Fade in the Role immediately
      heroRoleEl.style.opacity = '1';
      
      // Delay the Description fade-in by 600ms
      setTimeout(() => {
        heroDescEl.style.opacity = '1';
      }, DESC_ENTER_DELAY);
      
    }, EXIT_DURATION + ROLE_EXIT_DELAY); // Wait for the staggered fade-out to finish
  }, CYCLE_DURATION);
}

// Dynamic Content: Fetch Brands
async function fetchBrands() {
  const tickerContent = document.getElementById('ticker-content');
  if (!tickerContent) return;

  const { data: brands, error } = await supabase
    .from('brands')
    .select('name, logo_url')
    .order('id', { ascending: true });

  if (error) {
    console.error('Error fetching brands:', error);
    tickerContent.innerHTML = '<div class="ticker-item">Error loading brands</div>';
    return;
  }

  if (brands && brands.length > 0) {
    // Generate HTML for one set
    const brandsHtml = brands.map((brand, index) => `
      <div class="ticker-item" data-brand-index="${index}">
        <img
          src="${brand.logo_url}"
          alt="${brand.name}"
          class="brand-logo"
          title="${brand.name}"
          loading="eager"
          decoding="async"
          draggable="false"
          referrerpolicy="no-referrer"
        >
      </div>
    `).join('');

    // Duplicate enough times so small/mobile screens still have a continuous marquee.
    tickerContent.innerHTML = brandsHtml.repeat(6);
    tickerContent.classList.remove('is-running');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tickerContent.classList.add('is-running');
      });
    });
  } else {
    tickerContent.innerHTML = '<div class="ticker-item">No brands found</div>';
  }
}

// Call on load
fetchBrands();

// ==========================================
// Dynamic Content: Fetch Location Card (Bento Hover Transform)
// ==========================================
function preloadImage(src) {
  if (!src) return Promise.resolve('');

  const image = new Image();
  image.decoding = 'async';
  image.src = src;

  if (image.decode) {
    return image.decode()
      .catch(() => null)
      .then(() => src);
  }

  return new Promise((resolve) => {
    if (image.complete) {
      resolve(src);
      return;
    }

    image.onload = () => resolve(src);
    image.onerror = () => resolve(src);
  });
}

async function transitionCardImage(imageEl, nextSrc, delay = 300) {
  if (!imageEl || !nextSrc) return;

  if (imageEl.dataset.currentSrc === nextSrc) {
    imageEl.classList.remove('fade-out');
    return;
  }

  imageEl.classList.add('fade-out');
  await new Promise(resolve => setTimeout(resolve, delay));

  const loadedSrc = await preloadImage(nextSrc);
  imageEl.src = loadedSrc;
  imageEl.dataset.currentSrc = loadedSrc;
  imageEl.classList.remove('fade-out');
}

async function fetchLocationCard() {
  // Target the new bento hover transform card
  const locationBento = document.getElementById('location-bento');
  if (!locationBento) return;

  const { data, error } = await supabase
    .from('location_card')
    .select('label, title, description, image_url')
    .limit(1)
    .single();

  if (error) {
    console.error('Error fetching location card:', error);
    return; // Keep default HTML content
  }

  if (data) {
    // Update bento hover state elements
    const image = document.getElementById('location-bento-image');
    const labelEl = document.getElementById('location-bento-label');
    const titleEl = document.getElementById('location-bento-title');
    const descEl = document.getElementById('location-bento-desc');

    if (image && data.image_url) {
      const loadedSrc = await preloadImage(data.image_url);
      image.src = loadedSrc;
      image.dataset.currentSrc = loadedSrc;
      image.alt = data.title;
    }
    if (labelEl) labelEl.textContent = data.label;
    if (titleEl) titleEl.textContent = data.title;
    if (descEl) descEl.textContent = data.description;
  }
}

// ==========================================
// Dynamic Content: Fetch Community Cards (Bento Hover Transform)
// ==========================================
let communityCardsData = []; // Store fetched data for rotation
let communityRotationInterval = null;
let communityCurrentIndex = 0;
let communitySwipeStartX = 0;
let communitySwipeStartY = 0;
let communitySwipeActive = false;
let communitySwipeTriggered = false;

function isCommunitySwipeLayout() {
  return window.matchMedia('(max-width: 1023px)').matches;
}

function setCompactBentoActive(card, isActive) {
  if (!card) return;

  card.classList.toggle('compact-bento-active', isActive);

  if (card.id === 'community-bento') {
    card.classList.toggle('community-touch-active', isActive);

    if (isActive) {
      startBentoRotation();
    } else {
      stopBentoRotation();
    }
  }
}

function closeCompactBentoCards(exceptCard = null) {
  if (!isCommunitySwipeLayout()) return;

  ['location-bento', 'community-bento'].forEach((id) => {
    const card = document.getElementById(id);
    if (!card || card === exceptCard) return;
    setCompactBentoActive(card, false);
  });
}

function syncCommunityBentoMode() {
  const locationBento = document.getElementById('location-bento');
  const communityBento = document.getElementById('community-bento');
  if (!communityBento || !locationBento) return;

  communityBento.classList.toggle('community-touch-mode', isCommunitySwipeLayout());
  locationBento.classList.toggle('compact-bento-touch-mode', isCommunitySwipeLayout());

  if (isCommunitySwipeLayout()) {
    setCompactBentoActive(locationBento, false);
    setCompactBentoActive(communityBento, false);
  } else {
    locationBento.classList.remove('compact-bento-active', 'compact-bento-touch-mode');
    communityBento.classList.remove('compact-bento-active', 'community-touch-active', 'community-touch-mode');
    stopBentoRotation();
  }
}

async function fetchCommunityCards() {
  const communityBento = document.getElementById('community-bento');
  if (!communityBento) return;

  const { data, error } = await supabase
    .from('community_cards')
    .select('label, title, description, image_url, gradient_class')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching community cards:', error);
    return; // Keep default HTML content
  }

  if (data && data.length > 0) {
    communityCardsData = data;

    // Get the rotating content container
    const rotatingContainer = document.getElementById('community-bento-content');
    if (!rotatingContainer) return;

    // Clear existing content and build new rotating items
    rotatingContainer.innerHTML = data.map((item, index) => `
      <div class="bento-rotating-item ${index === 0 ? 'active' : ''}" 
           data-index="${index}"
           data-image="${item.image_url || 'https://placehold.co/600x400/222222/ffffff?text=Community'}">
        <div class="bento-hover-label">${item.label}</div>
        <div class="bento-hover-title">${item.title}</div>
        <div class="bento-hover-desc">${item.description}</div>
      </div>
    `).join('');

    // Set initial image
    const image = document.getElementById('community-bento-image');
    if (image && data[0].image_url) {
      const loadedSrc = await preloadImage(data[0].image_url);
      image.src = loadedSrc;
      image.dataset.currentSrc = loadedSrc;
    }

    indicatorDotsGenerated = false;
    generateIndicatorDots();
    syncCommunityBentoMode();
  }
}

// Start rotation when hovering on community bento card
function initCommunityBentoRotation() {
  const communityBento = document.getElementById('community-bento');
  if (!communityBento) return;

  communityBento.addEventListener('mouseenter', () => {
    if (isCommunitySwipeLayout()) return;
    startBentoRotation();
  });

  communityBento.addEventListener('mouseleave', () => {
    if (isCommunitySwipeLayout()) return;
    stopBentoRotation();
  });

  communityBento.addEventListener('touchstart', (event) => {
    if (!isCommunitySwipeLayout()) return;

    const touch = event.touches[0];
    if (!touch) return;

    communitySwipeStartX = touch.clientX;
    communitySwipeStartY = touch.clientY;
    communitySwipeActive = true;
    communitySwipeTriggered = false;
  }, { passive: true });

  communityBento.addEventListener('touchend', (event) => {
    if (!isCommunitySwipeLayout() || !communitySwipeActive) return;

    const touch = event.changedTouches[0];
    communitySwipeActive = false;
    if (!touch) return;

    const deltaX = touch.clientX - communitySwipeStartX;
    const deltaY = touch.clientY - communitySwipeStartY;
    const items = document.querySelectorAll('#community-bento-content .bento-rotating-item');
    if (items.length <= 1) return;

    if (!communityBento.classList.contains('community-touch-active')) return;

    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) <= Math.abs(deltaY) * 1.15) return;

    communitySwipeTriggered = true;
    const direction = deltaX < 0 ? 1 : -1;
    const nextIndex = (communityCurrentIndex + direction + items.length) % items.length;
    switchToContent(nextIndex);
  }, { passive: true });

  communityBento.addEventListener('click', (event) => {
    if (!isCommunitySwipeLayout()) return;
    if (communitySwipeTriggered) {
      communitySwipeTriggered = false;
      return;
    }

    const shouldActivate = !communityBento.classList.contains('community-touch-active');
    closeCompactBentoCards(shouldActivate ? communityBento : null);
    setCompactBentoActive(communityBento, shouldActivate);
  });

  const locationBento = document.getElementById('location-bento');
  if (locationBento) {
    locationBento.addEventListener('click', () => {
      if (!isCommunitySwipeLayout()) return;

      const shouldActivate = !locationBento.classList.contains('compact-bento-active');
      closeCompactBentoCards(shouldActivate ? locationBento : null);
      setCompactBentoActive(locationBento, shouldActivate);
    });
  }

  document.addEventListener('click', (event) => {
    if (!isCommunitySwipeLayout()) return;

    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#location-bento, #community-bento')) return;

    closeCompactBentoCards();
  });

  const compactMediaQuery = window.matchMedia('(max-width: 1023px)');
  const handleCompactModeChange = () => {
    syncCommunityBentoMode();
  };

  if (typeof compactMediaQuery.addEventListener === 'function') {
    compactMediaQuery.addEventListener('change', handleCompactModeChange);
  } else if (typeof compactMediaQuery.addListener === 'function') {
    compactMediaQuery.addListener(handleCompactModeChange);
  }

  syncCommunityBentoMode();
}

function generateIndicatorDots() {
  const items = document.querySelectorAll('#community-bento-content .bento-rotating-item');
  const indicator = document.getElementById('community-indicator');
  if (!indicator || items.length <= 1) return;

  // Generate dots based on number of items
  indicator.innerHTML = Array.from(items).map((_, i) =>
    `<div class="bento-indicator-dot ${i === communityCurrentIndex ? 'active' : ''}" data-index="${i}"></div>`
  ).join('');

  // Add click handlers to dots
  indicator.querySelectorAll('.bento-indicator-dot').forEach(dot => {
    dot.addEventListener('click', (e) => {
      e.stopPropagation();
      const newIndex = parseInt(dot.dataset.index);
      if (newIndex !== communityCurrentIndex) {
        switchToContent(newIndex);
      }
    });
  });
}

function updateIndicatorDots() {
  const dots = document.querySelectorAll('#community-indicator .bento-indicator-dot');
  dots.forEach((dot, i) => {
    dot.classList.toggle('active', i === communityCurrentIndex);
  });
}

async function switchToContent(newIndex) {
  const items = document.querySelectorAll('#community-bento-content .bento-rotating-item');
  const image = document.getElementById('community-bento-image');

  // Stop current rotation
  stopBentoRotation();

  // Remove active from ALL items first to ensure clean state
  items.forEach(item => item.classList.remove('active'));

  communityCurrentIndex = newIndex;
  const nextItem = items[communityCurrentIndex];

  await transitionCardImage(image, nextItem?.dataset.image, 240);

  // Add active only to the new item
  nextItem.classList.add('active');
  updateIndicatorDots();

  // Restart rotation after switch completes
  restartRotationTimer();
}

function restartRotationTimer() {
  const items = document.querySelectorAll('#community-bento-content .bento-rotating-item');
  const image = document.getElementById('community-bento-image');
  if (items.length === 0) return;

  // Start rotation every 8 seconds
  communityRotationInterval = setInterval(async () => {
    // Remove active from ALL items
    items.forEach(item => item.classList.remove('active'));

    communityCurrentIndex = (communityCurrentIndex + 1) % items.length;
    const nextItem = items[communityCurrentIndex];

    await transitionCardImage(image, nextItem?.dataset.image, 240);

    nextItem.classList.add('active');
    updateIndicatorDots();
  }, 8000);
}

let indicatorDotsGenerated = false;

function startBentoRotation() {
  const items = document.querySelectorAll('#community-bento-content .bento-rotating-item');
  const image = document.getElementById('community-bento-image');
  if (items.length === 0) return;

  // Generate indicator dots only once
  if (!indicatorDotsGenerated) {
    generateIndicatorDots();
    indicatorDotsGenerated = true;
  }

  // Ensure only ONE item has active class
  items.forEach((item, i) => {
    if (i === communityCurrentIndex) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
  updateIndicatorDots();

  // Set current image
  const currentItem = items[communityCurrentIndex];
  if (image && currentItem && currentItem.dataset.image) {
    image.src = currentItem.dataset.image;
    image.dataset.currentSrc = currentItem.dataset.image;
  }

  // Start rotation timer
  restartRotationTimer();
}

function stopBentoRotation() {
  if (communityRotationInterval) {
    clearInterval(communityRotationInterval);
    communityRotationInterval = null;
  }
}

// Call on load
fetchLocationCard();
fetchCommunityCards();
initCommunityBentoRotation();

// Glow Effect for Bento Cards
// We update CSS variables --x and --y based on mouse position relative to the card
const cards = document.querySelectorAll('.bento-card, .service-card');

cards.forEach(card => {
  card.addEventListener('mousemove', (e) => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    card.style.setProperty('--x', `${x}px`);
    card.style.setProperty('--y', `${y}px`);
  });
});

// Simple Entry Animation Observer
const observerOptions = {
  threshold: 0.1,
  rootMargin: "0px"
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = "1";
      entry.target.style.transform = "translateY(0)";
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Add initial styles for animation to targeted elements if needed
// For now, we rely on CSS transitions defined in style.css or added classes
document.querySelectorAll('.animate-up').forEach((element) => {
  observer.observe(element);
});

// ==========================================
// Certificates: tile click -> modal preview
// ==========================================
const certificateTiles = document.querySelectorAll('.certificate-tile');
const certificateModal = document.getElementById('certificate-modal');
const certificateModalImage = document.getElementById('certificate-modal-image');
const certificateModalTitle = document.getElementById('certificate-modal-title');
const certificateModalIssuer = document.getElementById('certificate-modal-issuer');
const certificateModalDate = document.getElementById('certificate-modal-date');
const certificateModalLink = document.getElementById('certificate-modal-link');
const certificateModalClose = certificateModal ? certificateModal.querySelector('.certificate-modal-close') : null;

let lastFocusedTile = null;

function openCertificateModal(tile) {
  if (!certificateModal || !certificateModalImage || !certificateModalTitle) return;

  lastFocusedTile = tile;

  const fullImage = tile.dataset.image;
  const title = tile.dataset.title || '';
  const issuer = tile.dataset.issuer || '';
  const date = tile.dataset.date || '';
  const link = tile.dataset.link || '#';

  certificateModalImage.src = fullImage || tile.querySelector('img')?.src || '';
  certificateModalImage.alt = title;
  certificateModalTitle.textContent = title;
  if (certificateModalIssuer) certificateModalIssuer.textContent = issuer;
  if (certificateModalDate) certificateModalDate.textContent = date;
  if (certificateModalLink) {
    certificateModalLink.href = link || '#';
    certificateModalLink.style.display = link && link !== '#' ? 'inline-flex' : 'none';
  }

  certificateModal.classList.add('is-open');
  certificateModal.setAttribute('aria-hidden', 'false');
}

function closeCertificateModal() {
  if (!certificateModal) return;
  certificateModal.classList.remove('is-open');
  certificateModal.setAttribute('aria-hidden', 'true');

  if (lastFocusedTile) {
    lastFocusedTile.focus();
    lastFocusedTile = null;
  }
}

if (certificateTiles.length && certificateModal) {
  certificateTiles.forEach(tile => {
    tile.addEventListener('click', () => openCertificateModal(tile));
    tile.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCertificateModal(tile);
      }
    });
  });

  if (certificateModalClose) {
    certificateModalClose.addEventListener('click', closeCertificateModal);
  }

  certificateModal.addEventListener('click', (e) => {
    if (e.target === certificateModal || e.target.classList.contains('certificate-modal-backdrop')) {
      closeCertificateModal();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && certificateModal.classList.contains('is-open')) {
      closeCertificateModal();
    }
  });
}

// Hero Cursor Follower & WebGL Orb
// import { ThreeOrb } from './components/ThreeOrb.js';
import { SiriWave } from './components/SiriWave.js';

const orbContainer = document.getElementById('ai-orb-container');
let threeOrb = null;
let siriWave = null;

if (orbContainer) {
  // threeOrb = new ThreeOrb(orbContainer);

  window.addEventListener('mousemove', (e) => {
    // const x = (e.clientX / window.innerWidth) * 2 - 1;
    // const y = -(e.clientY / window.innerHeight) * 2 + 1;
    // if (threeOrb) threeOrb.updateMouse(x, y);
  });
}

// ==========================================
// Vincent AI (Chat & Voice)
// ==========================================

const chatWidget = document.querySelector('.chat-widget');
const chatClose = document.getElementById('chat-close');
const chatWindow = document.querySelector('.chat-window');
const voiceBtn = document.getElementById('voice-btn');
const chatMessages = document.getElementById('chat-messages');
const typingIndicator = document.getElementById('typing-indicator');
const waveContainer = document.querySelector('.wave-container');
const waveCanvas = document.getElementById('siri-wave');

// Initialize Siri Wave
if (waveCanvas && waveContainer) {
  siriWave = new SiriWave({
    container: waveContainer,
    canvas: waveCanvas
  });
  siriWave.start();
  siriWave.setAmplitude(0.1); // Idle "breathing" line
}

// Toggle Chat
if (chatWindow && chatClose) {
  const closeChat = () => {
    chatWindow.classList.add('hidden');
    if (siriWave) siriWave.setAmplitude(0);
    window.speechSynthesis.cancel();
  };
  chatClose.addEventListener('click', closeChat);
}

// Add Message to Chat
const addMessage = (text, type) => {
  const messageDiv = document.createElement('div');
  messageDiv.classList.add('message', type);

  // Rule: Capitalize first letter of every sentence (or at least the first one)
  const formattedText = text.charAt(0).toUpperCase() + text.slice(1);

  chatMessages.appendChild(messageDiv);

  if (type === 'user') {
    messageDiv.innerText = formattedText;
  } else if (type === 'bot') {
    // Typewriter effect
    let i = 0;
    const speed = 35;
    function typeChar() {
      if (i < formattedText.length) {
        messageDiv.textContent += formattedText.charAt(i);
        i++;
        setTimeout(typeChar, speed);
      }
    }
    typeChar();
  }
};

// Handle Voice Input
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = "en-US";

  voiceBtn.addEventListener('click', () => {
    recognition.start();
    voiceBtn.classList.add('listening');
    if (siriWave) {
      waveContainer.classList.add('active');
      siriWave.setAmplitude(0.4); // Listening state
    }
  });

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    voiceBtn.classList.remove('listening');
    if (siriWave) siriWave.setAmplitude(0.1); // Back to idle

    // Clear previous for single-interaction focus
    chatMessages.innerHTML = '';

    // Show User Message
    addMessage(transcript, 'user');

    // Show Typing Indicator
    if (typingIndicator) typingIndicator.classList.remove('hidden');

    // Simulate Thinking/Network
    // setTimeout(async () => {
    const response = await findAnswer(transcript);

    // Hide Indicator
    if (typingIndicator) typingIndicator.classList.add('hidden');

    // Speak and Show Answer (text shows when audio starts)
    speak(response, () => {
      addMessage(response, 'bot');
    });

    // }, 800);
  };

  recognition.onerror = (event) => {
    voiceBtn.classList.remove('listening');
    if (siriWave) siriWave.setAmplitude(0.1);
    console.error('Speech recognition error', event.error);
  };

} else {
  if (voiceBtn) voiceBtn.style.display = 'none';
  console.log('Web Speech API not supported.');
}

// Voice Output
// Old Voice Output Logic removed

// ==========================================
// Text Input Integration
// ==========================================
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const inputArea = document.querySelector('.chat-input-area');

const handleSendMessage = async () => {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = ''; // Clear input

  // Clear previous messages
  chatMessages.innerHTML = '';

  // Show User Message
  addMessage(text, 'user');

  // Hide Input Area while AI processes/speaks
  if (inputArea) inputArea.classList.add('input-hidden');
  if (siriWave) {
    waveContainer.classList.add('active'); // Show wave area even if not speaking yet
    siriWave.setAmplitude(0.2); // Subtle waiting
  }

  // Simulate Thinking
  if (typingIndicator) typingIndicator.classList.remove('hidden');

  const response = await findAnswer(text);

  if (typingIndicator) typingIndicator.classList.add('hidden');

  // Speak and Show Answer (text shows when audio starts)
  speak(response, () => {
    addMessage(response, 'bot');
  });
};

if (sendBtn && chatInput) {
  sendBtn.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });
}
// ==========================================
// ElevenLabs Text-to-Speech
// ==========================================

// Show thinking message
const showThinking = () => {
  const thinkingDiv = document.createElement('div');
  thinkingDiv.classList.add('message', 'bot', 'thinking-message');
  thinkingDiv.innerHTML = '<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>';
  thinkingDiv.id = 'thinking-msg';
  chatMessages.appendChild(thinkingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
};

// Remove thinking message
const hideThinking = () => {
  const thinkingMsg = document.getElementById('thinking-msg');
  if (thinkingMsg) thinkingMsg.remove();
};

// Speak with synced text display
const speak = (text, onShowText) => {
  // Start visual feedback immediately - wave animation during loading
  if (siriWave) {
    waveContainer.classList.add('active');
    siriWave.setAmplitude(0.8); // Medium amplitude while thinking
  }
  if (inputArea) inputArea.classList.add('input-hidden');

  // Use ElevenLabs for natural voice
  speakWithElevenLabs(
    text,
    // onStart - when audio starts playing, show the text
    () => {
      hideThinking();
      if (siriWave) siriWave.setAmplitude(1.5); // Full amplitude when speaking
      if (threeOrb) threeOrb.setTalking(true);
      // Show the text answer NOW when audio starts
      if (onShowText) onShowText();
    },
    // onEnd - reset visuals
    () => {
      hideThinking();
      if (threeOrb) threeOrb.setTalking(false);
      if (siriWave) {
        siriWave.setAmplitude(0.1);
      }
      if (inputArea) inputArea.classList.remove('input-hidden');
    },
    // onThinking - show thinking message
    () => {
      showThinking();
    }
  );
};

// ------------------------------------------
// Knowledge Base + Live Site Content Index
// ------------------------------------------
const knowledgeBase = {
  greetings: ["hello", "hi", "hey", "greetings"],
  skills: ["skills", "expertise", "stack", "tech", "technologies", "react", "design"],
  projects: ["projects", "work", "portfolio", "case studies", "featured"],
  contact: ["contact", "email", "reach", "hire", "touch"],
  services: ["services", "what", "do", "offer", "help"],
  about: ["about", "who", "vincent", "background", "experience"]
};

// Base responses (used when no good match from scraped content)
const responses = {
  default: "I can answer questions about my work, skills, or how we can collaborate. What would you like to know?",
  greetings: "Hi there! I'm Vincent. I can tell you about my skills, show you my focused projects, or we can discuss working together.",
  skills: "I specialize in React, TypeScript, and modern CSS for development. For design, I use tools like Figma and Adobe Creative Suite.",
  projects: "My featured work includes content design, video editing, UI/UX design, web development, and more — all showcased on this page.",
  contact: "You can reach me via the “Let’s get in touch” section or connect with me on LinkedIn and GitHub in the footer.",
  services: "I offer a mix of front-end development, UI/UX, graphic design, and digital marketing so I can help from strategy to execution.",
  about: "I'm a multi-disciplinary creative based in Davao City who blends design, development, and marketing to build premium digital experiences."
};

// Lightweight index of text scraped from the live page
let contentIndex = [];

const buildContentIndex = () => {
  const sectionConfigs = [
    { id: 'about', label: 'About', selector: '.about-section' },
    { id: 'works', label: 'Works', selector: '#works' },
    { id: 'certificates', label: 'Certificates', selector: '#certificates' },
    { id: 'testimonials', label: 'Testimonials', selector: '#testimonials' },
    { id: 'contact', label: 'Contact', selector: '#contact' }
  ];

  contentIndex = [];

  sectionConfigs.forEach(cfg => {
    const root = document.querySelector(cfg.selector);
    if (!root) return;

    const paragraphs = Array.from(root.querySelectorAll('p, h2, h3'))
      .map(node => node.innerText || node.textContent || '')
      .map(text => text.trim())
      .filter(text => text.length > 40);

    paragraphs.forEach(text => {
      contentIndex.push({
        sectionId: cfg.id,
        sectionLabel: cfg.label,
        text
      });
    });
  });
};

// Build index once DOM is ready so AI reflects current on-page content
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', buildContentIndex);
} else {
  buildContentIndex();
}

const findFromContentIndex = (query) => {
  if (!contentIndex.length) return null;

  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  let best = null;
  let bestScore = 0;

  contentIndex.forEach(entry => {
    const textLower = entry.text.toLowerCase();
    let score = 0;

    tokens.forEach(t => {
      if (t.length < 3) return;
      if (textLower.includes(t)) score += 1;
    });

    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  });

  if (!best || bestScore === 0) return null;
  return best.text;
};

const findAnswer = (query) => {
  const lowered = query.toLowerCase();

  // 1) Try simple intent-based shortcuts (greetings, contact, etc.)
  for (const [category, keywords] of Object.entries(knowledgeBase)) {
    if (keywords.some(k => lowered.includes(k))) {
      return responses[category];
    }
  }

  // 2) If no intent match, try to answer directly from scraped site content
  const scraped = findFromContentIndex(query);
  if (scraped) {
    return scraped;
  }

  // 3) Fallback generic answer
  return responses.default;
};

// ==========================================
// Hero Section Integration
// ==========================================
const heroSpeakBtn = document.getElementById('hero-speak-btn');
if (heroSpeakBtn && chatWindow && voiceBtn) {
  heroSpeakBtn.addEventListener('click', (e) => {
    e.preventDefault();

    // 1. Open Chat Interface
    chatWindow.classList.remove('hidden');

    // Default: Idle State (No Auto-Listen)
  });

  // Interactive Gradient Effect (Global Tracking with Smooth Delay)
  let targetX = 0, targetY = 0;
  let currentX = 0, currentY = 0;
  const ease = 0.08;

  // Elements for Parallax
  const avatarIcon = document.querySelector('.orb-mic-icon');
  const glowElement = document.querySelector('.magical-glow');
  window.mouseX = window.innerWidth / 2;
  window.mouseY = window.innerHeight / 2;
  let orientationActive = false;
  let orientationOffsetX = 0;
  let orientationOffsetY = 0;

  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const updateHeroPointer = (clientX, clientY) => {
    if (heroSpeakBtn) {
      const rect = heroSpeakBtn.getBoundingClientRect();
      targetX = clientX - rect.left;
      targetY = clientY - rect.top;
    }

    window.mouseX = clientX;
    window.mouseY = clientY;
  };

  const updateOrientationOffsets = (event) => {
    if (typeof event.beta !== 'number' || typeof event.gamma !== 'number') return;

    // Portrait-friendly ranges: gamma = left/right, beta = front/back tilt.
    const normalizedGamma = clamp(event.gamma / 30, -1, 1);
    const normalizedBeta = clamp((event.beta - 45) / 35, -1, 1);

    orientationOffsetX = normalizedGamma;
    orientationOffsetY = normalizedBeta;
    orientationActive = true;
  };

  const enableDeviceOrientation = async () => {
    if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return;

    try {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') return;
      }

      window.addEventListener('deviceorientation', updateOrientationOffsets, { passive: true });
    } catch (error) {
      console.warn('Device orientation permission was not granted:', error);
    }
  };

  document.addEventListener('mousemove', (e) => {
    updateHeroPointer(e.clientX, e.clientY);
  });

  document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    updateHeroPointer(touch.clientX, touch.clientY);
    enableDeviceOrientation();
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    const touch = e.touches[0];
    if (!touch) return;
    updateHeroPointer(touch.clientX, touch.clientY);
  }, { passive: true });

  document.addEventListener('touchend', () => {
    updateHeroPointer(window.innerWidth / 2, window.innerHeight / 2);
  }, { passive: true });

  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    enableDeviceOrientation();
  }

  const animateGradient = () => {
    // 1. Button Gradient Logic
    if (heroSpeakBtn) {
      // Linear Interpolation (Lerp) for smooth delay
      currentX += (targetX - currentX) * ease;
      currentY += (targetY - currentY) * ease;

      heroSpeakBtn.style.setProperty('--x', `${currentX}px`);
      heroSpeakBtn.style.setProperty('--y', `${currentY}px`);
    }

    // 2. Avatar Parallax Logic
    if (avatarIcon && window.mouseX !== undefined) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      const pointerOffsetX = (window.mouseX - centerX) / centerX;
      const pointerOffsetY = (window.mouseY - centerY) / centerY;
      const offsetX = orientationActive ? orientationOffsetX : pointerOffsetX;
      const offsetY = orientationActive ? orientationOffsetY : pointerOffsetY;

      // Max tilt angles
      const maxTilt = 20;
      const moveAmount = 15;

      const rotateY = offsetX * maxTilt;
      const rotateX = -offsetY * maxTilt; // Invert Y for natural tilt
      const translateX = offsetX * moveAmount;
      const translateY = offsetY * moveAmount;

      // Apply transform (Preserving the centering translate)
      avatarIcon.style.transform = `translate(calc(-50% + ${translateX}px), calc(-50% + ${translateY}px)) perspective(500px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`;
    }

    // 3. Magical Glow Follow Logic (Laggy, floaty follow)
    if (glowElement && window.mouseX !== undefined) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      const pointerOffsetX = (window.mouseX - centerX) / centerX;
      const pointerOffsetY = (window.mouseY - centerY) / centerY;
      const offsetX = orientationActive ? orientationOffsetX : pointerOffsetX;
      const offsetY = orientationActive ? orientationOffsetY : pointerOffsetY;

      // Glow moves slightly more than avatar to feel like expansive background energy
      const moveAmountGlow = 30;
      const globeX = offsetX * moveAmountGlow;
      const globeY = offsetY * moveAmountGlow;

      // We use a separate transform because it has its own CSS animation for scale
      // We need to keep the translate(-50%, -50%) and add our offset
      // But since we can't easily add to the CSS keyframe translate, we'll use margin or specific transform
      // Best way: Wrap the glow in a moving container OR update the variables if setup that way.
      // Easiest: Just modify the transform, but that overwrites the @keyframes scale.

      // Better approach: Use left/top with calc, margin, OR just simple transforms and remove the CSS translate from keyframes?
      // CSS Keyframes use translate(-50%, -50%). Overwriting `transform` in JS kills that or the scale animation.

      // Workaround: Apply the movement to the container or use margin-left/top offsets.
      // Let's use margin-left/margin-top to off-center it without breaking the transform loop.

      glowElement.style.marginLeft = `${globeX}px`;
      glowElement.style.marginTop = `${globeY}px`;
    }

    requestAnimationFrame(animateGradient);
  };

  // Start the loop
  animateGradient();

  // 4. Advanced Blinking Logic
  const avatarImg = document.querySelector('.orb-avatar');
  const openEyeSrc = '/vincent-avatar-open.png';
  const closedEyeSrc = '/vincent-avatar-closed.png';

  // Preload
  const preloadClosed = new Image();
  preloadClosed.src = closedEyeSrc;

  // Helper: Perform a single blink
  const blinkOnce = (callback) => {
    if (!avatarImg) return;
    avatarImg.src = closedEyeSrc;
    setTimeout(() => {
      avatarImg.src = openEyeSrc;
      if (callback) callback();
    }, 150); // Speed of one blink
  };

  const triggerBlink = () => {
    if (!avatarImg) return;

    // Weighted Random Selection
    const roll = Math.random();

    if (roll < 0.20) {
      // 20% chance: Double Blink (Interest/Alive)
      blinkOnce(() => {
        setTimeout(() => blinkOnce(), 150); // Gap between blinks
      });
    } else {
      // 80% chance: Single Blink (Normal)
      blinkOnce();
    }

    // Schedule next blink (Random interval 2s - 6s)
    const nextBlinkDelay = Math.random() * 4000 + 2000;
    setTimeout(triggerBlink, nextBlinkDelay);
  };

  // Start blink loop after initial delay
  if (avatarImg) setTimeout(triggerBlink, 3000);

  // 5. Hero Fade Effect (Sticky Scroll)
  const heroSection = document.querySelector('.hero');
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (heroSection) {
      // Fade out hero as we scroll down the first window height
      const opacity = Math.max(0, 1 - (scrollY / (window.innerHeight * 0.8)));
      heroSection.style.opacity = opacity;

      // Optional: slight scale down for depth
      // const scale = 1 - (scrollY / (window.innerHeight * 2));
      // heroSection.style.transform = `scale(${scale})`;
    }
  });
}

// Navbar Scroll Effect
const navPill = document.querySelector('.nav-pill');
if (navPill) {
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navPill.classList.add('scrolled');
    } else {
      navPill.classList.remove('scrolled');
    }
  });
}

// Navbar Active Section Indicator
const navLinks = Array.from(document.querySelectorAll('.nav-link[data-section]'));

function setActiveNavLink(sectionId) {
  navLinks.forEach(link => {
    link.classList.toggle('active', link.dataset.section === sectionId);
  });
}

if (navLinks.length > 0) {
  const navSectionTargets = [
    { id: 'about', element: document.querySelector('#about') },
    { id: 'works', element: document.querySelector('#works') },
    { id: 'contact', element: document.querySelector('#contact') }
  ].filter(section => section.element);

  const updateActiveNavByScroll = () => {
    const homeThreshold = Math.max(140, window.innerHeight * 0.55);
    const currentY = window.scrollY;

    // Home/hero state: no selected pill yet.
    if (currentY < homeThreshold) {
      setActiveNavLink(null);
      return;
    }

    const probePoints = [0.36, 0.5, 0.64];
    const votes = new Map();

    probePoints.forEach(ratio => {
      const probeY = Math.round(window.innerHeight * ratio);
      const probeX = Math.round(window.innerWidth * 0.5);
      const hit = document.elementFromPoint(probeX, probeY);
      const sectionMatch = hit?.closest?.('#about, #works, #contact');

      if (sectionMatch?.id) {
        votes.set(sectionMatch.id, (votes.get(sectionMatch.id) || 0) + 1);
      }
    });

    if (votes.size > 0) {
      const bestSection = Array.from(votes.entries()).sort((a, b) => b[1] - a[1])[0][0];
      setActiveNavLink(bestSection);
      return;
    }

    const fallbackSection = navSectionTargets.find(section => {
      const rect = section.element.getBoundingClientRect();
      return rect.top <= window.innerHeight * 0.5 && rect.bottom >= window.innerHeight * 0.3;
    });

    setActiveNavLink(fallbackSection?.id || null);
  };

  window.addEventListener('scroll', updateActiveNavByScroll, { passive: true });
  window.addEventListener('resize', updateActiveNavByScroll);
  window.addEventListener('hashchange', updateActiveNavByScroll);

  updateActiveNavByScroll();
}

// ==========================================
// Icon Scroll Trigger Logic
// ==========================================
// ==========================================
// Icon Scroll Trigger Logic
// ==========================================

// 1. Group Animation for Services Grid (Succession Effect)
const servicesGrid = document.querySelector('.services-grid');
if (servicesGrid) {
  const gridObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const icons = entry.target.querySelectorAll('.service-icon');
      if (entry.isIntersecting) {
        // Trigger all icons in the grid at once (CSS delays handle the sequence)
        icons.forEach(icon => icon.classList.add('play-animation'));
      } else {
        // Reset when the whole grid is out of view
        icons.forEach(icon => icon.classList.remove('play-animation'));
      }
    });
  }, {
    threshold: 0.2, // Trigger when 20% of the grid is visible
    rootMargin: "0px"
  });

  gridObserver.observe(servicesGrid);
}

// 2. Individual Animation for other icons (excluding those in the grid)
const otherIcons = document.querySelectorAll('.icon-animate-scroll:not(.services-grid .service-icon)');
if (otherIcons.length > 0) {
  const iconObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('play-animation');
      } else {
        entry.target.classList.remove('play-animation');
      }
    });
  }, {
    threshold: 0.5,
    rootMargin: "0px"
  });

  otherIcons.forEach(icon => iconObserver.observe(icon));
}

// ==========================================
// Floating Hover Cards - Follow Cursor
// ==========================================
const hoverTriggers = document.querySelectorAll('.hover-card-trigger');
const dimOverlay = document.getElementById('hover-dim-overlay');
let activeRotationInterval = null;

hoverTriggers.forEach(trigger => {
  const cardId = trigger.dataset.hoverCard;
  const hoverCard = document.getElementById(cardId);

  if (!hoverCard) return;

  // Mouse enter - show card and dim background
  trigger.addEventListener('mouseenter', () => {
    hoverCard.classList.add('visible');
    if (dimOverlay) dimOverlay.classList.add('visible');

    // Start rotation for community card
    if (hoverCard.classList.contains('rotating-card')) {
      startContentRotation(hoverCard);
    }
  });

  // Mouse leave - hide card and remove dim
  trigger.addEventListener('mouseleave', () => {
    hoverCard.classList.remove('visible');
    if (dimOverlay) dimOverlay.classList.remove('visible');

    // Stop rotation
    if (activeRotationInterval) {
      clearInterval(activeRotationInterval);
      activeRotationInterval = null;
    }
  });

});

// Smooth Cursor Following Logic (LERP)
let mouseX = 0;
let mouseY = 0;
let cursorX = 0;
let cursorY = 0;
// LERP Factor: Lower = more delay/smoother (0.1 is smooth, 0.2 is snappy)
const lerpFactor = 0.1;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
});

function animateCards() {
  // Linear Interpolation for smoothness
  cursorX += (mouseX - cursorX) * lerpFactor;
  cursorY += (mouseY - cursorY) * lerpFactor;

  const visibleCard = document.querySelector('.floating-hover-card.visible');
  if (visibleCard) {
    const offsetX = 20;
    const offsetY = 20;

    // Use smoothed coordinates
    let targetX = cursorX + offsetX;
    let targetY = cursorY + offsetY;

    // Viewport bound check (using window dimensions)
    const cardRect = visibleCard.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (targetX + cardRect.width > viewportWidth) {
      targetX = cursorX - cardRect.width - offsetX;
    }
    if (targetY + cardRect.height > viewportHeight) {
      targetY = cursorY - cardRect.height - offsetY;
    }

    visibleCard.style.left = `${targetX}px`;
    visibleCard.style.top = `${targetY}px`;
  }

  requestAnimationFrame(animateCards);
}

// Start animation loop
animateCards();


// Store last viewed index per card (persists between hovers)
const cardContentIndices = {};

// Rotate content for Community card every 8 seconds
function startContentRotation(card) {
  const contents = card.querySelectorAll('.rotating-content');
  const image = card.querySelector('.floating-image');
  if (contents.length === 0) return;

  // Get or initialize the current index for this card
  const cardId = card.id;
  if (cardContentIndices[cardId] === undefined) {
    cardContentIndices[cardId] = 0;
  }
  let currentIndex = cardContentIndices[cardId];

  // Show the remembered content (not always first)
  contents.forEach((content, i) => {
    content.classList.toggle('active', i === currentIndex);
  });

  // Set gradient for current content
  const currentContent = contents[currentIndex];
  if (currentContent && currentContent.dataset.gradient) {
    card.className = card.className.replace(/gradient-\w+/g, '').trim();
    card.classList.add(currentContent.dataset.gradient);
  }

  // Set image to match current content
  if (image && currentContent && currentContent.dataset.image) {
    image.src = currentContent.dataset.image;
    image.dataset.currentSrc = currentContent.dataset.image;
    image.classList.remove('fade-out');
  }

  // Rotate every 8 seconds
  activeRotationInterval = setInterval(async () => {
    // Fade out current
    contents[currentIndex].classList.remove('active');

    currentIndex = (currentIndex + 1) % contents.length;
    cardContentIndices[cardId] = currentIndex;

    const nextContent = contents[currentIndex];

    await transitionCardImage(image, nextContent?.dataset.image, 240);

    // Change gradient
    if (nextContent.dataset.gradient) {
      card.className = card.className.replace(/gradient-\w+/g, '').trim();
      card.classList.add(nextContent.dataset.gradient);
    }

    // Show next content
    nextContent.classList.add('active');
  }, 8000);
}

// ==========================================
// Cursor-following gradient buttons
// (CTA + navbar Contact pill share the same effect)
// ==========================================
const ctaBtn = document.querySelector('.cta-spotlight-btn');
const navContactBtn = document.querySelector('.nav-contact-pill');

const attachCursorGradient = (element, ease = 0.08) => {
  if (!element) return;

  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  document.addEventListener('mousemove', (e) => {
    const rect = element.getBoundingClientRect();
    targetX = e.clientX - rect.left;
    targetY = e.clientY - rect.top;
  });

  const animate = () => {
    currentX += (targetX - currentX) * ease;
    currentY += (targetY - currentY) * ease;

    element.style.setProperty('--x', `${currentX}px`);
    element.style.setProperty('--y', `${currentY}px`);

    requestAnimationFrame(animate);
  };

  animate();
};

attachCursorGradient(ctaBtn, 0.08);
attachCursorGradient(navContactBtn, 0.12);
