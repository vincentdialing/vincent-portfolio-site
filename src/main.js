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
    const brandsHtml = brands.map(brand => `
      <div class="ticker-item">
        <img src="${brand.logo_url}" alt="${brand.name}" class="brand-logo" title="${brand.name}">
      </div>
    `).join('');

    // Duplicate 4 times for infinite loop (same as we did manually)
    tickerContent.innerHTML = brandsHtml.repeat(4);
  } else {
    tickerContent.innerHTML = '<div class="ticker-item">No brands found</div>';
  }
}

// Call on load
fetchBrands();

// ==========================================
// Dynamic Content: Fetch Location Card (Bento Hover Transform)
// ==========================================
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
      image.src = data.image_url;
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
      image.src = data[0].image_url;
    }
  }
}

// Start rotation when hovering on community bento card
function initCommunityBentoRotation() {
  const communityBento = document.getElementById('community-bento');
  if (!communityBento) return;

  communityBento.addEventListener('mouseenter', () => {
    startBentoRotation();
  });

  communityBento.addEventListener('mouseleave', () => {
    stopBentoRotation();
  });
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

function switchToContent(newIndex) {
  const items = document.querySelectorAll('#community-bento-content .bento-rotating-item');
  const image = document.getElementById('community-bento-image');

  // Stop current rotation
  stopBentoRotation();

  // Remove active from ALL items first to ensure clean state
  items.forEach(item => item.classList.remove('active'));

  if (image) image.classList.add('fade-out');

  setTimeout(() => {
    communityCurrentIndex = newIndex;
    const nextItem = items[communityCurrentIndex];

    // Change image
    if (image && nextItem.dataset.image) {
      image.src = nextItem.dataset.image;
      image.classList.remove('fade-out');
    }

    // Add active only to the new item
    nextItem.classList.add('active');
    updateIndicatorDots();

    // Restart rotation after switch completes
    restartRotationTimer();
  }, 350);
}

function restartRotationTimer() {
  const items = document.querySelectorAll('#community-bento-content .bento-rotating-item');
  const image = document.getElementById('community-bento-image');
  if (items.length === 0) return;

  // Start rotation every 8 seconds
  communityRotationInterval = setInterval(() => {
    // Remove active from ALL items
    items.forEach(item => item.classList.remove('active'));

    // Fade out image
    if (image) image.classList.add('fade-out');

    setTimeout(() => {
      communityCurrentIndex = (communityCurrentIndex + 1) % items.length;
      const nextItem = items[communityCurrentIndex];

      // Change image
      if (image && nextItem.dataset.image) {
        image.src = nextItem.dataset.image;
        image.classList.remove('fade-out');
      }

      nextItem.classList.add('active');
      updateIndicatorDots();
    }, 350);
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
    }
  });
}, observerOptions);

// Add initial styles for animation to targeted elements if needed
// For now, we rely on CSS transitions defined in style.css or added classes

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
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;

  document.addEventListener('mousemove', (e) => {
    if (heroSpeakBtn) {
      const rect = heroSpeakBtn.getBoundingClientRect();
      targetX = e.clientX - rect.left;
      targetY = e.clientY - rect.top;
    }

    // For Global Parallax of Avatar
    // We reuse the event to update global mouse pos tracking if we needed distinct variables,
    // but here we can just read e.clientX/Y directly in the loop if we store them?
    // Actually, let's store global mouse X/Y separately for the parallax
    window.mouseX = e.clientX;
    window.mouseY = e.clientY;
  });

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
      // Calculate offset from center of screen
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      const offsetX = (window.mouseX - centerX) / centerX; // -1 to 1
      const offsetY = (window.mouseY - centerY) / centerY; // -1 to 1

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
    const glowElement = document.querySelector('.magical-glow');
    if (glowElement && window.mouseX !== undefined) {
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      // Calculate offset logic again or reuse
      const offsetX = (window.mouseX - centerX) / centerX;
      const offsetY = (window.mouseY - centerY) / centerY;

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
    image.classList.remove('fade-out');
  }

  // Rotate every 8 seconds
  activeRotationInterval = setInterval(() => {
    // Fade out current
    contents[currentIndex].classList.remove('active');

    // Fade out image
    if (image) {
      image.classList.add('fade-out');
    }

    // Wait for fade out, then switch
    setTimeout(() => {
      currentIndex = (currentIndex + 1) % contents.length;
      // Save the new index for next hover
      cardContentIndices[cardId] = currentIndex;

      const nextContent = contents[currentIndex];

      // Change image
      if (image && nextContent.dataset.image) {
        image.src = nextContent.dataset.image;
        image.classList.remove('fade-out');
      }

      // Change gradient
      if (nextContent.dataset.gradient) {
        card.className = card.className.replace(/gradient-\w+/g, '').trim();
        card.classList.add(nextContent.dataset.gradient);
      }

      // Show next content
      nextContent.classList.add('active');
    }, 300);

  }, 8000);
}

// ==========================================
// CTA Book a Call Button — Cursor-Following Gradient
// (Same effect as hero Speak with Vincent button)
// ==========================================
const ctaBtn = document.querySelector('.cta-spotlight-btn');
if (ctaBtn) {
  let ctaTargetX = 0, ctaTargetY = 0;
  let ctaCurrentX = 0, ctaCurrentY = 0;
  const ctaEase = 0.08;

  document.addEventListener('mousemove', (e) => {
    const rect = ctaBtn.getBoundingClientRect();
    ctaTargetX = e.clientX - rect.left;
    ctaTargetY = e.clientY - rect.top;
  });

  const animateCtaGradient = () => {
    ctaCurrentX += (ctaTargetX - ctaCurrentX) * ctaEase;
    ctaCurrentY += (ctaTargetY - ctaCurrentY) * ctaEase;

    ctaBtn.style.setProperty('--x', `${ctaCurrentX}px`);
    ctaBtn.style.setProperty('--y', `${ctaCurrentY}px`);

    requestAnimationFrame(animateCtaGradient);
  };

  animateCtaGradient();
}
