import { supabase } from './supabaseClient.js'
import './style.css'

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

    // Speak and Show Answer
    speak(response);
    addMessage(response, 'bot');

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

  // Speak and Show Answer
  speak(response);
  addMessage(response, 'bot');
};

if (sendBtn && chatInput) {
  sendBtn.addEventListener('click', handleSendMessage);
  chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSendMessage();
  });
}

// Redefining speak to include input toggling

const speak = (text) => {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    // Voice Selection 
    const voices = window.speechSynthesis.getVoices();
    const targetVoice = voices.find(v => (v.lang === 'en-PH' || v.lang === 'fil-PH' || v.name.includes('Filipino'))) ||
      voices.find(v => v.name.includes('Daniel') || v.name.includes('Google US English'));

    if (targetVoice) utterance.voice = targetVoice;
    utterance.pitch = 1.2;
    utterance.rate = 1.1;

    utterance.onstart = () => {
      if (threeOrb) threeOrb.setTalking(true);
      if (siriWave) {
        waveContainer.classList.add('active');
        siriWave.setAmplitude(1.5);
      }
      // HIDE INPUT
      if (inputArea) inputArea.classList.add('input-hidden');
    };

    utterance.onend = () => {
      if (threeOrb) threeOrb.setTalking(false);
      if (siriWave) {
        siriWave.setAmplitude(0.1); // Back to idle
        // waveContainer.classList.remove('active'); // Keep visible
      }
      // SHOW INPUT
      if (inputArea) inputArea.classList.remove('input-hidden');
    };

    window.speechSynthesis.speak(utterance);
  }
};

// ------------------------------------------
// Knowledge Base (Scoped to Website Content)
// ------------------------------------------
const knowledgeBase = {
  greetings: ["hello", "hi", "hey", "greetings"],
  skills: ["skills", "expertise", "stack", "tech", "technologies", "react", "design"],
  projects: ["projects", "work", "portfolio", "case studies", "featured"],
  contact: ["contact", "email", "reach", "hire", "touch"],
  services: ["services", "what", "do", "offer", "help"],
  about: ["about", "who", "vincent", "background", "experience"]
};

// Responses strictly based on website content (First-Person Persona)
const responses = {
  default: "I can answer questions about my work, skills, or how we can collaborate. What would you like to know?",
  greetings: "Hi there! I'm Vincent. I can tell you about my skills, show you my focused projects, or we can discuss working together.",
  skills: "I specialize in React, TypeScript, and Modern CSS for development. For design, I use Figma and Adobe Creative Suite.",
  projects: "My featured work includes a React E-Commerce Platform, Brand Identity Designs, and Social Media Campaigns.",
  contact: "You can reach me via the contact form below, or connect with me on LinkedIn and GitHub found in the footer.",
  services: "I offer Front-End Development, Graphic Design, and Digital Marketing services to bridge the gap between code and strategy.",
  about: "I'm a multi-disciplinary creative: Frontend Developer, Graphic Designer, and Digital Marketer focused on building premium digital experiences."
};

const findAnswer = (query) => {
  query = query.toLowerCase();

  // Simple keyword matching against knowledge base
  for (const [category, keywords] of Object.entries(knowledgeBase)) {
    if (keywords.some(k => query.includes(k))) {
      return responses[category];
    }
  }
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
