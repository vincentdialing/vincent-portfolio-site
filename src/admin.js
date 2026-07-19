import { createClient } from '@supabase/supabase-js';
import Groq from 'groq-sdk';
import html2canvas from 'html2canvas';
import './admin.css';

// ==========================================
// 1. SUPABASE CLIENT INITIALIZATION & STATUS
// ==========================================

let supabase = null;
let currentKeyType = 'env'; // 'env' or 'custom'
let isUsingServiceRole = false;

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function initSupabase() {
  const customUrl = localStorage.getItem('admin_supabase_url');
  const customKey = localStorage.getItem('admin_supabase_key');

  const url = customUrl || envUrl;
  const key = customKey || envAnonKey;

  // Detect if the user pasted a service_role key (JWT with role claim or very long key)
  let detectedServiceRole = false;
  if (key) {
    try {
      // Standard Supabase JWTs: decode the payload to check the role claim
      const parts = key.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        if (payload.role === 'service_role') detectedServiceRole = true;
      }
    } catch (_) {
      // Not a JWT or can't decode — treat as anon key
    }
    // Fallback heuristic: if key literally contains the string
    if (!detectedServiceRole && key.includes('service_role')) detectedServiceRole = true;
  }
  isUsingServiceRole = detectedServiceRole;

  // Debug: log which credential type was detected (do not print full key)
  try {
    console.info('Supabase init:', { url, keyIsServiceRole: Boolean(detectedServiceRole), keyLength: key ? key.length : 0 });
  } catch (e) {
    /* ignore */
  }

  if (customUrl && customKey) {
    currentKeyType = 'custom';
    if (detectedServiceRole) {
      // Service role keys are blocked by Supabase in the browser — warn the user
      document.getElementById('status-key-type').innerHTML = 
        '<span style="color:var(--warning)">⚠ Service Role Key detected — using Anon Key instead (browser restriction)</span>';
      console.warn('Service Role keys cannot be used in the browser. Falling back to the .env Anon Key for reads. Writes rely on RLS policies.');
    } else {
      document.getElementById('status-key-type').textContent = 'Using Custom Anon Key (Read Only)';
    }
  } else {
    currentKeyType = 'env';
    document.getElementById('status-key-type').textContent = 'Using environment credentials';
  }

  // Always use the anon key for the browser client.
  // Service role keys are rejected by Supabase servers from browser origins.
  const effectiveKey = detectedServiceRole ? envAnonKey : key;
  const effectiveUrl = url;

  if (!effectiveUrl || !effectiveKey) {
    updateStatusBadge('error', 'Missing credentials');
    return null;
  }

  try {
    const client = createClient(effectiveUrl, effectiveKey, {
      auth: { persistSession: false }
    });
    return client;
  } catch (err) {
    console.error('Supabase init error:', err);
    updateStatusBadge('error', 'Init failed');
    return null;
  }
}

function updateStatusBadge(status, label) {
  const badge = document.getElementById('status-badge');
  if (badge) {
    badge.className = `status-indicator ${status}`;
    const labelEl = badge.querySelector('.status-label');
    if (labelEl) labelEl.textContent = label;
  }

  const mobileDot = document.getElementById('mobile-status-dot');
  if (mobileDot) {
    mobileDot.className = `mobile-status-dot ${status}`;
  }
}

async function testConnection() {
  if (!supabase) {
    updateStatusBadge('error', 'Not initialized');
    return;
  }

  updateStatusBadge('checking', 'Connecting...');

  try {
    // Simple light query to check auth/connectivity
    const { error } = await supabase.from('portfolio_services').select('key').limit(1);
    
    if (error) {
      console.warn('Connection check returned error:', error);
      updateStatusBadge('error', error.message || 'Connection failed');
    } else {
      updateStatusBadge('connected', 'Connected');
    }
  } catch (err) {
    console.error('Test connection error:', err);
    updateStatusBadge('error', 'Connection error');
  }
}

// Instantiate on startup
supabase = initSupabase();

// -------------------------
// Server proxy helpers
// -------------------------
async function clientDbCall(action, table, payload = null, id = null) {
  if (!supabase) {
    throw new Error('Supabase client not initialized for fallback.');
  }
  let result;
  if (action === 'insert') {
    result = await supabase.from(table).insert(payload).select();
  } else if (action === 'update') {
    result = await supabase.from(table).update(payload).eq('id', id).select();
  } else if (action === 'delete') {
    result = await supabase.from(table).delete().eq('id', id).select();
  } else {
    throw new Error(`Invalid action: ${action}`);
  }

  if (result.error) {
    throw result.error;
  }
  return { data: result.data || null };
}

async function serverDbCall(action, table, payload = null, id = null) {
  let tryClientFallback = false;
  try {
    const res = await fetch('/api/db', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, table, payload, id })
    });
    if (res.status === 404) {
      tryClientFallback = true;
    } else {
      const json = await res.json();
      if (!res.ok) throw json || new Error('Server DB error');
      return json;
    }
  } catch (err) {
    if (supabase) {
      tryClientFallback = true;
      console.warn('serverDbCall failed, falling back to client-side Supabase client:', err);
    } else {
      throw err;
    }
  }

  if (tryClientFallback) {
    return await clientDbCall(action, table, payload, id);
  }
}

async function serverUpload(file, bucketName = 'portfolio') {
  // Send the file to the serverless upload endpoint which holds the service_role key
  const headers = { 'x-file-name': file.name, 'x-file-type': file.type, 'x-bucket': bucketName };
  const res = await fetch('/api/upload', { method: 'POST', headers, body: file });
  const json = await res.json();
  if (!res.ok) throw json || new Error('Upload failed');
  return json;
}

// ==========================================
// 2. TOAST FLOATING NOTIFICATIONS
// ==========================================

function showToast(title, message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  // Intercept RLS permission violations and show the warning panel
  const lowerMsg = String(message || '').toLowerCase();
  const lowerTitle = String(title || '').toLowerCase();
  if (type === 'error' && (lowerMsg.includes('row-level security') || lowerMsg.includes('violates') || lowerMsg.includes('permission denied') || lowerMsg.includes('policy') || lowerTitle.includes('rls') || lowerTitle.includes('failed to add') || lowerTitle.includes('failed to save'))) {
    const rlsWarning = document.getElementById('rls-warning-banner');
    if (rlsWarning) rlsWarning.classList.remove('hidden');
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconSvg = '';
  if (type === 'success') {
    iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>';
  } else if (type === 'error') {
    iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>';
  } else {
    iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';
  }

  toast.innerHTML = `
    <div class="toast-icon">${iconSvg}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-message">${message}</div>
    </div>
  `;

  container.appendChild(toast);

  // Auto remove after 4.5 seconds
  setTimeout(() => {
    toast.classList.add('hide');
    setTimeout(() => toast.remove(), 300);
  }, 4500);
}

// ==========================================
// 3. TAB CONTROLLER
// ==========================================

const TAB_CONFIGS = {
  projects: { title: 'Projects', subtitle: 'Manage portfolio works and project details.', button: 'Add New Project' },
  gallery: { title: 'Project Gallery', subtitle: 'Manage secondary gallery images for project drilldown pages.', button: '' },
  services: { title: 'Services', subtitle: 'Manage services categories and display parameters.', button: 'Add Service' },
  brands: { title: 'Brand Logos', subtitle: 'Manage client and partner logos for the scrolling marquee.', button: 'Add Brand Logo' },
  bento: { title: 'Bento Hover Cards', subtitle: 'Manage bento layout interactive cards.', button: '' },
  uploads: { title: 'File Manager', subtitle: 'Upload static images directly to your Supabase Storage.', button: '' },
  certificates: { title: 'Certificates & Credentials', subtitle: 'Manage professional certificates and credentials.', button: 'Add Certificate' },
  reviews: { title: 'Client Reviews', subtitle: 'Manage client feedback, ratings, and profile avatars.', button: 'Add Review' },
  config: { title: 'Supabase Credentials', subtitle: 'Configure credentials to authenticate your write sessions.', button: '' }
};

const TAB_TO_URL = {
  projects: 'projects',
  gallery: 'projectgallery',
  services: 'services',
  brands: 'brands',
  bento: 'bento',
  uploads: 'uploads',
  certificates: 'certificates',
  reviews: 'reviews',
  config: 'config'
};

const URL_TO_TAB = {
  projects: 'projects',
  gallery: 'gallery',
  projectgallery: 'gallery',
  services: 'services',
  brands: 'brands',
  brandlogos: 'brands',
  bento: 'bento',
  uploads: 'uploads',
  filemanager: 'uploads',
  certificates: 'certificates',
  reviews: 'reviews',
  config: 'config',
  credentials: 'config'
};

let activeTab = 'projects';

function getTabFromUrl() {
  // Try to match path segment first: /admin/projects
  const path = window.location.pathname;
  const match = path.match(/\/admin\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    const segment = match[1].toLowerCase();
    if (URL_TO_TAB[segment]) return URL_TO_TAB[segment];
  }

  // Fallback to hash routing: /admin#projects
  const hash = window.location.hash.replace('#', '').toLowerCase();
  if (URL_TO_TAB[hash]) return URL_TO_TAB[hash];

  return null;
}

function switchTab(target, updateUrl = true) {
  if (!TAB_CONFIGS[target]) return;
  activeTab = target;
  localStorage.setItem('admin_active_tab', target);

  const tabs = document.querySelectorAll('.nav-tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  const actionBtn = document.getElementById('add-item-btn');
  const tabTitle = document.getElementById('active-tab-title');
  const tabSubtitle = document.getElementById('active-tab-subtitle');

  // Update Nav active states
  tabs.forEach(t => {
    if (t.dataset.tab === target) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  // Update Panels active states
  panels.forEach(p => {
    if (p.id === `panel-${target}`) {
      p.classList.add('active');
    } else {
      p.classList.remove('active');
    }
  });

  // Update Header content
  const cfg = TAB_CONFIGS[target] || { title: 'Admin', subtitle: '', button: '' };
  if (tabTitle) tabTitle.textContent = cfg.title;
  if (tabSubtitle) tabSubtitle.textContent = cfg.subtitle;

  // Update header action button
  if (actionBtn) {
    if (cfg.button) {
      actionBtn.style.display = 'inline-flex';
      actionBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        ${cfg.button}
      `;
    } else {
      actionBtn.style.display = 'none';
    }
  }

  // Trigger lazy loads
  loadTabData(target);

  // Update URL
  if (updateUrl) {
    const segment = TAB_TO_URL[target] || target;
    const newPath = `/admin/${segment}`;
    if (window.location.pathname !== newPath) {
      window.history.pushState({ tab: target }, '', newPath);
    }
  }
}

function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  const actionBtn = document.getElementById('add-item-btn');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      switchTab(target, true);
    });
  });

  // Listen to popstate event to support browser back/forward buttons
  window.addEventListener('popstate', (event) => {
    const tab = getTabFromUrl() || (event.state && event.state.tab) || localStorage.getItem('admin_active_tab') || 'projects';
    switchTab(tab, false);
  });

  // Determine initial tab to open
  const urlTab = getTabFromUrl();
  const savedTab = localStorage.getItem('admin_active_tab');
  const initialTab = urlTab || (savedTab && TAB_CONFIGS[savedTab] ? savedTab : 'projects');

  // Load initial tab and sync URL
  switchTab(initialTab, true);

  // Wire header action btn click to opening the respective modal
  if (actionBtn) {
    actionBtn.addEventListener('click', () => {
      if (activeTab === 'projects') {
        openProjectModal();
      } else if (activeTab === 'brands') {
        openBrandModal();
      } else if (activeTab === 'services') {
        openServiceModal();
      } else if (activeTab === 'certificates') {
        openCertificateModal();
      } else if (activeTab === 'reviews') {
        openReviewModal();
      }
    });
  }

  // Handle go to config button from warning banner
  const gotoConfig = document.getElementById('goto-config-btn');
  if (gotoConfig) {
    gotoConfig.addEventListener('click', () => {
      switchTab('config', true);
    });
  }
}

function loadTabData(tab) {
  switch (tab) {
    case 'projects':
      loadProjects();
      break;
    case 'gallery':
      loadGallerySelector();
      break;
    case 'services':
      loadServices();
      break;
    case 'brands':
      loadBrands();
      break;
    case 'bento':
      loadBentoCards();
      break;
    case 'uploads':
      // Setup dropzone events if not done
      initDropzone();
      break;
    case 'certificates':
      loadCertificates();
      break;
    case 'reviews':
      loadReviews();
      break;
    case 'config':
      loadConfigForm();
      break;
  }
}

// ==========================================
// 3b. AI CONTENT WRITER (Groq — FREE)
// ==========================================

const AI_COPY_STYLE_EXAMPLES = `
Here are examples of Vincent Dialing's portfolio copy style. Match this tone exactly:

SHORT DESCRIPTIONS (1-2 sentences for project cards):
- "Full social media branding for an internationally competing university chorale — from website launch graphics and audition campaigns to competition achievement posts that reached thousands."
- "A targeted social media campaign for World Choral Day 2024 — designed to drive engagement, celebrate the choir's community, and boost visibility during one of the biggest dates in the choral calendar."
- "The foundation year — building a recognizable social media identity from the ground up that would later scale into international-level branding."
- "Executed the full post-production workflow for the HUSAY 2026 official event video, transforming a script-based direction into a polished Facebook-ready production."

DETAILED WRITEUPS (first paragraph):
- "Served as the sole graphic designer and content director for Harmonia Polifonica Chorale throughout the 2024 season, handling all visual branding and social media content from concept to final output."
- "Handled the end-to-end visual campaign for the choir's World Choral Day 2024 participation — from content strategy and visual direction to design execution and delivery."
- "Started as the choir's first dedicated graphic designer in 2023, tasked with building a visual identity from zero and establishing the design standards that would define their brand going forward."

BULLET POINTS (deliverables/scope):
- "Led the full creative direction for the choir's social media presence across Facebook and Instagram"
- "Developed and maintained a cohesive brand identity system — color palette, typography, layout standards, and visual tone"
- "Managed the visual storytelling for a group competing at the international level, ensuring every piece matched the caliber of their achievements"
- "Planned and executed a multi-phase content campaign covering pre-event, day-of, and post-event stages"

STYLE RULES:
- Use em dashes (—) to connect ideas mid-sentence
- Be action-oriented and outcome-focused
- Mention specific deliverables, platforms, and results
- Professional but conversational tone
- Short descriptions should be 1-2 punchy sentences
- Detailed writeup should be 1 paragraph of first-person professional narrative
- Bullet points should list 4-5 specific deliverables or responsibilities
`;

function getGroqApiKey() {
  const localKey = localStorage.getItem('admin_groq_api_key')?.trim();
  if (localKey) return localKey;
  
  // Fallback to Vite environment variable configured in Vercel/local env
  return import.meta.env.VITE_GROQ_API_KEY || '';
}

function initAIWriter() {
  const generateBtn = document.getElementById('ai-generate-btn');
  if (!generateBtn) return;

  generateBtn.addEventListener('click', handleAIGenerate);

  // Tab switching setup
  const tabCreator = document.getElementById('ai-tab-creator');
  const tabCopywriter = document.getElementById('ai-tab-copywriter');
  const creatorContainer = document.getElementById('ai-creator-container');
  const copywriterContainer = document.getElementById('ai-copywriter-container');

  if (tabCreator && tabCopywriter && creatorContainer && copywriterContainer) {
    tabCreator.addEventListener('click', () => {
      tabCreator.classList.add('active');
      tabCreator.style.background = 'rgba(255, 255, 255, 0.08)';
      tabCreator.style.color = 'var(--text-primary)';
      tabCreator.style.borderColor = 'rgba(255, 255, 255, 0.08)';

      tabCopywriter.classList.remove('active');
      tabCopywriter.style.background = 'transparent';
      tabCopywriter.style.color = 'var(--text-muted)';
      tabCopywriter.style.borderColor = 'transparent';

      creatorContainer.classList.remove('hidden');
      copywriterContainer.classList.add('hidden');
    });

    tabCopywriter.addEventListener('click', () => {
      tabCopywriter.classList.add('active');
      tabCopywriter.style.background = 'rgba(255, 255, 255, 0.08)';
      tabCopywriter.style.color = 'var(--text-primary)';
      tabCopywriter.style.borderColor = 'rgba(255, 255, 255, 0.08)';

      tabCreator.classList.remove('active');
      tabCreator.style.background = 'transparent';
      tabCreator.style.color = 'var(--text-muted)';
      tabCreator.style.borderColor = 'transparent';

      copywriterContainer.classList.remove('hidden');
      creatorContainer.classList.add('hidden');
    });
  }

  // AI Creator input listener
  const aiImageInput = document.getElementById('ai-creator-image-input');
  const aiCreatorSubmitBtn = document.getElementById('ai-creator-submit-btn');
  const aiCreatorFileStatus = document.getElementById('ai-creator-file-status');
  const projectForm = document.getElementById('project-form');
  
  let selectedAIFiles = [];

  if (aiImageInput && aiCreatorSubmitBtn && aiCreatorFileStatus) {
    aiImageInput.addEventListener('change', (e) => {
      selectedAIFiles = Array.from(e.target.files);
      if (selectedAIFiles.length > 0) {
        aiCreatorFileStatus.textContent = `${selectedAIFiles.length} image(s) selected`;
        aiCreatorSubmitBtn.style.display = 'inline-flex';
      } else {
        aiCreatorFileStatus.textContent = 'No images selected';
        aiCreatorSubmitBtn.style.display = 'none';
      }
    });

    aiCreatorSubmitBtn.addEventListener('click', () => {
      if (selectedAIFiles.length > 0) {
        handleAICreateFromImage(selectedAIFiles);
      }
    });

    if (projectForm) {
      projectForm.addEventListener('reset', () => {
        selectedAIFiles = [];
        aiCreatorFileStatus.textContent = 'No images selected';
        aiCreatorSubmitBtn.style.display = 'none';
      });
    }
  }

  // Groq key save button
  const saveGroqKeyBtn = document.getElementById('save-gemini-key-btn') || document.getElementById('save-groq-key-btn');
  if (saveGroqKeyBtn) {
    saveGroqKeyBtn.addEventListener('click', () => {
      const keyInput = document.getElementById('config-gemini-key') || document.getElementById('config-groq-key');
      const statusEl = document.getElementById('gemini-key-status') || document.getElementById('groq-key-status');
      if (keyInput && keyInput.value.trim()) {
        localStorage.setItem('admin_groq_api_key', keyInput.value.trim());
        if (statusEl) {
          statusEl.textContent = '✓ Saved';
          statusEl.style.color = 'var(--success)';
          setTimeout(() => { statusEl.textContent = ''; }, 3000);
        }
      }
    });

    // Load saved key
    const savedKey = getGroqApiKey();
    const keyInput = document.getElementById('config-gemini-key') || document.getElementById('config-groq-key');
    if (savedKey && keyInput) keyInput.value = savedKey;

    // Show/hide no key warning on load
    const noKeyMsg = document.getElementById('ai-no-key-msg');
    if (noKeyMsg) {
      if (savedKey) {
        noKeyMsg.classList.add('hidden');
      } else {
        noKeyMsg.classList.remove('hidden');
      }
    }
  }

  // Toggle key visibility
  const toggleKey = document.getElementById('toggle-gemini-key') || document.getElementById('toggle-groq-key');
  if (toggleKey) {
    toggleKey.addEventListener('click', () => {
      const input = document.getElementById('config-gemini-key') || document.getElementById('config-groq-key');
      if (input) input.type = input.type === 'password' ? 'text' : 'password';
    });
  }
}

function initServiceAIWriter() {
  const btn = document.getElementById('service-ai-generate-btn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const apiKey = getGroqApiKey();
    const resultsContainer = document.getElementById('service-ai-results');
    const noKeyMsg = document.getElementById('service-ai-no-key-msg');

    if (!apiKey) {
      if (noKeyMsg) noKeyMsg.classList.remove('hidden');
      return;
    }
    if (noKeyMsg) noKeyMsg.classList.add('hidden');

    const serviceKey = document.getElementById('service-key').value.trim();
    const serviceTitle = document.getElementById('service-title').value.trim();

    if (!serviceKey) {
      showToast('Missing', 'Service key is required to scan projects.', 'error');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<div class="spinner-small"></div> Scanning projects...`;
    resultsContainer.classList.remove('hidden');
    resultsContainer.innerHTML = `<div class="ai-loading-indicator"><div class="spinner-small"></div><span>Scanning projects under "${serviceTitle}"...</span></div>`;

    try {
      // Fetch all projects under this service
      const { data: projects, error } = await supabase
        .from('portfolio_projects')
        .select('title, description, tools, category')
        .eq('service_key', serviceKey)
        .order('display_order', { ascending: true });

      if (error) throw error;

      if (!projects || projects.length === 0) {
        resultsContainer.innerHTML = `<p style="color:var(--text-muted);font-size:0.85rem;">No projects found under this service yet. Add some projects first, then generate.</p>`;
        return;
      }

      // Build context from all projects
      const projectSummaries = projects.map((p, i) =>
        `${i + 1}. "${p.title}" — ${p.category || ''} | Tools: ${Array.isArray(p.tools) ? p.tools.join(', ') : (p.tools || 'N/A')} | Desc: ${p.description || 'N/A'}`
      ).join('\n');

      // Collect all unique tools from ALL projects (programmatic, not AI)
      const mergedTools = [...new Set(
        projects.flatMap(p => Array.isArray(p.tools) ? p.tools : (p.tools || '').split(',').map(t => t.trim()).filter(Boolean))
      )].join(', ');

      // Build a short, punchy highlight stat from real data
      const uniqueCategories = [...new Set(projects.map(p => p.category).filter(Boolean))];
      const projectCount = projects.length;
      // Map raw category labels to short readable keywords
      const areaKeywords = [...new Set(
        uniqueCategories.flatMap(c =>
          c.toLowerCase().includes('brand') ? ['branding'] :
          c.toLowerCase().includes('event') ? ['events'] :
          c.toLowerCase().includes('social') ? ['social content'] :
          c.toLowerCase().includes('video') || c.toLowerCase().includes('edit') ? ['video production'] :
          c.toLowerCase().includes('web') || c.toLowerCase().includes('ui') ? ['web & UI'] :
          c.toLowerCase().includes('motion') ? ['motion graphics'] :
          c.toLowerCase().includes('campaign') ? ['campaigns'] :
          c.toLowerCase().includes('choral') || c.toLowerCase().includes('music') ? ['campaigns'] :
          [c.split(' ').slice(0, 2).join(' ')]
        )
      )].slice(0, 3);
      const areaPhrase = areaKeywords.length >= 2
        ? areaKeywords.slice(0, -1).join(', ') + ', and ' + areaKeywords[areaKeywords.length - 1]
        : areaKeywords[0] || 'creative projects';
      const computedStat = `${projectCount} project${projectCount !== 1 ? 's' : ''} across ${areaPhrase}.`;

      const prompt = `You are a portfolio copywriter for Vincent Dialing, a Filipino creative professional. Write copy that sounds polished, client-facing, and specific — the kind that makes someone want to hire him.

SERVICE: "${serviceTitle}"
PROJECTS UNDER THIS SERVICE (${projects.length} total):
${projectSummaries}

Write ONLY:
1. DESCRIPTION: Exactly 2 sentences. Around 40-55 words total. Sentence 1 describes what the service covers and the types of deliverables (be specific — mention real content types, platforms, or audiences from the projects). Sentence 2 states the outcome or value for the client. Use one em dash (—) naturally. Do NOT use generic phrases like "leveraging expertise" or "driving engagement." Be vivid and specific. 

CRITICAL: Do NOT mention or repeat the service title "${serviceTitle}" anywhere in the DESCRIPTION text. Repeating the title is redundant because it is already displayed prominently on the card. Start the description directly describing the work itself (e.g., "A curated collection of...", "Vivid visual design spanning...", etc.).

Good example: "A curated collection of social media content spanning event campaigns, chorale season launches, and branded community graphics — crafted to build recognition and keep audiences consistently engaged. Each project is built around a distinct visual direction tailored to the client's identity and goals."

2. BADGE: A short, punchy 2-3 word tag describing this service type (e.g. "Video Production", "Social Graphics", "Brand System", "UI/UX Design", "Merch Design"). Do NOT use "Case Study" — describe what it actually is based on the projects.

Format EXACTLY:
---DESCRIPTION---
[two sentences here]
---BADGE---
[badge text here]`;

      const groq = new Groq({ apiKey, dangerouslyAllowBrowser: true });
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are a client-facing portfolio copywriter. Write specific, vivid, compelling copy. Follow the format and word count exactly.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 350
      });

      const content = completion.choices[0].message.content;
      const description = extractSection(content, 'DESCRIPTION');
      const badgeText = extractSection(content, 'BADGE');
      // Highlight stat = programmatic (never AI — it hallucinates numbers)
      const shortBio = computedStat;
      // Tools = programmatic merge of ALL project tools
      const toolsList = mergedTools;

      resultsContainer.innerHTML = `
        ${badgeText ? `
          <div class="ai-result-card">
            <div class="ai-result-card-header">
              <span class="ai-result-label">Pill Badge Text (Suggested)</span>
              <button class="btn btn-xs btn-secondary ai-apply-btn" data-target="service-badge" data-value="${encodeURIComponent(badgeText)}">Apply</button>
            </div>
            <p class="ai-result-text" style="font-weight:600;color:var(--accent-light);">${badgeText}</p>
          </div>` : ''}
        ${description ? `
          <div class="ai-result-card">
            <div class="ai-result-card-header">
              <span class="ai-result-label">Description</span>
              <button class="btn btn-xs btn-secondary ai-apply-btn" data-target="service-desc" data-value="${encodeURIComponent(description)}">Apply</button>
            </div>
            <p class="ai-result-text">${description}</p>
          </div>` : ''}
        ${shortBio ? `
          <div class="ai-result-card">
            <div class="ai-result-card-header">
              <span class="ai-result-label">Highlight Stat</span>
              <button class="btn btn-xs btn-secondary ai-apply-btn" data-target="service-short-bio" data-value="${encodeURIComponent(shortBio)}">Apply</button>
            </div>
            <p class="ai-result-text">${shortBio}</p>
          </div>` : ''}
        ${toolsList ? `
          <div class="ai-result-card">
            <div class="ai-result-card-header">
              <span class="ai-result-label">Tools (merged from all projects)</span>
              <button class="btn btn-xs btn-secondary ai-apply-btn" data-target="service-tools" data-value="${encodeURIComponent(toolsList)}">Apply</button>
            </div>
            <p class="ai-result-text">${toolsList}</p>
          </div>` : ''}
        <button class="btn btn-primary btn-sm" id="service-ai-apply-all-btn" style="width:100%;margin-top:0.5rem;">
          ✓ Apply All
        </button>
      `;

      // Wire apply buttons
      resultsContainer.querySelectorAll('.ai-apply-btn').forEach(applyBtn => {
        applyBtn.addEventListener('click', () => {
          const targetId = applyBtn.dataset.target;
          const value = decodeURIComponent(applyBtn.dataset.value);
          const el = document.getElementById(targetId);
          if (el) el.value = value;
          applyBtn.textContent = '✓';
          applyBtn.disabled = true;
        });
      });

      const applyAllBtn = document.getElementById('service-ai-apply-all-btn');
      if (applyAllBtn) {
        applyAllBtn.addEventListener('click', () => {
          if (badgeText) { const el = document.getElementById('service-badge'); if(el) el.value = badgeText; }
          if (description) { const el = document.getElementById('service-desc'); if(el) el.value = description; }
          if (shortBio) { const el = document.getElementById('service-short-bio'); if(el) el.value = shortBio; }
          if (toolsList) { const el = document.getElementById('service-tools'); if(el) el.value = toolsList; }
          applyAllBtn.textContent = '✓ Applied!';
          applyAllBtn.disabled = true;
        });
      }

    } catch (err) {
      console.error('Service AI error:', err);
      resultsContainer.innerHTML = `<p style="color:var(--error);font-size:0.85rem;">Error: ${err.message}</p>`;
    } finally {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width:14px;height:14px"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Scan Projects & Generate`;
      btn.disabled = false;
    }
  });
}

async function handleAIGenerate() {
  const apiKey = getGroqApiKey();
  console.log('Groq API Key loaded:', apiKey ? `${apiKey.substring(0, 8)}...` : 'EMPTY/MISSING');
  const resultsContainer = document.getElementById('ai-writer-results');
  const noKeyMsg = document.getElementById('ai-no-key-msg');
  const generateBtn = document.getElementById('ai-generate-btn');

  if (!apiKey) {
    if (noKeyMsg) noKeyMsg.classList.remove('hidden');
    return;
  }
  if (noKeyMsg) noKeyMsg.classList.add('hidden');

  // Gather context from the form
  const title = document.getElementById('proj-title')?.value?.trim() || '';
  const category = document.getElementById('proj-category')?.value?.trim() || '';
  const serviceSelect = document.getElementById('proj-service-key');
  const serviceTitle = serviceSelect?.options[serviceSelect.selectedIndex]?.text || '';
  const tools = document.getElementById('proj-tools')?.value?.trim() || '';
  const existingDesc = document.getElementById('proj-desc')?.value?.trim() || '';
  const coverImage = document.getElementById('proj-image')?.value?.trim() || '';
  const extraContext = document.getElementById('ai-extra-context')?.value?.trim() || '';
  const projKey = document.getElementById('proj-key')?.value?.trim() || '';

  if (!title) {
    showToast('Missing Info', 'Please fill in at least the Project Title before generating copy.', 'error');
    return;
  }

  // Show loading state
  generateBtn.disabled = true;
  generateBtn.innerHTML = `<div class="spinner-small"></div> Scanning images & writing...`;
  resultsContainer.classList.remove('hidden');
  resultsContainer.innerHTML = `
    <div class="ai-loading-indicator">
      <div class="spinner-small"></div>
      <span>Scanning images and writing your copy...</span>
    </div>
  `;

  try {
    // 1. Gather all images (Cover Image + Gallery Images from Supabase)
    const imageUrls = [];
    if (coverImage && (coverImage.startsWith('http://') || coverImage.startsWith('https://'))) {
      imageUrls.push(coverImage);
    }

    if (projKey && supabase) {
      const { data: galleryData } = await supabase
        .from('portfolio_project_images')
        .select('image_url')
        .eq('project_key', projKey)
        .order('display_order', { ascending: true });
        
      if (galleryData && galleryData.length > 0) {
        galleryData.forEach(img => {
          if (img.image_url && (img.image_url.startsWith('http://') || img.image_url.startsWith('https://'))) {
            // Cap at 4 total images to prevent token overload
            if (imageUrls.length < 4) {
              imageUrls.push(img.image_url);
            }
          }
        });
      }
    }

    // 2. Build Prompt
    const userPromptText = `Generate portfolio copy for this project:

PROJECT TITLE: ${title}
SERVICE CATEGORY: ${serviceTitle}
SUB-CATEGORY: ${category}
TOOLS USED: ${tools || 'Not specified'}
EXISTING DESCRIPTION: ${existingDesc || 'None yet'}
${imageUrls.length > 0 ? `I have provided ${imageUrls.length} image(s) of this project. PLEASE ANALYZE THE IMAGES and use their visual details (content, style, event type, design elements) to write the copy!` : 'No images provided.'}
${extraContext ? `ADDITIONAL CONTEXT: ${extraContext}` : ''}

Please generate:
1. SHORT_DESCRIPTION: A comprehensive 1-2 sentence description (MUST BE EXACTLY 25 to 40 words). It MUST connect multiple details using an em dash (—). Include the main scope AND the specific impact/purpose. Example: "A targeted social media campaign for World Choral Day 2024 — designed to drive engagement, celebrate the choir's community, and boost visibility during one of the biggest dates in the choral calendar."
2. DETAILED_WRITEUP: A professional first-person paragraph (2-3 sentences) for the project detail page
3. BULLET_POINTS: 4-5 specific deliverables or responsibilities as bullet points
4. SUB_CATEGORY: A short 2-4 word label describing the specific type of project (e.g., 'Event Campaign Content', 'Social Media Branding', 'Product Showcase Reel').

Format your response exactly like this:
---SHORT_DESCRIPTION---
[your short description here]
---DETAILED_WRITEUP---
[your detailed paragraph here]
---BULLET_POINTS---
- [bullet 1]
- [bullet 2]
- [bullet 3]
- [bullet 4]
- [bullet 5]
---SUB_CATEGORY---
[your sub-category label here]`;

    // 3. Initialize Groq SDK
    const groq = new Groq({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    // 4. Build messages with images (Base64) if available
    const userContent = [];
    userContent.push({ type: 'text', text: userPromptText });

    let useVisionModel = false;

    if (imageUrls.length > 0) {
      for (const url of imageUrls) {
        try {
          const imgRes = await fetch(url);
          const blob = await imgRes.blob();

          // Compress & convert to WebP via Canvas for smaller file size
          const webpBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(blob);
            reader.onload = (event) => {
              const img = new Image();
              img.src = event.target.result;
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const scale = Math.min(MAX_WIDTH / img.width, 1); // don't upscale
                canvas.width = img.width * scale;
                canvas.height = img.height * scale;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/webp', 0.7));
              };
              img.onerror = reject;
            };
            reader.onerror = reject;
          });

          console.log(`Image compressed: ${(blob.size / 1024).toFixed(0)}KB → ~${(webpBase64.length * 0.75 / 1024).toFixed(0)}KB webp`);

          userContent.push({
            type: 'image_url',
            image_url: { url: webpBase64 }
          });
          useVisionModel = true;
        } catch (err) {
          console.warn('Failed to fetch/compress image for AI vision:', url, err);
        }
      }
    }

    const selectedModel = useVisionModel ? 'meta-llama/llama-4-scout-17b-16e-instruct' : 'llama-3.3-70b-versatile';
    console.log('Using Groq model:', selectedModel, '| Images:', imageUrls.length);

    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: selectedModel,
        messages: [
          { role: 'system', content: `You are a portfolio copywriter for Vincent Dialing, a Filipino creative professional. Write in his exact copy style. ${AI_COPY_STYLE_EXAMPLES}` },
          { role: 'user', content: useVisionModel ? userContent : userPromptText }
        ],
        temperature: 0.8,
        max_tokens: 1024
      });
    } catch (visionErr) {
      // If vision model fails, fallback to text-only
      if (useVisionModel) {
        console.warn('Groq Vision model failed, falling back to text-only:', visionErr.message);
        showToast('Vision Fallback', 'Vision model unavailable. Using text-only generation.', 'warning');
        completion = await groq.chat.completions.create({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: `You are a portfolio copywriter for Vincent Dialing, a Filipino creative professional. Write in his exact copy style. ${AI_COPY_STYLE_EXAMPLES}` },
            { role: 'user', content: userPromptText }
          ],
          temperature: 0.8,
          max_tokens: 1024
        });
      } else {
        throw visionErr;
      }
    }

    const content = completion.choices[0].message.content;

    if (!content) {
      throw new Error('No content returned from Groq. Please try again.');
    }

    // Parse the structured response
    const shortDesc = extractSection(content, 'SHORT_DESCRIPTION');
    const detailedWriteup = extractSection(content, 'DETAILED_WRITEUP');
    const bulletPoints = extractSection(content, 'BULLET_POINTS');
    const subCategory = extractSection(content, 'SUB_CATEGORY');

    // Auto-apply fields
    if (subCategory) {
      const catInput = document.getElementById('proj-category');
      if (catInput) {
        catInput.value = subCategory;
        catInput.dispatchEvent(new Event('input'));
      }
    }
    if (shortDesc) {
      const descInput = document.getElementById('proj-desc');
      if (descInput) {
        descInput.value = shortDesc;
        descInput.dispatchEvent(new Event('input'));
      }
    }
    if (detailedWriteup || bulletPoints) {
      saveBlockInputs();
      
      if (detailedWriteup) {
        const alreadyExists = currentDetailBlocks.some(b => b.type === 'text' && b.content === detailedWriteup);
        if (!alreadyExists) {
          currentDetailBlocks.push({ type: 'text', content: detailedWriteup });
        }
      }
      if (bulletPoints) {
        const items = bulletPoints.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(l => l);
        const alreadyExists = currentDetailBlocks.some(b => b.type === 'list' && JSON.stringify(b.items) === JSON.stringify(items));
        if (!alreadyExists) {
          currentDetailBlocks.push({ type: 'list', items: items });
        }
      }
      renderDetailBlocks();
    }

    // Display a beautiful success card in the results container
    resultsContainer.innerHTML = `
      <div style="background: rgba(46, 213, 115, 0.1); border: 1px solid var(--success); border-radius: 8px; padding: 0.75rem 1rem; color: #2ed573; font-size: 0.85rem; display: flex; align-items: center; gap: 0.5rem; margin-top: 0.5rem;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>
        <span style="font-weight: 500;">AI content successfully generated and auto-filled!</span>
      </div>
    `;

    showToast('AI Content Generated', 'Project category, description, and page blocks have been automatically updated.', 'success');

  } catch (err) {
    console.error('AI Writer error:', err);
    resultsContainer.innerHTML = `
      <div class="ai-result-card" style="border-color: rgba(239, 68, 68, 0.2);">
        <p class="ai-result-text" style="color: var(--error);">
          <strong>Error:</strong> ${err.message}
        </p>
        <p class="ai-result-text" style="margin-top: 0.5rem; font-size: 0.8rem;">
          Make sure your Groq API key is valid. Get a free key from <a href="https://console.groq.com/keys" target="_blank" style="color: var(--accent-light);">console.groq.com/keys</a>
        </p>
      </div>
    `;
  } finally {
    generateBtn.disabled = false;
    generateBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="width: 14px; height: 14px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
      Generate Copy
    `;
  }
}

async function handleAICreateFromImage(files) {
  if (!files || files.length === 0) return;

  const apiKey = getGroqApiKey();
  const loadingIndicator = document.getElementById('ai-creator-loading');
  const loadingText = document.getElementById('ai-creator-loading-text');
  const fileStatus = document.getElementById('ai-creator-file-status');
  const resultsContainer = document.getElementById('ai-writer-results');
  const noKeyMsg = document.getElementById('ai-no-key-msg');
  const extraContext = document.getElementById('ai-creator-extra-context')?.value?.trim() || '';
  const submitBtn = document.getElementById('ai-creator-submit-btn');

  if (!apiKey) {
    if (noKeyMsg) noKeyMsg.classList.remove('hidden');
    return;
  }
  if (noKeyMsg) noKeyMsg.classList.add('hidden');

  // 1. Show loading state
  fileStatus.textContent = `${files.length} image(s) selected`;
  if (loadingIndicator) loadingIndicator.classList.remove('hidden');
  if (loadingText) loadingText.textContent = `Uploading ${files.length} image(s)...`;
  if (resultsContainer) resultsContainer.classList.add('hidden');
  
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<div class="spinner-small" style="margin-right: 6px;"></div> Generating...`;
  }

  const uploadedUrls = [];
  try {
    // 2. Upload files to Supabase (automatically handles WebP conversion!)
    for (let i = 0; i < files.length; i++) {
      if (loadingText) loadingText.textContent = `Uploading image ${i + 1} of ${files.length}...`;
      const uploadResult = await uploadFileToSupabase(files[i], 'portfolio');
      uploadedUrls.push(uploadResult.url);
      console.log(`Image ${i + 1} uploaded successfully:`, uploadResult.url);
    }

    if (loadingText) loadingText.textContent = 'Preparing images for AI vision...';

    // 3. Compress & convert files to Base64 WebP for Llama Vision API (max 800px width)
    const base64Images = [];
    const numImagesForAI = Math.min(files.length, 4);
    for (let i = 0; i < numImagesForAI; i++) {
      if (loadingText) loadingText.textContent = `Processing image ${i + 1} of ${numImagesForAI}...`;
      const base64Image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(files[i]);
        reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 800;
            const scale = Math.min(MAX_WIDTH / img.width, 1);
            canvas.width = img.width * scale;
            canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/webp', 0.7));
          };
          img.onerror = reject;
        };
        reader.onerror = reject;
      });
      base64Images.push(base64Image);
    }

    if (loadingText) loadingText.textContent = 'Analyzing image(s) with Llama Vision model...';

    // 4. Gather available categories/services for the prompt
    const categoriesList = allServices.map(s => ` - "${s.key}": ${s.title}`).join('\n');

    // 5. Construct the Vision System & User Prompts
    let promptText = `Analyze the uploaded image(s) and identify what kind of graphic design/creative project it is.
Select the most appropriate category key from the list below:
${categoriesList}
`;

    if (extraContext) {
      promptText += `\nADDITIONAL CONTEXT & GUIDELINES FROM USER: ${extraContext}\n`;
    }

    promptText += `\nWrite the portfolio details for this project. Format your response strictly as a JSON object with the following keys. Do not include any markdown fences or explanation; just return the JSON object:
{
  "title": "A short, creative and catchy title for this design project (2-5 words)",
  "category_key": "the key matching one of the categories above",
  "sub_category": "A 2-4 word sub-category label (e.g., 'Event Campaign Infographics', 'Brand Identity Design', 'Social Media Branding')",
  "short_description": "A comprehensive 1-2 sentence description (25 to 40 words) connecting scope and purpose using an em dash —",
  "detailed_writeup": "A professional paragraph (2-3 sentences) detailing the creative approach, aesthetic elements, and execution details",
  "tools": "Photoshop, Illustrator, Figma (comma-separated list of 2-4 tools likely used for this style)",
  "gradient": "linear-gradient(135deg, #color1 0%, #color2 100%) (suggest a beautiful dark glassmorphic-themed gradient matching the dominant colors of the image)",
  "deliverables": [
    "Deliverable/responsibility 1",
    "Deliverable/responsibility 2",
    "Deliverable/responsibility 3",
    "Deliverable/responsibility 4"
  ]
}`;

    // 6. Initialize Groq and Call Vision Model
    const groq = new Groq({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    console.log('Sending vision request to Groq...');
    const userContent = [
      { type: 'text', text: promptText }
    ];
    base64Images.forEach(base64Image => {
      userContent.push({ type: 'image_url', image_url: { url: base64Image } });
    });

    const completion = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      messages: [
        {
          role: 'system',
          content: 'You are an AI portfolio assistant that responds ONLY with a valid JSON object. Do not include ```json or other formatting.'
        },
        {
          role: 'user',
          content: userContent
        }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1024
    });

    const aiResponseText = completion.choices[0].message.content;
    console.log('Groq Vision response:', aiResponseText);

    // 7. Parse Response
    const data = JSON.parse(aiResponseText);

    // 8. Auto-fill form fields
    if (data.title) {
      document.getElementById('proj-title').value = data.title;
      document.getElementById('proj-title').dispatchEvent(new Event('input'));
    }
    if (data.sub_category) {
      document.getElementById('proj-category').value = data.sub_category;
      document.getElementById('proj-category').dispatchEvent(new Event('input'));
    }
    if (data.short_description) {
      document.getElementById('proj-desc').value = data.short_description;
      document.getElementById('proj-desc').dispatchEvent(new Event('input'));
    }
    if (data.tools) {
      document.getElementById('proj-tools').value = data.tools;
      document.getElementById('proj-tools').dispatchEvent(new Event('input'));
    }
    if (data.gradient) {
      document.getElementById('proj-gradient').value = data.gradient;
      document.getElementById('proj-gradient').dispatchEvent(new Event('input'));
      const previewSwatch = document.getElementById('gradient-preview');
      if (previewSwatch) previewSwatch.style.background = data.gradient;
    }
    if (uploadedUrls[0]) {
      document.getElementById('proj-image').value = uploadedUrls[0];
      document.getElementById('proj-image').dispatchEvent(new Event('input'));
    }

    if (data.category_key) {
      const select = document.getElementById('proj-service-key');
      if (select) {
        select.value = data.category_key;
        // Trigger change event to auto-generate the project key
        select.dispatchEvent(new Event('change'));
      }
    }

    // 9. Populate Detail page content blocks
    currentDetailBlocks = [];
    if (data.detailed_writeup) {
      currentDetailBlocks.push({ type: 'text', content: data.detailed_writeup });
    }
    
    // Auto-append subsequent images as Image Blocks
    if (uploadedUrls.length > 1) {
      for (let i = 1; i < uploadedUrls.length; i++) {
        currentDetailBlocks.push({
          type: 'image',
          url: uploadedUrls[i],
          alt: `${data.title || 'Project'} detail image ${i + 1}`,
          redirect_url: '',
          redirect_label: ''
        });
      }
    }

    if (Array.isArray(data.deliverables) && data.deliverables.length > 0) {
      currentDetailBlocks.push({ type: 'list', items: data.deliverables });
    }
    renderDetailBlocks();

    // 10. Hide loading and show success toast
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    showToast('AI Auto-Fill Success', 'Project details auto-generated successfully!', 'success');

    // Render results status cards
    if (resultsContainer) {
      resultsContainer.classList.remove('hidden');
      resultsContainer.innerHTML = `
        <div class="ai-result-card" style="border-color: var(--success); background: rgba(46, 213, 115, 0.05);">
          <div class="ai-result-card-header" style="display: flex; align-items: center; gap: 0.5rem; color: var(--success); font-weight: 600; font-size: 0.85rem; margin-bottom: 0.5rem;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:16px;height:16px;flex-shrink:0;"><polyline points="20 6 9 17 4 12"/></svg>
            <span>AI Auto-Fill Success</span>
          </div>
          <div class="ai-result-text" style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.4;">
            Successfully generated <strong>"${data.title || 'Untitled'}"</strong> under category <strong>"${data.category_key || 'Uncategorized'}"</strong>.<br>
            All fields, including tools, gradient, and ${currentDetailBlocks.length} detail blocks have been filled out below. Review them and save the project!
          </div>
        </div>
      `;
    }

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.display = 'none';
    }
  } catch (err) {
    console.error('AI creator scan failed:', err);
    if (loadingIndicator) loadingIndicator.classList.add('hidden');
    showToast('AI Creator Error', `Failed to generate project details: ${err.message}`, 'error');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> Scan & Generate`;
    }
  }
}


function extractSection(text, sectionName) {
  const regex = new RegExp(`---${sectionName}---\\s*([\\s\\S]*?)(?=---[A-Z_]+---|$)`);
  const match = text.match(regex);
  return match ? match[1].trim() : '';
}

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ==========================================
// 4. PROJECTS MANAGEMENT CODE
// ==========================================

let allProjects = [];
let allServices = [];
let runProjectsFilter = null;
let projectsMarkedForDeletion = new Set();

async function fetchServices() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from('portfolio_services').select('*').order('display_order', { ascending: true });
    if (error) throw error;
    allServices = data || [];
    populateServiceSelects();
    return allServices;
  } catch (err) {
    const msg = (err && (err.message || err.error || err.statusText)) || JSON.stringify(err) || String(err);
    console.error('Error loading services:', err);
    showToast('Error', `Failed to load services categories: ${msg}`, 'error');
    return [];
  }
}

function populateServiceSelects() {
  // Populate filter select
  const filterSelect = document.getElementById('project-service-filter');
  if (filterSelect) {
    filterSelect.innerHTML = '<option value="">All Services</option>' + 
      allServices.map(s => `<option value="${s.key}">${s.title}</option>`).join('');

    // Restore saved filter from localStorage
    const savedFilter = localStorage.getItem('admin_projects_service_filter');
    if (savedFilter && filterSelect.querySelector(`option[value="${savedFilter}"]`)) {
      filterSelect.value = savedFilter;
    }
  }

  // Populate form select
  const formSelect = document.getElementById('proj-service-key');
  if (formSelect) {
    formSelect.innerHTML = '<option value="" disabled selected>-- Choose a category --</option>' + 
      allServices.map(s => `<option value="${s.key}">${s.title}</option>`).join('');
  }
}

async function loadProjects() {
  const container = document.getElementById('projects-list');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner-small"></div>
      <span>Loading projects data...</span>
    </div>
  `;

  if (allServices.length === 0) {
    await fetchServices();
  }

  if (!supabase) {
    container.innerHTML = '<div class="error-state"><p>Database is not connected.</p></div>';
    return;
  }

  try {
    const { data, error } = await supabase
      .from('portfolio_projects')
      .select('*')
      .order('display_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    allProjects = data || [];
    if (runProjectsFilter) {
      runProjectsFilter();
    } else {
      renderProjects(allProjects);
    }
  } catch (err) {
    console.error('Load projects error:', err);
    container.innerHTML = `
      <div class="error-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <h3>Failed to Fetch Projects</h3>
        <p>${err.message || 'An unexpected error occurred.'}</p>
        <button class="btn btn-secondary btn-sm" id="btn-retry-projects">Retry</button>
      </div>
    `;
    const retry = document.getElementById('btn-retry-projects');
    if (retry) retry.addEventListener('click', loadProjects);
  }
}

function renderProjects(projects) {
  const container = document.getElementById('projects-list');
  if (!container) return;

  if (projects.length === 0) {
    container.innerHTML = `
      <div class="no-assets-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="21 15 16 10 5 21"/></svg>
        <p>No projects found matching the criteria.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = projects.map(proj => {
    const service = allServices.find(s => s.key === proj.service_key);
    const serviceName = service ? service.title : proj.service_key;
    const tools = proj.tools || [];
    
    return `
      <div class="project-item-card" data-id="${proj.id}">
        <div class="card-image-wrap">
          <span class="card-service-badge">${serviceName}</span>
          ${proj.image_url 
            ? `<img src="${proj.image_url}" class="card-cover-img" alt="${proj.title}" loading="lazy">` 
            : `<div class="card-no-img">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:28px;height:28px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="21 15 16 10 5 21"/></svg>
                <span>No cover image</span>
               </div>`
          }
        </div>
        <div class="card-details-box">
          <div class="card-header-row">
            <h4 class="card-title">${proj.title}</h4>
            <span class="card-order-dot" title="Sort Order">Order: ${proj.display_order}</span>
          </div>
          <span class="card-category">${proj.category}</span>
          <p class="card-description">${proj.description}</p>
          
          <div class="card-tools-row">
            ${tools.map(t => `<span class="tool-pill">${t}</span>`).join('')}
          </div>
          
          <div class="card-actions-row">
            <button class="btn btn-secondary btn-sm edit-proj-btn" data-id="${proj.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Wire item listeners
  container.querySelectorAll('.edit-proj-btn').forEach(btn => {
    btn.addEventListener('click', () => openProjectModal(parseInt(btn.dataset.id)));
  });

}

// Live Search & Service filter for projects
function initProjectsFilter() {
  const searchInput = document.getElementById('project-search');
  const serviceSelect = document.getElementById('project-service-filter');

  runProjectsFilter = () => {
    if (!searchInput || !serviceSelect) return;
    const q = searchInput.value.toLowerCase().trim();
    const serviceKey = serviceSelect.value;

    const filtered = allProjects.filter(p => {
      const titleStr = p.title ? p.title.toLowerCase() : '';
      const catStr = p.category ? p.category.toLowerCase() : '';
      const descStr = p.description ? p.description.toLowerCase() : '';
      
      const matchSearch = titleStr.includes(q) || catStr.includes(q) || descStr.includes(q);
      const matchService = !serviceKey || p.service_key === serviceKey;
      return matchSearch && matchService;
    });

    renderProjects(filtered);
  };

  if (searchInput) searchInput.addEventListener('input', runProjectsFilter);
  if (serviceSelect) {
    serviceSelect.addEventListener('change', () => {
      localStorage.setItem('admin_projects_service_filter', serviceSelect.value);
      runProjectsFilter();
    });
  }
}

// JSON Block Builder details arrays
let currentDetailBlocks = [];

function renderDetailBlocks() {
  const container = document.getElementById('project-detail-blocks-container');
  if (!container) return;

  if (currentDetailBlocks.length === 0) {
    container.innerHTML = '<div class="no-blocks-msg">No content blocks added. Add text, video, or link blocks above to design the drill-down view.</div>';
    return;
  }

  container.innerHTML = currentDetailBlocks.map((block, index) => {
    let formFieldsHtml = '';

    if (block.type === 'text') {
      formFieldsHtml = `
        <div class="block-field-group">
          <label>Text Content</label>
          <textarea class="block-input-content" rows="2" required>${block.content || ''}</textarea>
        </div>
      `;
    } else if (block.type === 'list') {
      formFieldsHtml = `
        <div class="block-field-group">
          <label>List Items (One per line)</label>
          <textarea class="block-input-list-items" rows="4" required>${(block.items || []).join('\n')}</textarea>
        </div>
      `;
    } else if (block.type === 'video') {
      formFieldsHtml = `
        <div class="block-field-row">
          <div class="block-field-group">
            <label>Video URL (YouTube, Vimeo, Facebook Reel, etc.)</label>
            <input type="text" class="block-input-url" value="${block.url || ''}" required>
          </div>
          <div class="block-field-group">
            <label>Duration (e.g. 1:30)</label>
            <input type="text" class="block-input-duration" value="${block.duration || ''}">
          </div>
        </div>
        
        <div class="block-field-group">
          <label>Thumbnail Image URL (Optional - or Upload below)</label>
          <div class="input-with-upload">
            <input type="text" class="block-input-thumbnail" value="${(typeof block.thumbnail === 'string' && !block.thumbnail.startsWith('[object')) ? block.thumbnail : ''}" placeholder="https://...">
            <button type="button" class="btn btn-secondary btn-sm block-video-thumb-upload-btn btn-with-icon" style="padding: 0.5rem 0.8rem;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              Upload
            </button>
            <input type="file" class="block-video-thumb-file-input hidden" accept="image/*" style="display:none;">
          </div>
        </div>

        <div class="block-field-group">
          <label>Video Caption</label>
          <input type="text" class="block-input-caption" value="${block.caption || ''}">
        </div>
      `;
    } else if (block.type === 'link') {
      formFieldsHtml = `
        <div class="block-field-row">
          <div class="block-field-group">
            <label>Link URL</label>
            <input type="text" class="block-input-url" value="${block.url || ''}" required>
          </div>
          <div class="block-field-group">
            <label>Button Label</label>
            <input type="text" class="block-input-label" value="${block.label || ''}" required>
          </div>
        </div>
      `;
    } else if (block.type === 'certificate') {
      formFieldsHtml = `
        <div class="block-field-row">
          <div class="block-field-group">
            <label>Certificate ID Reference</label>
            <input type="text" class="block-input-cert-id" value="${block.certificateId || ''}" required>
          </div>
          <div class="block-field-group">
            <label>Button Label</label>
            <input type="text" class="block-input-label" value="${block.label || ''}" required>
          </div>
        </div>
      `;
    } else if (block.type === 'image') {
      formFieldsHtml = `
        <div class="block-field-group">
          <label>Image Source (URL or Upload)</label>
          <div class="input-with-upload">
            <input type="text" class="block-input-url" value="${block.url || ''}" placeholder="https://..." required>
            <button type="button" class="btn btn-secondary btn-sm block-image-upload-btn btn-with-icon" style="padding: 0.5rem 0.8rem;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
              Upload
            </button>
            <input type="file" class="block-image-file-input hidden" accept="image/*" style="display:none;">
          </div>
        </div>
        <div class="block-field-row">
          <div class="block-field-group">
            <label>Alt Text / Caption (Optional)</label>
            <input type="text" class="block-input-alt" value="${block.alt || ''}" placeholder="Image description">
          </div>
          <div class="block-field-group">
            <label>Redirect URL (Optional - click image to open link)</label>
            <input type="text" class="block-input-redirect-url" value="${block.redirect_url || ''}" placeholder="https://...">
          </div>
          <div class="block-field-group">
            <label>Redirect Label (Optional)</label>
            <input type="text" class="block-input-redirect-label" value="${block.redirect_label || ''}" placeholder="View Related Project">
          </div>
        </div>
      `;
    }

    return `
      <div class="detail-editor-block" data-index="${index}">
        <div class="block-header-row">
          <span class="block-badge-type ${block.type}">${block.type}</span>
          <div class="block-right-controls">
            <button type="button" class="btn-block-ctrl move-up-block" title="Move Up" ${index === 0 ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg>
            </button>
            <button type="button" class="btn-block-ctrl move-down-block" title="Move Down" ${index === currentDetailBlocks.length - 1 ? 'disabled' : ''}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <button type="button" class="btn-block-ctrl delete delete-block" title="Delete Block">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
        ${formFieldsHtml}
      </div>
    `;
  }).join('');

  // Wire block event listeners
  container.querySelectorAll('.delete-block').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.closest('.detail-editor-block').dataset.index);
      currentDetailBlocks.splice(idx, 1);
      renderDetailBlocks();
    });
  });

  container.querySelectorAll('.move-up-block').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.closest('.detail-editor-block').dataset.index);
      if (idx > 0) {
        saveBlockInputs();
        const temp = currentDetailBlocks[idx];
        currentDetailBlocks[idx] = currentDetailBlocks[idx - 1];
        currentDetailBlocks[idx - 1] = temp;
        renderDetailBlocks();
      }
    });
  });

  container.querySelectorAll('.move-down-block').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.closest('.detail-editor-block').dataset.index);
      if (idx < currentDetailBlocks.length - 1) {
        saveBlockInputs();
        const temp = currentDetailBlocks[idx];
        currentDetailBlocks[idx] = currentDetailBlocks[idx + 1];
        currentDetailBlocks[idx + 1] = temp;
        renderDetailBlocks();
      }
    });
  });

  // Wire upload buttons inside image blocks
  container.querySelectorAll('.block-image-upload-btn').forEach(btn => {
    const fileInput = btn.nextElementSibling;
    btn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-small" style="width:12px;height:12px;margin-right:0;"></span>...';
      btn.disabled = true;

      try {
        const bucketName = document.getElementById('upload-bucket-name')?.value.trim() || 'portfolio';
        const uploadRes = await uploadFileToSupabase(file, bucketName);
        const uploadedUrl = uploadRes.url;
        
        // Update input and block state
        const blockEl = btn.closest('.detail-editor-block');
        const idx = parseInt(blockEl.dataset.index);
        
        currentDetailBlocks[idx].url = uploadedUrl;
        
        // Update input field on UI
        const urlInput = blockEl.querySelector('.block-input-url');
        if (urlInput) {
          urlInput.value = uploadedUrl;
        }
        
        showToast('Uploaded', 'Image uploaded and converted successfully!', 'success');
      } catch (err) {
        console.error('Content image upload failed:', err);
        showToast('Upload Failed', err.message || 'Could not upload image.', 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  });

  // Wire upload buttons inside video blocks (thumbnails)
  container.querySelectorAll('.block-video-thumb-upload-btn').forEach(btn => {
    const fileInput = btn.nextElementSibling;
    btn.addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const originalText = btn.innerHTML;
      btn.innerHTML = '<span class="spinner-small" style="width:12px;height:12px;margin-right:0;"></span>...';
      btn.disabled = true;

      try {
        const bucketName = document.getElementById('upload-bucket-name')?.value.trim() || 'portfolio';
        const uploadRes = await uploadFileToSupabase(file, bucketName);
        const uploadedUrl = uploadRes.url;
        
        // Update input and block state
        const blockEl = btn.closest('.detail-editor-block');
        const idx = parseInt(blockEl.dataset.index);
        
        currentDetailBlocks[idx].thumbnail = uploadedUrl;
        
        // Update input field on UI
        const thumbInput = blockEl.querySelector('.block-input-thumbnail');
        if (thumbInput) {
          thumbInput.value = uploadedUrl;
        }
        
        showToast('Uploaded', 'Video thumbnail uploaded and converted successfully!', 'success');
      } catch (err) {
        console.error('Video thumbnail upload failed:', err);
        showToast('Upload Failed', err.message || 'Could not upload thumbnail.', 'error');
      } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
      }
    });
  });

  // Track live changes back to state when editing
  container.querySelectorAll('input, textarea').forEach(input => {
    input.addEventListener('change', saveBlockInputs);
  });
}

function saveBlockInputs() {
  const container = document.getElementById('project-detail-blocks-container');
  if (!container) return;

  const blocks = container.querySelectorAll('.detail-editor-block');
  blocks.forEach(blockEl => {
    const idx = parseInt(blockEl.dataset.index);
    const block = currentDetailBlocks[idx];

    if (block.type === 'text') {
      block.content = blockEl.querySelector('.block-input-content').value;
    } else if (block.type === 'list') {
      const textVal = blockEl.querySelector('.block-input-list-items').value || '';
      block.items = textVal.split('\n').map(l => l.trim()).filter(l => l);
    } else if (block.type === 'video') {
      block.url = blockEl.querySelector('.block-input-url').value;
      block.thumbnail = blockEl.querySelector('.block-input-thumbnail').value;
      block.caption = blockEl.querySelector('.block-input-caption').value;
      block.duration = blockEl.querySelector('.block-input-duration').value;
    } else if (block.type === 'link') {
      block.url = blockEl.querySelector('.block-input-url').value;
      block.label = blockEl.querySelector('.block-input-label').value;
    } else if (block.type === 'certificate') {
      block.certificateId = blockEl.querySelector('.block-input-cert-id').value;
      block.label = blockEl.querySelector('.block-input-label').value;
    } else if (block.type === 'image') {
      block.url = blockEl.querySelector('.block-input-url').value;
      block.alt = blockEl.querySelector('.block-input-alt').value;
      block.redirect_url = blockEl.querySelector('.block-input-redirect-url').value;
      block.redirect_label = blockEl.querySelector('.block-input-redirect-label').value;
    }
  });
}

function initJsonBlockBuilder() {
  document.getElementById('add-text-block-btn').addEventListener('click', () => {
    saveBlockInputs();
    currentDetailBlocks.push({ type: 'text', content: '' });
    renderDetailBlocks();
  });

  const addListBtn = document.getElementById('add-list-block-btn');
  if (addListBtn) {
    addListBtn.addEventListener('click', () => {
      saveBlockInputs();
      currentDetailBlocks.push({ type: 'list', items: [''] });
      renderDetailBlocks();
    });
  }

  document.getElementById('add-video-block-btn').addEventListener('click', () => {
    saveBlockInputs();
    currentDetailBlocks.push({ type: 'video', url: '', thumbnail: '', caption: '', duration: '' });
    renderDetailBlocks();
  });

  const addImgBtn = document.getElementById('add-image-block-btn');
  if (addImgBtn) {
    addImgBtn.addEventListener('click', () => {
      saveBlockInputs();
      currentDetailBlocks.push({ type: 'image', url: '', alt: '', redirect_url: '', redirect_label: '' });
      renderDetailBlocks();
    });
  }

  const addBatchBtn = document.getElementById('add-batch-images-btn');
  const batchInput = document.getElementById('project-batch-images-input');
  if (addBatchBtn && batchInput) {
    addBatchBtn.addEventListener('click', () => {
      batchInput.click();
    });

    batchInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files);
      if (files.length === 0) return;

      const originalText = addBatchBtn.innerHTML;
      addBatchBtn.disabled = true;
      addBatchBtn.innerHTML = `Uploading 0/${files.length}...`;

      saveBlockInputs();

      const bucketName = document.getElementById('upload-bucket-name')?.value.trim() || 'portfolio';
      let uploadedCount = 0;

      for (const file of files) {
        try {
          addBatchBtn.innerHTML = `Uploading ${uploadedCount + 1}/${files.length}...`;
          const uploadRes = await uploadFileToSupabase(file, bucketName);
          const url = uploadRes.url;
          
          currentDetailBlocks.push({
            type: 'image',
            url: url,
            alt: file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '), // Clean name for Alt text
            redirect_url: '',
            redirect_label: ''
          });
          
          uploadedCount++;
        } catch (err) {
          console.error(`Batch upload failed for ${file.name}:`, err);
          showToast('Upload Error', `Failed to upload ${file.name}`, 'error');
        }
      }

      addBatchBtn.innerHTML = originalText;
      addBatchBtn.disabled = false;
      batchInput.value = '';

      renderDetailBlocks();
      showToast('Batch Complete', `Successfully uploaded ${uploadedCount} of ${files.length} images!`, 'success');
    });
  }

  document.getElementById('add-link-block-btn').addEventListener('click', () => {
    saveBlockInputs();
    currentDetailBlocks.push({ type: 'link', url: '', label: '' });
    renderDetailBlocks();
  });

  document.getElementById('add-cert-block-btn').addEventListener('click', () => {
    saveBlockInputs();
    currentDetailBlocks.push({ type: 'certificate', certificateId: '', label: '' });
    renderDetailBlocks();
  });
}

// Modal open/close actions
function openProjectModal(projectId = null) {
  const modal = document.getElementById('project-modal');
  const title = document.getElementById('project-modal-title');
  const form = document.getElementById('project-form');
  
  form.reset();
  currentDetailBlocks = [];

  // Wire preset gradients to input
  const gradientInput = document.getElementById('proj-gradient');
  const gradientPreview = document.getElementById('gradient-preview');
  
  if (gradientInput && gradientPreview) {
    gradientInput.addEventListener('input', () => {
      gradientPreview.style.background = gradientInput.value;
    });
  }

  if (projectId) {
    title.textContent = 'Edit Project';
    const proj = allProjects.find(p => p.id === projectId);
    
    if (proj) {
      document.getElementById('project-db-id').value = proj.id;
      document.getElementById('proj-key').value = proj.project_key;
      document.getElementById('proj-key').readOnly = true; // Key should be immutable as it is unique & references other tables
      document.getElementById('proj-service-key').value = proj.service_key;
      document.getElementById('proj-title').value = proj.title;
      document.getElementById('proj-category').value = proj.category;
      document.getElementById('proj-desc').value = proj.description;
      document.getElementById('proj-gradient').value = proj.gradient;
      if (gradientPreview) gradientPreview.style.background = proj.gradient;
      document.getElementById('proj-order').value = proj.display_order;
      document.getElementById('proj-image').value = proj.image_url || '';
      document.getElementById('proj-tools').value = (proj.tools || []).join(', ');
      
      currentDetailBlocks = Array.isArray(proj.details) ? JSON.parse(JSON.stringify(proj.details)) : [];
    }
  } else {
    title.textContent = 'Add New Project';
    document.getElementById('project-db-id').value = '';
    document.getElementById('proj-key').readOnly = true;
    if (gradientPreview) gradientPreview.style.background = 'linear-gradient(135deg, #007bff 0%, #00d2ff 100%)';
  }

  renderDetailBlocks();
  openModal(modal);
}

async function handleProjectSubmit(e) {
  e.preventDefault();
  saveBlockInputs();

  const id = document.getElementById('project-db-id').value;
  const projectKey = document.getElementById('proj-key').value.trim();
  const serviceKey = document.getElementById('proj-service-key').value;
  const title = document.getElementById('proj-title').value.trim();
  const category = document.getElementById('proj-category').value.trim();
  const description = document.getElementById('proj-desc').value.trim();
  const gradient = document.getElementById('proj-gradient').value.trim();
  const order = parseInt(document.getElementById('proj-order').value) || 0;
  const imageUrl = document.getElementById('proj-image').value.trim();
  const toolsRaw = document.getElementById('proj-tools').value;
  const tools = toolsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0);

  const payload = {
    project_key: projectKey,
    service_key: serviceKey,
    title,
    category,
    description,
    gradient,
    display_order: order,
    image_url: imageUrl || null,
    tools,
    details: currentDetailBlocks
  };

  const submitBtn = document.getElementById('save-project-submit');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    let resultError = null;

    if (id) {
      // Update via server
      const result = await serverDbCall('update', 'portfolio_projects', payload, parseInt(id));
      resultError = result.error || null;
    } else {
      // Insert via server
      const result = await serverDbCall('insert', 'portfolio_projects', payload, null);
      resultError = result.error || null;
    }

    if (resultError) throw resultError;

    showToast('Success', `Project "${title}" saved successfully.`, 'success');
    closeModal('project-modal');
    loadProjects();
  } catch (err) {
    console.error('Error saving project:', err);
    showToast('Save Failed', err.message || 'Row Level Security policy blocked this save.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Save Project';
  }
}

async function deleteProject(id, projectKey) {
  if (!confirm(`Are you sure you want to delete this project? This will also cascade delete all associated gallery images from the database.`)) {
    return;
  }

  try {
    const result = await serverDbCall('delete', 'portfolio_projects', null, id);
    if (result.error) throw result.error;

    showToast('Deleted', `Project key "${projectKey}" deleted.`, 'success');
    loadProjects();
  } catch (err) {
    console.error('Delete project error:', err);
    showToast('Delete Failed', err.message || 'Bypassed by database config/RLS constraints.', 'error');
  }
}

// ==========================================
// 5. GALLERY MANAGEMENT CODE
// ==========================================

let galleryImages = [];
let galleryMarkedForDeletion = new Set();

async function loadGallerySelector() {
  const select = document.getElementById('gallery-project-selector');
  const serviceFilter = document.getElementById('gallery-service-filter');
  if (!select) return;

  if (allProjects.length === 0) {
    await fetchServices();
    // Load projects to get the list
    const { data } = await supabase.from('portfolio_projects').select('project_key, title, service_key').order('title');
    allProjects = data || [];
  }

  // Populate service filter dropdown
  if (serviceFilter) {
    serviceFilter.innerHTML = '<option value="">All Categories</option>' +
      allServices.map(s => `<option value="${s.key}">${s.title}</option>`).join('');

    // Remove old listener, add new
    serviceFilter.removeEventListener('change', handleGalleryServiceFilterChange);
    serviceFilter.addEventListener('change', handleGalleryServiceFilterChange);

    // Restore saved service filter
    const savedService = localStorage.getItem('admin_gallery_service_filter');
    if (savedService && serviceFilter.querySelector(`option[value="${savedService}"]`)) {
      serviceFilter.value = savedService;
    }
  }

  // Populate project dropdown based on restored or default service filter
  const activeService = serviceFilter ? serviceFilter.value : '';
  updateGalleryProjectOptions(activeService);

  // Restore saved project selection
  const savedProject = localStorage.getItem('admin_gallery_project');
  if (savedProject && select.querySelector(`option[value="${savedProject}"]`)) {
    select.value = savedProject;
    handleGalleryProjectChange();
  }

  // Wire select handler
  select.removeEventListener('change', handleGalleryProjectChange);
  select.addEventListener('change', handleGalleryProjectChange);
}

function handleGalleryServiceFilterChange() {
  const serviceFilter = document.getElementById('gallery-service-filter');
  const serviceKey = serviceFilter ? serviceFilter.value : '';
  localStorage.setItem('admin_gallery_service_filter', serviceKey);
  updateGalleryProjectOptions(serviceKey);

  // Reset project selection when service changes
  const select = document.getElementById('gallery-project-selector');
  if (select) select.value = '';
  localStorage.removeItem('admin_gallery_project');
  handleGalleryProjectChange();
}

function updateGalleryProjectOptions(serviceKey) {
  const select = document.getElementById('gallery-project-selector');
  if (!select) return;

  const filtered = serviceKey
    ? allProjects.filter(p => p.service_key === serviceKey)
    : allProjects;

  const serviceName = serviceKey
    ? (allServices.find(s => s.key === serviceKey)?.title || serviceKey)
    : '';

  const placeholder = serviceKey
    ? `-- ${filtered.length} project${filtered.length !== 1 ? 's' : ''} in ${serviceName} --`
    : `-- Choose a project (${allProjects.length}) --`;

  select.innerHTML = `<option value="">${placeholder}</option>` +
    filtered.map(p => `<option value="${p.project_key}">${p.title} (${p.project_key})</option>`).join('');
}

function handleGalleryProjectChange() {
  const select = document.getElementById('gallery-project-selector');
  const projectKey = select.value;
  localStorage.setItem('admin_gallery_project', projectKey);
  const addBtn = document.getElementById('add-gallery-img-btn');
  const noneBox = document.getElementById('gallery-info-none');
  const listGrid = document.getElementById('gallery-images-list');

  if (!projectKey) {
    addBtn.disabled = true;
    const editBtn = document.getElementById('edit-gallery-btn');
    if (editBtn) editBtn.disabled = true;
    noneBox.classList.remove('hidden');
    listGrid.classList.add('hidden');
    return;
  }

  addBtn.disabled = false;
  const editBtn = document.getElementById('edit-gallery-btn');
  if (editBtn) editBtn.disabled = false;
  noneBox.classList.add('hidden');
  listGrid.classList.remove('hidden');

  fetchGalleryImages(projectKey);
}

async function fetchGalleryImages(projectKey) {
  const listGrid = document.getElementById('gallery-images-list');
  if (!listGrid) return;

  listGrid.innerHTML = `
    <div class="loading-state">
      <div class="spinner-small"></div>
      <span>Loading gallery for ${projectKey}...</span>
    </div>
  `;

  try {
    const { data, error } = await supabase
      .from('portfolio_project_images')
      .select('*')
      .eq('project_key', projectKey)
      .order('display_order', { ascending: true });

    if (error) throw error;

    galleryImages = data || [];
    renderGallery();
  } catch (err) {
    console.error('Gallery fetch error:', err);
    listGrid.innerHTML = `<div class="error-state"><p>Error fetching gallery: ${err.message}</p></div>`;
  }
}

function renderGallery() {
  const listGrid = document.getElementById('gallery-images-list');
  if (!listGrid) return;

  if (galleryImages.length === 0) {
    listGrid.innerHTML = `
      <div class="no-assets-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="21 15 16 10 5 21"/></svg>
        <p>No gallery images uploaded for this project yet.</p>
      </div>
    `;
    return;
  }

  listGrid.innerHTML = galleryImages.map(img => `
    <div class="gallery-item-card" data-id="${img.id}" draggable="true">
      <div class="gallery-img-box">
        <img src="${img.image_url}" alt="" loading="lazy">
      </div>
      <span class="gallery-order-badge">Order: ${img.display_order}</span>
    </div>
  `).join('');


  // Drag-and-drop reordering is disabled in the main view; reordering is available in Edit mode.
}

function wireGalleryEditDragAndDrop() {
  const listEl = document.getElementById('gallery-edit-list');
  if (!listEl) return;

  const cards = listEl.querySelectorAll('.edit-thumb-card');
  let dragged = null;

  cards.forEach(card => {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', (e) => {
      dragged = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      if (card) card.classList.remove('dragging');
      dragged = null;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      const target = e.currentTarget;
      if (target && target !== dragged) {
        const children = Array.from(listEl.children);
        const draggedIndex = children.indexOf(dragged);
        const targetIndex = children.indexOf(target);

        if (draggedIndex < targetIndex) {
          listEl.insertBefore(dragged, target.nextSibling);
        } else {
          listEl.insertBefore(dragged, target);
        }
      }
    });
  });
}

function wireGalleryDragAndDrop() {
  const listGrid = document.getElementById('gallery-images-list');
  if (!listGrid) return;

  const cards = listGrid.querySelectorAll('.gallery-item-card');
  let draggedCard = null;

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      draggedCard = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', async () => {
      card.classList.remove('dragging');
      draggedCard = null;
      
      // Auto-save new order sequence to Supabase when drag ends
      await saveNewGalleryOrder();
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const targetCard = e.currentTarget;
      if (targetCard && targetCard !== draggedCard) {
        const children = Array.from(listGrid.children);
        const draggedIndex = children.indexOf(draggedCard);
        const targetIndex = children.indexOf(targetCard);

        if (draggedIndex < targetIndex) {
          listGrid.insertBefore(draggedCard, targetCard.nextSibling);
        } else {
          listGrid.insertBefore(draggedCard, targetCard);
        }
      }
    });
  });
}

async function saveNewGalleryOrder() {
  const listGrid = document.getElementById('gallery-images-list');
  if (!listGrid) return;

  const cards = listGrid.querySelectorAll('.gallery-item-card');
  const updates = [];

  cards.forEach((card, index) => {
    const id = parseInt(card.dataset.id);
    const order = index + 1;
    
    const badge = card.querySelector('.gallery-order-badge');
    if (badge) badge.textContent = `Order: ${order}`;

    updates.push({ id, order });
  });

  try {
    showToast('Saving Order...', 'Updating gallery sorting...', 'info');

    // Update display order sequentially in database
    for (const update of updates) {
      const { error } = await supabase
        .from('portfolio_project_images')
        .update({ display_order: update.order })
        .eq('id', update.id);
      
      if (error) throw error;
    }

    // Update local list structure to preserve new state
    const projectKey = document.getElementById('gallery-project-selector').value;
    const { data } = await supabase
      .from('portfolio_project_images')
      .select('*')
      .eq('project_key', projectKey)
      .order('display_order', { ascending: true });
    
    if (data) {
      galleryImages = data;
    }

    showToast('Order Saved', 'Images reordered successfully.', 'success');
  } catch (err) {
    console.error('Error saving order:', err);
    showToast('Reorder Failed', err.message, 'error');
  }
}

async function deleteGalleryImage(id) {
  if (!confirm('Are you sure you want to remove this image from the gallery?')) return;

  try {
    const { error } = await supabase
      .from('portfolio_project_images')
      .delete()
      .eq('id', id);

    if (error) throw error;

    showToast('Success', 'Image removed from gallery.', 'success');
    const projectKey = document.getElementById('gallery-project-selector').value;
    fetchGalleryImages(projectKey);
  } catch (err) {
    console.error('Delete gallery image error:', err);
    showToast('Delete Failed', err.message, 'error');
  }
}

function openGalleryModal() {
  const modal = document.getElementById('gallery-modal');
  const fileInput = document.getElementById('gallery-file-input');
  if (fileInput) fileInput.value = '';
  const progressContainer = document.getElementById('gallery-upload-progress');
  if (progressContainer) progressContainer.classList.add('hidden');
  openModal(modal);
}

function openGalleryEditModal() {
  const modal = document.getElementById('gallery-edit-modal');
  if (!modal) return;
  galleryMarkedForDeletion.clear();
  renderGalleryEditList();
  wireGalleryEditDragAndDrop();
  openModal(modal);
}

function renderGalleryEditList() {
  const listEl = document.getElementById('gallery-edit-list');
  if (!listEl) return;
  const projectKey = document.getElementById('gallery-project-selector').value;
  listEl.innerHTML = galleryImages.map(img => `
    <div class="edit-thumb-card" data-id="${img.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color); display:flex; flex-direction:column;">
      <img src="${img.image_url}" style="width:100%; height:110px; object-fit:cover; display:block;" alt="">
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px;">
        <button class="btn-icon gallery-edit-trash" data-id="${img.id}" title="Mark for delete" style="background: rgba(0,0,0,0.45); border: none; color: #fff; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-primary);"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.4rem 0.5rem; font-size:0.8rem; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05);">
        <span>Order: ${img.display_order}</span>
        <span style="font-weight:600; color:var(--text-primary)">ID: ${img.id}</span>
      </div>
      <div class="gallery-edit-inputs" style="padding: 0.5rem; display: flex; flex-direction: column; gap: 6px;">
        <div style="display:flex; flex-direction:column; gap:2px;">
          <label style="font-size:0.65rem; color:var(--text-secondary); text-transform:uppercase; font-weight:600;">Redirect URL</label>
          <input class="gallery-redirect-url" data-id="${img.id}" type="text" placeholder="e.g. #works/graphic-design/smc-4" value="${img.redirect_url || ''}" style="width: 100%; font-size: 0.75rem; padding: 4px 6px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
        </div>
        <div style="display:flex; flex-direction:column; gap:2px;">
          <label style="font-size:0.65rem; color:var(--text-secondary); text-transform:uppercase; font-weight:600;">Pill Label</label>
          <input class="gallery-redirect-label" data-id="${img.id}" type="text" placeholder="e.g. View Branding" value="${img.redirect_label || ''}" style="width: 100%; font-size: 0.75rem; padding: 4px 6px; background: rgba(0,0,0,0.25); border: 1px solid var(--border-color); border-radius: 4px; color: var(--text-primary);">
        </div>
      </div>
    </div>
  `).join('');

  // Wire per-item trash toggles
  listEl.querySelectorAll('.gallery-edit-trash').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const card = btn.closest('.edit-thumb-card');
      if (galleryMarkedForDeletion.has(id)) {
        galleryMarkedForDeletion.delete(id);
        if (card) card.style.opacity = '1';
        btn.style.background = 'rgba(0,0,0,0.45)';
      } else {
        galleryMarkedForDeletion.add(id);
        if (card) card.style.opacity = '0.45';
        btn.style.background = 'linear-gradient(90deg,#ef4444,#f97316)';
      }
    });
  });
}

async function saveGalleryEdits() {
  const toDelete = Array.from(galleryMarkedForDeletion);
  if (toDelete.length > 0 && !confirm(`Permanently delete ${toDelete.length} image(s)?`)) return;

  try {
    showToast('Saving Changes...', 'Applying gallery updates...', 'info');

    // First, update order and redirect values based on inputs
    const listEl = document.getElementById('gallery-edit-list');
    const children = Array.from(listEl.children);
    const updates = [];
    let orderCounter = 1;
    for (const child of children) {
      const id = parseInt(child.dataset.id);
      if (galleryMarkedForDeletion.has(id)) continue; // skip deleted
      
      const redirectUrlEl = child.querySelector(`.gallery-redirect-url[data-id="${id}"]`);
      const redirectLabelEl = child.querySelector(`.gallery-redirect-label[data-id="${id}"]`);
      const redirect_url = redirectUrlEl ? redirectUrlEl.value.trim() : '';
      const redirect_label = redirectLabelEl ? redirectLabelEl.value.trim() : '';

      updates.push({ id, order: orderCounter, redirect_url, redirect_label });
      orderCounter++;
    }

    // Apply updates (resilient to missing columns)
    for (const u of updates) {
      try {
        const res = await serverDbCall('update', 'portfolio_project_images', {
          display_order: u.order,
          redirect_url: u.redirect_url || null,
          redirect_label: u.redirect_label || null
        }, u.id);
        if (res.error) throw res.error;
      } catch (err) {
        // Fallback to updating only display order
        const res2 = await serverDbCall('update', 'portfolio_project_images', { display_order: u.order }, u.id);
        if (res2.error) throw res2.error;
      }
    }

    // Now delete marked items
    for (const id of toDelete) {
      const res = await serverDbCall('delete', 'portfolio_project_images', null, id);
      if (res.error) throw res.error;
    }

    showToast('Saved', 'Gallery changes applied.', 'success');
    const projectKey = document.getElementById('gallery-project-selector').value;
    fetchGalleryImages(projectKey);
    closeModal('gallery-edit-modal');
  } catch (err) {
    console.error('Error saving gallery updates:', err);
    showToast('Save Failed', err.message || 'Failed to apply gallery changes.', 'error');
  }
}

function wireModalCardDnD(listEl) {
  if (!listEl) return;
  const cards = listEl.querySelectorAll('.edit-thumb-card');
  let dragged = null;

  cards.forEach(card => {
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', (e) => {
      dragged = card;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      dragged = null;
    });

    card.addEventListener('dragover', (e) => {
      e.preventDefault();
      const target = e.currentTarget;
      if (!dragged || !target || target === dragged) return;
      const children = Array.from(listEl.children);
      const draggedIndex = children.indexOf(dragged);
      const targetIndex = children.indexOf(target);
      if (draggedIndex < targetIndex) {
        listEl.insertBefore(dragged, target.nextSibling);
      } else {
        listEl.insertBefore(dragged, target);
      }
    });
  });
}

function wireModalTrashButtons(listEl, markedSet, selector = '.entity-edit-trash') {
  if (!listEl) return;
  listEl.querySelectorAll(selector).forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      const card = btn.closest('.edit-thumb-card');
      if (markedSet.has(id)) {
        markedSet.delete(id);
        if (card) {
          card.classList.remove('marked-delete');
          card.style.opacity = '1';
        }
        btn.style.background = 'rgba(0,0,0,0.45)';
      } else {
        markedSet.add(id);
        if (card) {
          card.classList.add('marked-delete');
          card.style.opacity = '0.5';
        }
        btn.style.background = 'linear-gradient(90deg,#ef4444,#f97316)';
      }
    });
  });
}

function getOrderedIds(listEl, markedSet) {
  const ids = [];
  Array.from(listEl.children).forEach(child => {
    const id = parseInt(child.dataset.id);
    if (!markedSet.has(id)) ids.push(id);
  });
  return ids;
}

async function openProjectsEditModal() {
  if (allProjects.length === 0) await loadProjects();
  projectsMarkedForDeletion.clear();
  const listEl = document.getElementById('projects-edit-list');
  if (!listEl) return;

  const serviceSelect = document.getElementById('project-service-filter');
  const serviceKey = serviceSelect ? serviceSelect.value : '';

  const filteredProjects = serviceKey 
    ? allProjects.filter(p => p.service_key === serviceKey)
    : allProjects;

  listEl.innerHTML = filteredProjects.map(p => `
    <div class="edit-thumb-card" data-id="${p.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color); cursor:grab;">
      <img src="${p.image_url || 'https://placehold.co/600x380'}" style="width:100%; height:105px; object-fit:cover; display:block;" alt="${p.title}">
      <!-- Drag handle indicator -->
      <div class="drag-handle" style="position:absolute; top:8px; left:8px; background: rgba(0,0,0,0.65); color: #fff; padding: 4px; border-radius: 4px; z-index: 10; pointer-events: none; border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
      </div>
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px; z-index:10;">
        <button class="entity-edit-trash" data-id="${p.id}" title="Mark for delete" style="background: rgba(239, 68, 68, 0.9); border: none; color: #fff; width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.15);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;color:#fff;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.6rem;">
        <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary); line-height: 1.25; min-height: 2.2rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal;" title="${p.title}">${p.title}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary); margin-top: 0.15rem;">Order: ${p.display_order}</div>
      </div>
    </div>
  `).join('');

  wireModalCardDnD(listEl);
  wireModalTrashButtons(listEl, projectsMarkedForDeletion);
  openModal(document.getElementById('projects-edit-modal'));
}

async function saveProjectsEdits() {
  const listEl = document.getElementById('projects-edit-list');
  if (!listEl) return;
  const toDelete = Array.from(projectsMarkedForDeletion);
  const orderedIds = getOrderedIds(listEl, projectsMarkedForDeletion);

  if (toDelete.length > 0 && !confirm(`Permanently delete ${toDelete.length} project(s)?`)) return;

  try {
    showToast('Saving Changes...', 'Applying project updates...', 'info');
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('portfolio_projects').update({ display_order: i + 1 }).eq('id', orderedIds[i]);
      if (error) throw error;
    }
    for (const id of toDelete) {
      const { error } = await supabase.from('portfolio_projects').delete().eq('id', id);
      if (error) throw error;
    }
    closeModal('projects-edit-modal');
    await loadProjects();
    showToast('Saved', 'Projects updated successfully.', 'success');
  } catch (err) {
    console.error('Project edit save error:', err);
    showToast('Save Failed', err.message || 'Failed to update projects.', 'error');
  }
}

async function openServicesEditModal() {
  if (services.length === 0) await loadServices();
  servicesMarkedForDeletion.clear();
  const listEl = document.getElementById('services-edit-list');
  if (!listEl) return;

  listEl.innerHTML = services.map(s => `
    <div class="edit-thumb-card" data-id="${s.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color); cursor:grab;">
      <img src="${s.image_url || 'https://placehold.co/600x380'}" style="width:100%; height:105px; object-fit:cover; display:block;" alt="${s.title}">
      <!-- Drag handle indicator -->
      <div class="drag-handle" style="position:absolute; top:8px; left:8px; background: rgba(0,0,0,0.65); color: #fff; padding: 4px; border-radius: 4px; z-index: 10; pointer-events: none; border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
      </div>
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px; z-index:10;">
        <button class="entity-edit-trash" data-id="${s.id}" title="Mark for delete" style="background: rgba(239, 68, 68, 0.9); border: none; color: #fff; width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.15);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;color:#fff;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.6rem;">
        <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary); line-height: 1.25; min-height: 2.2rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal;" title="${s.title}">${s.title}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary); margin-top: 0.15rem;">Order: ${s.display_order}</div>
      </div>
    </div>
  `).join('');

  wireModalCardDnD(listEl);
  wireModalTrashButtons(listEl, servicesMarkedForDeletion);
  openModal(document.getElementById('services-edit-modal'));
}

async function saveServicesEdits() {
  const listEl = document.getElementById('services-edit-list');
  if (!listEl) return;
  const toDelete = Array.from(servicesMarkedForDeletion);
  const orderedIds = getOrderedIds(listEl, servicesMarkedForDeletion);

  if (toDelete.length > 0 && !confirm(`Permanently delete ${toDelete.length} service(s)?`)) return;

  try {
    showToast('Saving Changes...', 'Applying service updates...', 'info');
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('portfolio_services').update({ display_order: i + 1 }).eq('id', orderedIds[i]);
      if (error) throw error;
    }
    for (const id of toDelete) {
      const { error } = await supabase.from('portfolio_services').delete().eq('id', id);
      if (error) throw error;
    }
    closeModal('services-edit-modal');
    await loadServices();
    showToast('Saved', 'Services updated successfully.', 'success');
  } catch (err) {
    console.error('Service edit save error:', err);
    showToast('Save Failed', err.message || 'Failed to update services.', 'error');
  }
}

async function openBrandsEditModal() {
  if (brands.length === 0) await loadBrands();
  brandsMarkedForDeletion.clear();
  const listEl = document.getElementById('brands-edit-list');
  if (!listEl) return;

  listEl.innerHTML = brands.map((b, index) => `
    <div class="edit-thumb-card" data-id="${b.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color); cursor:grab;">
      <img src="${b.logo_url || 'https://placehold.co/600x380'}" style="width:100%; height:105px; object-fit:contain; background:#fff; display:block;" alt="${b.name}">
      <!-- Drag handle indicator -->
      <div class="drag-handle" style="position:absolute; top:8px; left:8px; background: rgba(0,0,0,0.65); color: #fff; padding: 4px; border-radius: 4px; z-index: 10; pointer-events: none; border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
      </div>
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px; z-index:10;">
        <button class="entity-edit-trash" data-id="${b.id}" title="Mark for delete" style="background: rgba(239, 68, 68, 0.9); border: none; color: #fff; width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.15);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;color:#fff;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.6rem;">
        <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary); line-height: 1.25; min-height: 2.2rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal;" title="${b.name}">${b.name}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary); margin-top: 0.15rem;">Position: ${index + 1}</div>
      </div>
    </div>
  `).join('');

  wireModalCardDnD(listEl);
  wireModalTrashButtons(listEl, brandsMarkedForDeletion);
  openModal(document.getElementById('brands-edit-modal'));
}

async function saveBrandsEdits() {
  const listEl = document.getElementById('brands-edit-list');
  if (!listEl) return;
  const toDelete = Array.from(brandsMarkedForDeletion);
  const orderedIds = getOrderedIds(listEl, brandsMarkedForDeletion);

  if (toDelete.length > 0 && !confirm(`Permanently delete ${toDelete.length} brand(s)?`)) return;

  try {
    showToast('Saving Changes...', 'Applying brand updates...', 'info');

    // Try to persist ordering if display_order exists on brands.
    let orderSupported = true;
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('brands').update({ display_order: i + 1 }).eq('id', orderedIds[i]);
      if (error) {
        orderSupported = false;
        break;
      }
    }

    for (const id of toDelete) {
      const { error } = await supabase.from('brands').delete().eq('id', id);
      if (error) throw error;
    }

    closeModal('brands-edit-modal');
    await loadBrands();
    if (!orderSupported) {
      showToast('Partially Saved', 'Deletes were saved. Brand reordering is not supported by current schema.', 'info');
    } else {
      showToast('Saved', 'Brands updated successfully.', 'success');
    }
  } catch (err) {
    console.error('Brand edit save error:', err);
    showToast('Save Failed', err.message || 'Failed to update brands.', 'error');
  }
}

async function openCommunityEditModal() {
  if (communityCards.length === 0) await loadCommunityCards();
  communityMarkedForDeletion.clear();
  const listEl = document.getElementById('community-edit-list');
  if (!listEl) return;

  listEl.innerHTML = communityCards.map(c => `
    <div class="edit-thumb-card" data-id="${c.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color); cursor:grab;">
      <img src="${c.image_url || 'https://placehold.co/600x380'}" style="width:100%; height:105px; object-fit:cover; display:block;" alt="${c.title}">
      <!-- Drag handle indicator -->
      <div class="drag-handle" style="position:absolute; top:8px; left:8px; background: rgba(0,0,0,0.65); color: #fff; padding: 4px; border-radius: 4px; z-index: 10; pointer-events: none; border: 1px solid rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px;"><circle cx="9" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="19" r="1"/></svg>
      </div>
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px; z-index:10;">
        <button class="entity-edit-trash" data-id="${c.id}" title="Mark for delete" style="background: rgba(239, 68, 68, 0.9); border: none; color: #fff; width: 28px; height: 28px; border-radius: 4px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s; border: 1px solid rgba(255,255,255,0.15);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:13px;height:13px;color:#fff;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.6rem;">
        <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary); line-height: 1.25; min-height: 2.2rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; white-space: normal;" title="${c.title}">${c.title}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary); margin-top: 0.15rem;">Order: ${c.display_order}</div>
      </div>
    </div>
  `).join('');

  wireModalCardDnD(listEl);
  wireModalTrashButtons(listEl, communityMarkedForDeletion);
  openModal(document.getElementById('community-edit-modal'));
}

async function saveCommunityEdits() {
  const listEl = document.getElementById('community-edit-list');
  if (!listEl) return;
  const toDelete = Array.from(communityMarkedForDeletion);
  const orderedIds = getOrderedIds(listEl, communityMarkedForDeletion);

  if (toDelete.length > 0 && !confirm(`Permanently delete ${toDelete.length} community card(s)?`)) return;

  try {
    showToast('Saving Changes...', 'Applying community card updates...', 'info');
    for (let i = 0; i < orderedIds.length; i++) {
      const { error } = await supabase.from('community_cards').update({ display_order: i + 1 }).eq('id', orderedIds[i]);
      if (error) throw error;
    }
    for (const id of toDelete) {
      const { error } = await supabase.from('community_cards').delete().eq('id', id);
      if (error) throw error;
    }
    closeModal('community-edit-modal');
    await loadCommunityCards();
    showToast('Saved', 'Community cards updated successfully.', 'success');
  } catch (err) {
    console.error('Community edit save error:', err);
    showToast('Save Failed', err.message || 'Failed to update community cards.', 'error');
  }
}

async function handleGalleryBatchUpload(files) {
  const projectKey = document.getElementById('gallery-project-selector').value;
  if (!projectKey) {
    showToast('No Project Selected', 'Please select a project first.', 'error');
    return;
  }

  const progressContainer = document.getElementById('gallery-upload-progress');
  const progressStatus = document.getElementById('gallery-progress-status');
  const progressPercent = document.getElementById('gallery-progress-percent');
  const progressBar = document.getElementById('gallery-progress-bar');

  if (progressContainer) progressContainer.classList.remove('hidden');

  let successCount = 0;
  let failCount = 0;
  const totalFiles = files.length;

  // Show initial starting state
  if (progressStatus) progressStatus.textContent = `Preparing ${totalFiles} file${totalFiles > 1 ? 's' : ''}...`;
  if (progressPercent) progressPercent.textContent = '0%';
  if (progressBar) progressBar.style.width = '2%'; // small initial indicator

  for (let i = 0; i < totalFiles; i++) {
    const file = files[i];

    // Update progress for every file (success or fail)
    const updateProgress = () => {
      const pct = Math.round(((i + 1) / totalFiles) * 100);
      if (progressPercent) progressPercent.textContent = `${pct}%`;
      if (progressBar) progressBar.style.width = `${pct}%`;
    };



    try {
      // Update status text BEFORE upload starts
      if (progressStatus) progressStatus.textContent = `Uploading ${i + 1} of ${totalFiles}: ${file.name}...`;

      // Wrap upload in a timeout (30 seconds) so it never hangs forever
      const uploadWithTimeout = (f) => {
        return Promise.race([
          uploadFileToSupabase(f, 'portfolio'),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timed out after 30 seconds')), 30000))
        ]);
      };

      const asset = await uploadWithTimeout(file);

      const order = galleryImages.length + successCount + 1;
      const payload = {
        project_key: projectKey,
        image_url: asset.url,
        alt: '',
        caption: '',
        display_order: order
      };

      const { error } = await supabase.from('portfolio_project_images').insert(payload);
      if (error) throw error;

      successCount++;
    } catch (err) {
      console.error(`[GalleryBatch] Error uploading "${file.name}":`, err);
      showToast('Upload Failed', `"${file.name}": ${err.message}`, 'error');
      failCount++;
    }

    // Always update progress after each file (success or fail)
    updateProgress();

    // Small delay between uploads to avoid rate-limiting
    if (i < totalFiles - 1) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  if (progressPercent) progressPercent.textContent = '100%';
  if (progressBar) progressBar.style.width = '100%';
  if (progressStatus) progressStatus.textContent = 'Done!';

  setTimeout(() => {
    if (progressContainer) progressContainer.classList.add('hidden');
    if (progressBar) progressBar.style.width = '0%';
    closeModal('gallery-modal');
    fetchGalleryImages(projectKey);

    if (successCount > 0) {
      showToast('Success', `Successfully uploaded and added ${successCount} images to gallery.`, 'success');
    }
  }, 1000);
}

function initGalleryUploadZone() {
  const dropzone = document.getElementById('gallery-dropzone');
  const fileInput = document.getElementById('gallery-file-input');

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--accent-color)';
    dropzone.style.background = 'rgba(255, 255, 255, 0.02)';
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.style.borderColor = 'var(--border-color)';
    dropzone.style.background = 'none';
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border-color)';
    dropzone.style.background = 'none';

    // Copy to array immediately — FileList is a live reference that dies after event ends
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleGalleryBatchUpload(files);
    }
  });

  fileInput.addEventListener('change', () => {
    // Copy to array immediately — clearing the input destroys the FileList
    const files = Array.from(fileInput.files);
    fileInput.value = ''; // safe to clear now, we have a copy
    if (files.length > 0) {
      handleGalleryBatchUpload(files);
    }
  });
}

// ==========================================
// 6. SERVICES MANAGEMENT CODE
// ==========================================

let services = [];
let servicesMarkedForDeletion = new Set();

async function loadServices() {
  const container = document.getElementById('services-list');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><div class="spinner-small"></div></div>';

  try {
    const { data, error } = await supabase
      .from('portfolio_services')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    services = data || [];
    renderServices();
  } catch (err) {
    console.error('Services load error:', err);
    container.innerHTML = `<div class="error-state"><p>Error fetching services: ${err.message}</p></div>`;
  }
}

function renderServices() {
  const container = document.getElementById('services-list');
  if (!container) return;

  if (services.length === 0) {
    container.innerHTML = '<div class="no-assets-state"><p>No services defined.</p></div>';
    return;
  }

  container.innerHTML = services.map(s => `
    <div class="service-item-card" data-id="${s.id}">
      <div class="service-img-preview ${!s.image_url ? 'no-image' : ''}">
        ${s.image_url 
          ? `<img src="${s.image_url}" alt="${s.title}">` 
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>`
        }
      </div>
      <div class="service-info">
        <h4>${s.title}</h4>
        <p>Key: <span>${s.key}</span> | Order: ${s.display_order}</p>
      </div>
      <div class="control-btn-group">
        <button class="action-icon-btn edit-service-btn" data-id="${s.id}" title="Edit Service">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Wire edits
  container.querySelectorAll('.edit-service-btn').forEach(btn => {
    btn.addEventListener('click', () => openServiceModal(parseInt(btn.dataset.id)));
  });

}

function openServiceModal(id = null) {
  const modal = document.getElementById('service-modal');
  const titleEl = document.getElementById('service-modal-title');
  const keyInput = document.getElementById('service-key');

  if (id) {
    const service = services.find(s => s.id === id);
    if (!service) return;

    titleEl.textContent = 'Edit Service';
    document.getElementById('service-db-id').value = service.id;
    keyInput.value = service.key;
    keyInput.readOnly = true; // Key should not change as it acts as foreign key
    document.getElementById('service-title').value = service.title;
    document.getElementById('service-image').value = service.image_url || '';
    document.getElementById('service-order').value = service.display_order;
    document.getElementById('service-desc').value = service.description || '';
    document.getElementById('service-short-bio').value = service.short_bio || '';
    document.getElementById('service-badge').value = service.badge || '';
    document.getElementById('service-tools').value = service.tools || '';
  } else {
    titleEl.textContent = 'Add New Service';
    document.getElementById('service-db-id').value = '';
    keyInput.value = '';
    keyInput.readOnly = false;
    document.getElementById('service-title').value = '';
    document.getElementById('service-image').value = '';
    document.getElementById('service-order').value = services.length + 1;
    document.getElementById('service-desc').value = '';
    document.getElementById('service-short-bio').value = '';
    document.getElementById('service-badge').value = '';
    document.getElementById('service-tools').value = '';
  }

  // Reset AI results panel
  const aiResults = document.getElementById('service-ai-results');
  if (aiResults) { aiResults.innerHTML = ''; aiResults.classList.add('hidden'); }

  // Reset Service Mockup Section
  const serviceMockupSec = document.getElementById('service-mockup-section');
  if (serviceMockupSec) {
    serviceMockupSec.style.display = 'none';
    const modalIndex = document.querySelector('#service-modal .modal-card');
    if (modalIndex) modalIndex.classList.remove('modal-large');
    const toggleBtn = document.getElementById('btn-toggle-service-mockup');
    if (toggleBtn) {
      toggleBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
        </svg>
        Generate Mockup Cover
      `;
    }
    const mainInput = document.getElementById('svc-mockup-img-main');
    const gridInput = document.getElementById('svc-mockup-img-grid');
    if (mainInput) mainInput.value = '';
    if (gridInput) gridInput.value = '';
    
    const canvas = document.getElementById('svc-mockup-canvas');
    if (canvas) {
      canvas.style.background = 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 100%)';
    }
    
    document.dispatchEvent(new CustomEvent('reset-service-mockup'));
  }

  openModal(modal);
}

async function handleServiceSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('service-db-id').value;
  const key = document.getElementById('service-key').value.trim().toLowerCase();
  const title = document.getElementById('service-title').value.trim();
  const imageUrl = document.getElementById('service-image').value.trim();
  const order = parseInt(document.getElementById('service-order').value) || 0;
  const description = document.getElementById('service-desc').value.trim();
  const shortBio = document.getElementById('service-short-bio').value.trim();
  const badge = document.getElementById('service-badge').value.trim();
  const tools = document.getElementById('service-tools').value.trim();

  const fullPayload = {
    title,
    image_url: imageUrl || null,
    display_order: order,
    description: description || null,
    short_bio: shortBio || null,
    badge: badge || null,
    tools: tools || null
  };

  const basePayload = { title, image_url: imageUrl || null, display_order: order };

  async function doSave(payload) {
    if (id) {
      const result = await serverDbCall('update', 'portfolio_services', payload, parseInt(id));
      if (result.error) throw result.error;
    } else {
      payload.key = key;
      const result = await serverDbCall('insert', 'portfolio_services', payload, null);
      if (result.error) throw result.error;
    }
  }

  try {
    // Try with all new fields first
    await doSave({ ...fullPayload });
    showToast('Success', 'Service updated successfully.', 'success');
    closeModal('service-modal');
    loadServices();
  } catch (err) {
    // If the error is about missing columns, check if we can save without the badge column
    if (err.message && (err.message.includes('column') || err.message.includes('schema'))) {
      try {
        const payloadWithoutBadge = {
          title,
          image_url: imageUrl || null,
          display_order: order,
          description: description || null,
          short_bio: shortBio || null,
          tools: tools || null
        };
        await doSave(payloadWithoutBadge);
        showToast('Success (No Badge)', 'Service saved successfully (description, bio, and tools). Note: Custom badge was not saved because the column is missing in Supabase.', 'warning');
        closeModal('service-modal');
        loadServices();
      } catch (fallbackErr) {
        // If it still fails, it means description/short_bio/tools are also missing, so do base payload
        try {
          await doSave({ ...basePayload });
          showToast('Saved (partial)', 'Service saved — but Description/Bio/Tools/Badge were not saved. Run the migration SQL in Supabase to enable these fields.', 'warning');
          closeModal('service-modal');
          loadServices();
        } catch (finalErr) {
          console.error('Save service final fallback error:', finalErr);
          showToast('Save Failed', finalErr.message, 'error');
        }
      }
    } else {
      console.error('Save service error:', err);
      showToast('Save Failed', err.message, 'error');
    }
  }
}

async function deleteService(id) {
  const service = services.find(s => s.id === id);
  if (!service) return;

  const confirmMsg = `Are you sure you want to delete the service "${service.title}"?\n\nWarning: Any project linked to this service key ("${service.key}") will no longer display in this category on the main portfolio page.`;
  if (!confirm(confirmMsg)) return;

  try {
    const result = await serverDbCall('delete', 'portfolio_services', null, id);
    if (result.error) throw result.error;

    showToast('Deleted', 'Service deleted successfully.', 'success');
    loadServices();
  } catch (err) {
    console.error('Delete service error:', err);
    showToast('Delete Failed', err.message, 'error');
  }
}

// ==========================================
// 7. BRANDS LOGOS MANAGEMENT
// ==========================================

let brands = [];
let brandsMarkedForDeletion = new Set();

async function loadBrands() {
  const container = document.getElementById('brands-list');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><div class="spinner-small"></div></div>';

  try {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('id', { ascending: true });

    if (error) throw error;

    brands = data || [];
    renderBrands();
  } catch (err) {
    console.error('Brands loading error:', err);
    container.innerHTML = `<div class="error-state"><p>Error fetching brands: ${err.message}</p></div>`;
  }
}

function renderBrands() {
  const container = document.getElementById('brands-list');
  if (!container) return;

  if (brands.length === 0) {
    container.innerHTML = `
      <div class="no-assets-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="21 15 16 10 5 21"/></svg>
        <p>No brand logos added yet.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = brands.map(b => `
    <div class="brand-item-card" data-id="${b.id}">
      <div class="brand-logo-preview">
        <img src="${b.logo_url}" alt="${b.name}" class="brand-logo">
      </div>
      <div class="brand-info">
        <h4>${b.name}</h4>
      </div>
      <div class="control-btn-group">
        <button class="action-icon-btn edit-brand-btn" data-id="${b.id}" title="Edit Name/Logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Wire edits and deletes
  container.querySelectorAll('.edit-brand-btn').forEach(btn => {
    btn.addEventListener('click', () => openBrandModal(parseInt(btn.dataset.id)));
  });
}

function openBrandModal(id = null) {
  const modal = document.getElementById('brand-modal');
  const title = document.getElementById('brand-modal-title');
  const form = document.getElementById('brand-form');
  form.reset();

  if (id) {
    title.textContent = 'Edit Brand Logo';
    const brand = brands.find(b => b.id === id);
    if (brand) {
      document.getElementById('brand-db-id').value = brand.id;
      document.getElementById('brand-name').value = brand.name;
      document.getElementById('brand-logo').value = brand.logo_url;
    }
  } else {
    title.textContent = 'Add Brand Logo';
    document.getElementById('brand-db-id').value = '';
  }

  openModal(modal);
}

async function handleBrandSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('brand-db-id').value;
  const name = document.getElementById('brand-name').value.trim();
  const logoUrl = document.getElementById('brand-logo').value.trim();

  const payload = { name, logo_url: logoUrl };

  try {
    if (id) {
      const { error } = await supabase.from('brands').update(payload).eq('id', parseInt(id));
      if (error) throw error;
      showToast('Updated', 'Brand logo updated successfully.', 'success');
    } else {
      const { error } = await supabase.from('brands').insert(payload);
      if (error) throw error;
      showToast('Added', 'Brand logo added successfully.', 'success');
    }

    closeModal('brand-modal');
    loadBrands();
  } catch (err) {
    console.error('Brand submit error:', err);
    showToast('Save Failed', err.message, 'error');
  }
}

async function deleteBrand(id) {
  if (!confirm('Are you sure you want to remove this brand logo?')) return;

  try {
    const { error } = await supabase.from('brands').delete().eq('id', id);
    if (error) throw error;

    showToast('Deleted', 'Brand logo removed.', 'success');
    loadBrands();
  } catch (err) {
    console.error('Delete brand error:', err);
    showToast('Delete Failed', err.message, 'error');
  }
}

// ==========================================
// 8. BENTO HOVER CARDS (Davao City + Carousel)
// ==========================================

let communityCards = [];
let communityMarkedForDeletion = new Set();

async function loadBentoCards() {
  loadLocationCard();
  loadCommunityCards();
}

async function loadLocationCard() {
  const container = document.getElementById('location-card-container');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><div class="spinner-small"></div></div>';

  try {
    const { data, error } = await supabase
      .from('location_card')
      .select('*')
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // Allow empty row

    if (data) {
      container.innerHTML = `
        <div class="bento-grid-item-inline">
          <div class="bento-preview-col">
            <div class="bento-img-container">
              <img src="${data.image_url || 'https://placehold.co/600x400'}" alt="${data.title}">
            </div>
          </div>
          <div class="bento-form-col">
            <form id="location-card-form">
              <input type="hidden" id="loc-id" value="${data.id}">
              <div class="form-row-two">
                <div class="form-group">
                  <label for="loc-label">Label (Top badge)</label>
                  <input type="text" id="loc-label" value="${data.label}">
                </div>
                <div class="form-group">
                  <label for="loc-title">Title</label>
                  <input type="text" id="loc-title" value="${data.title}">
                </div>
              </div>
              <div class="form-group">
                <label for="loc-desc">Description text</label>
                <input type="text" id="loc-desc" value="${data.description}">
              </div>
              <div class="form-group">
                <label for="loc-image">Card Image URL</label>
                <div class="input-with-upload">
                  <input type="text" id="loc-image" value="${data.image_url}">
                  <label class="btn-file-label">
                    <input type="file" class="file-uploader-inline" data-target-input="loc-image">
                    Upload
                  </label>
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-sm" id="btn-save-location">Save Location Card</button>
            </form>
          </div>
        </div>
      `;

      // Wire submit & inline files
      document.getElementById('location-card-form').addEventListener('submit', handleLocationSubmit);
      wireInlineFileUploads(document.getElementById('location-card-form'));
    } else {
      container.innerHTML = `<div class="error-state"><p>Location card data seed row not found.</p></div>`;
    }
  } catch (err) {
    console.error('Location card loading error:', err);
    container.innerHTML = `<div class="error-state"><p>Error loading location card: ${err.message}</p></div>`;
  }
}

async function handleLocationSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('loc-id').value;
  const label = document.getElementById('loc-label').value.trim();
  const title = document.getElementById('loc-title').value.trim();
  const description = document.getElementById('loc-desc').value.trim();
  const imageUrl = document.getElementById('loc-image').value.trim();

  const payload = { label, title, description, image_url: imageUrl };
  const saveBtn = document.getElementById('btn-save-location');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const { error } = await supabase
      .from('location_card')
      .update(payload)
      .eq('id', parseInt(id));

    if (error) throw error;

    showToast('Success', 'Location card updated successfully.', 'success');
    loadLocationCard();
  } catch (err) {
    console.error('Error updating location:', err);
    showToast('Save Failed', err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Location Card';
  }
}

async function loadCommunityCards() {
  const container = document.getElementById('community-cards-list');
  if (!container) return;

  container.innerHTML = '<div class="loading-state"><div class="spinner-small"></div></div>';

  try {
    const { data, error } = await supabase
      .from('community_cards')
      .select('*')
      .order('display_order', { ascending: true });

    if (error) throw error;

    communityCards = data || [];
    renderCommunityCards();
  } catch (err) {
    console.error('Community cards load error:', err);
    container.innerHTML = `<div class="error-state"><p>Error loading community cards: ${err.message}</p></div>`;
  }
}

function renderCommunityCards() {
  const container = document.getElementById('community-cards-list');
  if (!container) return;

  if (communityCards.length === 0) {
    container.innerHTML = '<div class="no-assets-state"><p>No community cards found.</p></div>';
    return;
  }

  container.innerHTML = communityCards.map(c => `
    <div class="community-card-row" data-id="${c.id}">
      <div class="comm-mini-preview">
        <img src="${c.image_url || 'https://placehold.co/600x400'}" alt="${c.title}">
      </div>
      <div class="comm-details">
        <h5>
          ${c.title} 
          <span class="comm-gradient-badge ${c.gradient_class || 'gradient-cyan'}">${c.gradient_class || 'Cyan'}</span>
        </h5>
        <p>${c.label} &bull; ${c.description}</p>
      </div>
      <div class="card-order-dot">Order: ${c.display_order}</div>
      <div class="control-btn-group">
        <button class="action-icon-btn edit-comm-btn" data-id="${c.id}" title="Edit Card">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Wire edits/deletes
  container.querySelectorAll('.edit-comm-btn').forEach(btn => {
    btn.addEventListener('click', () => openCommunityCardModal(parseInt(btn.dataset.id)));
  });
}

function openCommunityCardModal(id = null) {
  const modal = document.getElementById('community-card-modal');
  const title = document.getElementById('community-modal-title');
  const form = document.getElementById('community-card-form');
  form.reset();

  if (id) {
    title.textContent = 'Edit Community Card';
    const card = communityCards.find(c => c.id === id);
    if (card) {
      document.getElementById('community-db-id').value = card.id;
      document.getElementById('comm-label').value = card.label;
      document.getElementById('comm-title').value = card.title;
      document.getElementById('comm-desc').value = card.description;
      document.getElementById('comm-image').value = card.image_url || '';
      document.getElementById('comm-gradient').value = card.gradient_class || 'gradient-cyan';
      document.getElementById('comm-order').value = card.display_order;
    }
  } else {
    title.textContent = 'Add Community Card';
    document.getElementById('community-db-id').value = '';
    document.getElementById('comm-order').value = communityCards.length + 1;
  }

  openModal(modal);
}

async function handleCommunityCardSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('community-db-id').value;
  const label = document.getElementById('comm-label').value.trim();
  const title = document.getElementById('comm-title').value.trim();
  const description = document.getElementById('comm-desc').value.trim();
  const imageUrl = document.getElementById('comm-image').value.trim();
  const gradientClass = document.getElementById('comm-gradient').value;
  const order = parseInt(document.getElementById('comm-order').value) || 1;

  const payload = {
    label,
    title,
    description,
    image_url: imageUrl || null,
    gradient_class: gradientClass,
    display_order: order
  };

  try {
    if (id) {
      const { error } = await supabase.from('community_cards').update(payload).eq('id', parseInt(id));
      if (error) throw error;
      showToast('Updated', 'Community card updated successfully.', 'success');
    } else {
      const { error } = await supabase.from('community_cards').insert(payload);
      if (error) throw error;
      showToast('Added', 'Community card added successfully.', 'success');
    }

    closeModal('community-card-modal');
    loadCommunityCards();
  } catch (err) {
    console.error('Community card save error:', err);
    showToast('Save Failed', err.message, 'error');
  }
}

async function deleteCommunityCard(id) {
  if (!confirm('Are you sure you want to delete this community rotating card?')) return;

  try {
    const { error } = await supabase.from('community_cards').delete().eq('id', id);
    if (error) throw error;

    showToast('Success', 'Community card deleted.', 'success');
    loadCommunityCards();
  } catch (err) {
    console.error('Delete community card error:', err);
    showToast('Delete Failed', err.message, 'error');
  }
}

// ==========================================
// 9. FILE UPLOAD & STORAGE MANAGEMENT
// ==========================================

let sessionUploads = [];

function initDropzone() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');

  if (!dropzone || !fileInput) return;

  // Single setup check
  if (dropzone.dataset.initialized) return;
  dropzone.dataset.initialized = 'true';

  dropzone.addEventListener('click', () => fileInput.click());

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFilesUpload(files);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      handleFilesUpload(fileInput.files);
    }
  });

  // Verify bucket button
  const checkBtn = document.getElementById('check-bucket-btn');
  if (checkBtn) {
    checkBtn.addEventListener('click', verifyBucket);
  }

  // Clear history
  const clearBtn = document.getElementById('clear-upload-history-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      sessionUploads = [];
      renderUploadedAssets();
    });
  }

  renderUploadedAssets();
}

async function verifyBucket() {
  const bucketName = document.getElementById('upload-bucket-name').value.trim() || 'portfolio';
  
  if (!supabase) {
    showToast('Error', 'Database client not connected.', 'error');
    return;
  }

  try {
    const { data, error } = await supabase.storage.getBucket(bucketName);
    if (error) throw error;
    showToast('Success', `Bucket "${bucketName}" verified and accessible!`, 'success');
  } catch (err) {
    console.error('Bucket check error:', err);
    showToast('Bucket Inaccessible', `Failed to find or connect to bucket "${bucketName}". Make sure it exists in Supabase Storage and has public policies.`, 'error');
  }
}

async function uploadFileToSupabase(file, bucketName = 'portfolio') {
  // Resolve Supabase URL and key from the same sources as initSupabase
  const url = localStorage.getItem('admin_supabase_url') || import.meta.env.VITE_SUPABASE_URL;
  const key = localStorage.getItem('admin_supabase_key') || import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Database client not connected. Configure credentials first.');
  }

  // Compress/convert to WebP before uploading (skip SVG and GIF)
  let uploadFile = file;
  const skipTypes = ['image/svg+xml', 'image/gif'];
  if (file.type.startsWith('image/') && !skipTypes.includes(file.type)) {
    try {
      uploadFile = await compressToWebP(file, 0.82);
    } catch (err) {
      console.warn('WebP compression failed, uploading original:', err);
      uploadFile = file; // fallback to original
    }
  }

  // Generate unique URL-safe filename (use .webp extension for compressed files)
  const timestamp = Date.now();
  const baseName = file.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9.-]/g, '_');
  const ext = uploadFile === file ? file.name.split('.').pop() : 'webp';
  const filePath = `uploads/${timestamp}-${baseName}.${ext}`;

  let publicUrl;
  let useFallback = false;
  let response;

  try {
    response = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'x-file-name': file.name,
        'x-file-type': file.type,
        'x-bucket': bucketName
      },
      body: uploadFile
    });
    if (response.status === 404 || (!response.ok && supabase)) {
      useFallback = true;
    }
  } catch (err) {
    if (supabase) {
      useFallback = true;
      console.warn('API upload failed, falling back to client-side storage upload:', err);
    } else {
      throw err;
    }
  }

  if (useFallback) {
    const { data, error } = await supabase.storage.from(bucketName).upload(filePath, uploadFile, {
      contentType: uploadFile.type,
      upsert: true
    });
    if (error) {
      throw new Error(`Direct upload failed: ${error.message}`);
    }
    const { data: pubData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
    publicUrl = pubData.publicUrl;
  } else {
    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.message || errorBody.error || `Upload failed (HTTP ${response.status})`);
    }
    const respJson = await response.json();
    publicUrl = respJson?.publicUrl || `${url}/storage/v1/object/public/${bucketName}/${filePath}`;
  }

  const originalKB = (file.size / 1024).toFixed(1);
  const compressedKB = (uploadFile.size / 1024).toFixed(1);
  const saved = uploadFile !== file ? ` (was ${originalKB} KB → ${compressedKB} KB WebP)` : '';

  return {
    name: file.name,
    path: filePath,
    url: publicUrl,
    size: compressedKB + ' KB' + saved,
    time: new Date().toLocaleTimeString()
  };
}

/**
 * Compress an image file to WebP format using the Canvas API.
 * @param {File} file - The original image file
 * @param {number} quality - WebP quality 0-1 (0.82 = great balance of quality/size)
 * @returns {Promise<File>} - A new File object in WebP format
 */
function compressToWebP(file, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Canvas toBlob failed'));
            return;
          }

          const webpName = file.name.replace(/\.[^.]+$/, '.webp');
          const webpFile = new File([blob], webpName, { type: 'image/webp' });

          // Always resolve the WebP file as requested by user
          resolve(webpFile);
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = objectUrl;
  });
}

async function handleFilesUpload(files) {
  const bucketName = document.getElementById('upload-bucket-name').value.trim() || 'portfolio';
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    


    showToast('Uploading', `Uploading ${file.name}...`, 'info');

    try {
      const asset = await uploadFileToSupabase(file, bucketName);
      sessionUploads.unshift(asset); // Add to beginning
      successCount++;
    } catch (err) {
      console.error(`Upload error for ${file.name}:`, err);
      showToast('Upload Failed', `Could not upload "${file.name}": ${err.message}`, 'error');
      failCount++;
    }
  }

  if (successCount > 0) {
    showToast('Upload Success', `Successfully uploaded ${successCount} files.`, 'success');
    renderUploadedAssets();
  }
}

function renderUploadedAssets() {
  const container = document.getElementById('uploaded-assets-grid');
  if (!container) return;

  if (sessionUploads.length === 0) {
    container.innerHTML = `
      <div class="no-assets-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="21 15 16 10 5 21"/></svg>
        <p>No files uploaded in this session yet.</p>
        <p class="subtext">Uploaded files will appear here with links to copy.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = sessionUploads.map((asset, index) => `
    <div class="asset-row-card">
      <div class="asset-mini-preview">
        <img src="${asset.url}" alt="${asset.name}" onerror="this.src='https://placehold.co/100x100?text=File'">
      </div>
      <div class="asset-details-box">
        <div class="asset-name" title="${asset.name}">${asset.name}</div>
        <div class="asset-size-time">${asset.size} &bull; Uploaded at ${asset.time}</div>
      </div>
      <div class="asset-actions">
        <button class="btn btn-secondary btn-xs copy-asset-url" data-url="${asset.url}">Copy URL</button>
      </div>
    </div>
  `).join('');

  // Wire copy buttons
  container.querySelectorAll('.copy-asset-url').forEach(btn => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.url)
        .then(() => {
          btn.textContent = 'Copied!';
          showToast('Copied', 'Image URL copied to clipboard.', 'success');
          setTimeout(() => { btn.textContent = 'Copy URL'; }, 2000);
        })
        .catch(err => {
          console.error('Clipboard copy error:', err);
          showToast('Copy Failed', 'Please manually copy the URL.', 'error');
        });
    });
  });
}

// Inline upload triggers inside other forms (e.g. projects, brands cover upload inputs)
function wireInlineFileUploads(parent = document) {
  const uploaders = parent.querySelectorAll('.file-uploader-inline');
  uploaders.forEach(uploader => {
    uploader.addEventListener('change', async () => {
      const file = uploader.files[0];
      const targetInputId = uploader.dataset.targetInput;
      const targetInput = document.getElementById(targetInputId);

      if (!file || !targetInput) return;

      const label = uploader.closest('.btn-file-label');
      const originalText = label ? label.textContent : 'Upload';
      if (label) label.textContent = 'Saving...';

      try {
        const bucketName = document.getElementById('upload-bucket-name')?.value || 'portfolio';
        const asset = await uploadFileToSupabase(file, bucketName);
        targetInput.value = asset.url;
        
        // Trigger input event to update previews (like gradient preview)
        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        
        showToast('Uploaded', `Asset saved to storage: ${file.name}`, 'success');
        
        // Also add to session history if uploads panel is active
        sessionUploads.unshift(asset);
        renderUploadedAssets();
      } catch (err) {
        console.error('Inline file upload error:', err);
        showToast('Upload Failed', err.message, 'error');
      } finally {
        if (label) label.textContent = originalText;
        uploader.value = ''; // Reset uploader input
      }
    });
  });
}

// ==========================================
// 10. SUPABASE CREDENTIALS OVERRIDES FORM
// ==========================================

function loadConfigForm() {
  const urlInput = document.getElementById('config-url');
  const keyInput = document.getElementById('config-key');

  if (urlInput) urlInput.value = localStorage.getItem('admin_supabase_url') || envUrl || '';
  if (keyInput) keyInput.value = localStorage.getItem('admin_supabase_key') || envAnonKey || '';
}

function initConfigPanel() {
  const form = document.getElementById('config-form');
  const resetBtn = document.getElementById('config-reset-btn');
  const toggleBtn = document.getElementById('toggle-config-key');
  const keyInput = document.getElementById('config-key');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const url = document.getElementById('config-url').value.trim();
      const key = keyInput.value.trim();

      if (url && key) {
        localStorage.setItem('admin_supabase_url', url);
        localStorage.setItem('admin_supabase_key', key);
        
        showToast('Credentials Saved', 'Connecting with new credentials...', 'success');
        
        // Reinitialize client
        supabase = initSupabase();
        testConnection();

        // Refresh dropdown entries and tables
        fetchServices().then(() => {
          if (activeTab === 'projects') loadProjects();
        });
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      localStorage.removeItem('admin_supabase_url');
      localStorage.removeItem('admin_supabase_key');
      
      showToast('Reset Config', 'Credentials reset to default (.env variables).', 'info');
      
      loadConfigForm();
      supabase = initSupabase();
      testConnection();
      
      fetchServices().then(() => {
        if (activeTab === 'projects') loadProjects();
      });
    });
  }

  if (toggleBtn && keyInput) {
    toggleBtn.addEventListener('click', () => {
      const isPassword = keyInput.type === 'password';
      keyInput.type = isPassword ? 'text' : 'password';
    });
  }

  // Copy SQL script block
  const copyBtn = document.querySelector('.btn-copy-code');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const codeBlock = document.getElementById(copyBtn.dataset.copyTarget);
      if (codeBlock) {
        navigator.clipboard.writeText(codeBlock.innerText)
          .then(() => {
            copyBtn.textContent = 'Copied!';
            showToast('Copied', 'SQL commands copied to clipboard.', 'success');
            setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
          })
          .catch(err => {
            showToast('Failed to copy', 'Manual copy required.', 'error');
          });
      }
    });
  }
}

// ==========================================
// 11. GENERAL MODAL TRIGGERS
// ==========================================

function openModal(modal) {
  if (!modal) return;
  modal.classList.add('is-open');
  const resetScroll = () => {
    const scrollables = modal.querySelectorAll('.modal-form, .edit-list-scroll-wrap');
    scrollables.forEach(el => {
      el.scrollTop = 0;
    });
  };
  resetScroll();
  // Neutralize browser focus auto-scroll after transitions
  setTimeout(resetScroll, 50);
  setTimeout(resetScroll, 150);
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('is-open');
}

function initModalCloseHandlers() {
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    // Backdrop click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('is-open');
      }
    });

    // Close button click
    const closeBtn = modal.querySelector('.modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.classList.remove('is-open'));
    }

    // Cancel button click
    const cancelBtn = modal.querySelector('.modal-cancel-btn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => modal.classList.remove('is-open'));
    }
  });

  // Esc key close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-backdrop').forEach(modal => {
        modal.classList.remove('is-open');
      });
    }
  });
}

// ==========================================
// Strict Zoom Lock (Bypass Chrome Minimum Font Bugs)
// ==========================================
function applyStrictZoomLock() {
  if (window.innerWidth >= 1024) {
    const scale = window.innerWidth / 1728;
    const finalZoom = Math.min(1, scale);
    document.body.style.zoom = finalZoom;
    document.documentElement.style.setProperty('--zoom-factor', finalZoom);
  } else {
    document.body.style.zoom = 1;
    document.documentElement.style.setProperty('--zoom-factor', 1);
  }
}
window.addEventListener('resize', applyStrictZoomLock);
applyStrictZoomLock();

// ==========================================
// 13. MASTER PASSWORD LOGIN CONTROL
// ==========================================
function initLoginControl() {
  const loginOverlay = document.getElementById('login-screen');
  const loginForm = document.getElementById('login-form');
  const passcodeField = document.getElementById('login-passcode');
  const errorMsg = document.getElementById('login-error-msg');
  const logoutBtn = document.getElementById('logout-btn');

  const correctPasscode = import.meta.env.VITE_ADMIN_PASSWORD || 'vincentadmin';

  // Check existing session
  const isAuthenticated = sessionStorage.getItem('admin_authenticated') === 'true';

  if (isAuthenticated) {
    if (loginOverlay) loginOverlay.classList.add('hidden');
  } else {
    if (loginOverlay) loginOverlay.classList.remove('hidden');
  }

  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const enteredValue = passcodeField.value.trim();

      if (enteredValue === correctPasscode) {
        sessionStorage.setItem('admin_authenticated', 'true');
        if (loginOverlay) loginOverlay.classList.add('hidden');
        showToast('Access Granted', 'Welcome back, Vincent!', 'success');
        passcodeField.value = '';
        errorMsg.classList.add('hidden');
      } else {
        errorMsg.classList.remove('hidden');
        passcodeField.value = '';
        passcodeField.focus();
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      sessionStorage.removeItem('admin_authenticated');
      if (loginOverlay) loginOverlay.classList.remove('hidden');
      showToast('Logged Out', 'Successfully locked the dashboard.', 'info');
    });
  }
}

function initProjectKeyAutoFill() {
  const serviceKeySelect = document.getElementById('proj-service-key');
  const projectKeyInput = document.getElementById('proj-key');
  const projectDbIdInput = document.getElementById('project-db-id');

  if (serviceKeySelect && projectKeyInput && projectDbIdInput) {
    serviceKeySelect.addEventListener('change', () => {
      // Only auto-fill if we are creating a new project (not editing)
      if (!projectDbIdInput.value) {
        const selectedServiceKey = serviceKeySelect.value;
        if (!selectedServiceKey) return;

        // Find all projects with this service key
        const matchingProjects = allProjects.filter(p => p.service_key === selectedServiceKey || p.project_key.startsWith(`${selectedServiceKey}-`));
        
        let maxNum = 0;
        matchingProjects.forEach(p => {
          const parts = p.project_key.split('-');
          if (parts.length > 1) {
            const num = parseInt(parts[parts.length - 1]);
            if (!isNaN(num) && num > maxNum) {
              maxNum = num;
            }
          }
        });

        const nextNum = maxNum + 1;
        projectKeyInput.value = `${selectedServiceKey}-${nextNum}`;
      }
    });
  }
}

// ==========================================
// 11b. CERTIFICATES MANAGEMENT
// ==========================================

let certificates = [];

async function loadCertificates() {
  const container = document.getElementById('certificates-list');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner-small"></div>
      <span>Loading certificates data...</span>
    </div>
  `;

  if (!supabase) {
    container.innerHTML = '<div class="error-state"><p>Database is not connected.</p></div>';
    return;
  }

  try {
    const { data, error } = await supabase
      .from('portfolio_certificates')
      .select('*')
      .order('display_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    certificates = data || [];
    renderCertificates();
  } catch (err) {
    console.error('Load certificates error:', err);
    container.innerHTML = `
      <div class="error-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <h3>Failed to Fetch Certificates</h3>
        <p>${err.message || 'An unexpected error occurred.'}</p>
        <button class="btn btn-secondary btn-sm" id="btn-retry-certs">Retry</button>
      </div>
    `;
    const retry = document.getElementById('btn-retry-certs');
    if (retry) retry.addEventListener('click', loadCertificates);
  }
}

function renderCertificates() {
  const container = document.getElementById('certificates-list');
  if (!container) return;

  if (certificates.length === 0) {
    container.innerHTML = `
      <div class="no-assets-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="21 15 16 10 5 21"/></svg>
        <p>No certificates found.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = certificates.map(c => `
    <div class="service-item-card" data-id="${c.id}">
      <div class="service-img-preview">
        <img src="${c.image_url}" alt="${c.title}" style="object-fit: contain; background: #111;">
      </div>
      <div class="service-info">
        <h4>${c.title}</h4>
        <p>Issuer: <span>${c.issuer}</span> | Date: ${c.date} | Order: ${c.display_order}</p>
      </div>
      <div class="control-btn-group">
        <button class="action-icon-btn edit-cert-btn" data-id="${c.id}" title="Edit Certificate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="action-icon-btn delete delete-cert-btn" data-id="${c.id}" title="Delete Certificate">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Wire events
  container.querySelectorAll('.edit-cert-btn').forEach(btn => {
    btn.addEventListener('click', () => openCertificateModal(parseInt(btn.dataset.id)));
  });

  container.querySelectorAll('.delete-cert-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteCertificate(parseInt(btn.dataset.id)));
  });
}

function openCertificateModal(id = null) {
  const modal = document.getElementById('certificate-modal');
  const title = document.getElementById('certificate-modal-title');
  const form = document.getElementById('certificate-form');
  form.reset();

  if (id) {
    title.textContent = 'Edit Certificate';
    const cert = certificates.find(c => c.id === id);
    if (cert) {
      document.getElementById('certificate-db-id').value = cert.id;
      document.getElementById('cert-id').value = cert.certificate_id || '';
      document.getElementById('cert-title').value = cert.title || '';
      document.getElementById('cert-issuer').value = cert.issuer || '';
      document.getElementById('cert-date').value = cert.date || '';
      document.getElementById('cert-link').value = cert.link || '';
      document.getElementById('cert-image').value = cert.image_url || '';
      document.getElementById('cert-order').value = cert.display_order || 0;
    }
  } else {
    title.textContent = 'Add Certificate';
    document.getElementById('certificate-db-id').value = '';
    document.getElementById('cert-order').value = certificates.length + 1;
  }

  openModal(modal);
}

async function handleCertificateSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('certificate-db-id').value;
  const certId = document.getElementById('cert-id').value.trim();
  const title = document.getElementById('cert-title').value.trim();
  const issuer = document.getElementById('cert-issuer').value.trim();
  const date = document.getElementById('cert-date').value.trim();
  const link = document.getElementById('cert-link').value.trim() || '#';
  const imageUrl = document.getElementById('cert-image').value.trim();
  const displayOrder = parseInt(document.getElementById('cert-order').value) || 0;

  const payload = {
    certificate_id: certId || null,
    title,
    issuer,
    date,
    link,
    image_url: imageUrl,
    display_order: displayOrder
  };

  try {
    if (id) {
      const result = await serverDbCall('update', 'portfolio_certificates', payload, parseInt(id));
      if (result.error) throw result.error;
      showToast('Updated', 'Certificate updated successfully.', 'success');
    } else {
      const result = await serverDbCall('insert', 'portfolio_certificates', payload, null);
      if (result.error) throw result.error;
      showToast('Added', 'Certificate added successfully.', 'success');
    }

    closeModal('certificate-modal');
    loadCertificates();
  } catch (err) {
    console.error('Certificate submit error:', err);
    showToast('Save Failed', err.message || 'Could not save certificate.', 'error');
  }
}

// ==========================================
// 11b-2. AI CERTIFICATE SCANNER
// ==========================================

function initCertificateScanner() {
  const scanBtn = document.getElementById('cert-scan-btn');
  if (!scanBtn) return;

  scanBtn.addEventListener('click', handleCertScan);
}

async function handleCertScan() {
  const fileInput = document.getElementById('cert-scan-file');
  const scanBtn = document.getElementById('cert-scan-btn');
  const loadingEl = document.getElementById('cert-scan-loading');
  const loadingText = document.getElementById('cert-scan-loading-text');

  if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
    showToast('No Image', 'Please select a certificate image first.', 'error');
    return;
  }

  const apiKey = getGroqApiKey();
  if (!apiKey) {
    showToast('No API Key', 'Please configure your Groq API key in the Settings tab first.', 'error');
    return;
  }

  const file = fileInput.files[0];
  const originalBtnHtml = scanBtn.innerHTML;
  scanBtn.disabled = true;
  scanBtn.innerHTML = `<div class="spinner-small" style="width:12px;height:12px;margin-right:6px;"></div> Scanning...`;
  if (loadingEl) loadingEl.classList.remove('hidden');

  try {
    // 1. Upload to Supabase first
    if (loadingText) loadingText.textContent = 'Uploading certificate image...';
    const bucketName = document.getElementById('upload-bucket-name')?.value.trim() || 'portfolio';
    const uploadResult = await uploadFileToSupabase(file, bucketName);
    const uploadedUrl = uploadResult.url;

    // Fill the image URL field immediately
    const certImageInput = document.getElementById('cert-image');
    if (certImageInput) certImageInput.value = uploadedUrl;

    // 2. Compress & convert to Base64 for Vision API
    if (loadingText) loadingText.textContent = 'Processing image for AI analysis...';
    const base64Image = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1024;
          const scale = Math.min(MAX_WIDTH / img.width, 1);
          canvas.width = img.width * scale;
          canvas.height = img.height * scale;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/webp', 0.8));
        };
        img.onerror = reject;
      };
      reader.onerror = reject;
    });

    // 3. Call Groq Vision API
    if (loadingText) loadingText.textContent = 'AI is reading the certificate...';

    const promptText = `Analyze this certificate/credential image carefully. Extract ALL visible text and information from it.

Return a JSON object with these exact keys:
{
  "certificate_id": "a short, URL-friendly slug based on the certificate name and year, e.g. 'google-ux-design-2024' or 'husay-2026'. Use lowercase with hyphens.",
  "title": "The full official title/name of the certificate exactly as written on it",
  "issuer": "The organization or institution that issued this certificate (e.g. 'Google', 'Coursera', 'HUSAY')",
  "date": "The issue date as shown on the certificate. Format as 'Issued Mon YYYY' (e.g. 'Issued Jun 2024'). If only a year is visible, use 'Issued YYYY'.",
  "link": "Any verification URL or credential ID visible on the certificate. If none found, return empty string."
}

IMPORTANT: Only return the JSON object, no markdown fences, no explanation.`;

    const groq = new Groq({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true
    });

    const visionModels = [
      'meta-llama/llama-4-scout-17b-16e-instruct',
      'qwen/qwen3.6-27b',
      'llama-3.3-70b-versatile'
    ];

    let aiResponse = null;
    for (const model of visionModels) {
      try {
        if (loadingText) loadingText.textContent = `Scanning with ${model.split('/').pop()}...`;
        const completion = await groq.chat.completions.create({
          model: model,
          messages: [
            {
              role: 'system',
              content: 'You are a precise OCR assistant that extracts certificate information from images. Respond ONLY with a valid JSON object.'
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: promptText },
                { type: 'image_url', image_url: { url: base64Image } }
              ]
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3,
          max_tokens: 512
        });
        aiResponse = completion.choices[0].message.content;
        console.log(`Certificate scan succeeded with model: ${model}`);
        break;
      } catch (modelErr) {
        console.warn(`Model ${model} failed:`, modelErr.message);
        if (model === visionModels[visionModels.length - 1]) throw modelErr;
      }
    }

    console.log('Certificate scan response:', aiResponse);
    const data = JSON.parse(aiResponse);

    // 4. Auto-fill form fields
    if (data.certificate_id) {
      document.getElementById('cert-id').value = data.certificate_id;
    }
    if (data.title) {
      document.getElementById('cert-title').value = data.title;
    }
    if (data.issuer) {
      document.getElementById('cert-issuer').value = data.issuer;
    }
    if (data.date) {
      document.getElementById('cert-date').value = data.date;
    }
    if (data.link) {
      document.getElementById('cert-link').value = data.link;
    }

    showToast('Scanned!', 'Certificate data extracted and auto-filled successfully.', 'success');

  } catch (err) {
    console.error('Certificate scan error:', err);
    showToast('Scan Failed', err.message || 'Could not scan the certificate image.', 'error');
  } finally {
    scanBtn.innerHTML = originalBtnHtml;
    scanBtn.disabled = false;
    if (loadingEl) loadingEl.classList.add('hidden');
  }
}

async function deleteCertificate(id) {
  const cert = certificates.find(c => c.id === id);
  if (!cert) return;

  if (!confirm(`Are you sure you want to delete the certificate "${cert.title}"?`)) return;

  try {
    const result = await serverDbCall('delete', 'portfolio_certificates', null, id);
    if (result.error) throw result.error;

    showToast('Deleted', 'Certificate removed.', 'success');
    loadCertificates();
  } catch (err) {
    console.error('Delete certificate error:', err);
    showToast('Delete Failed', err.message || 'Could not delete certificate.', 'error');
  }
}

// ==========================================
// 11c. CLIENT REVIEWS MANAGEMENT
// ==========================================

let reviews = [];

async function loadReviews() {
  const container = document.getElementById('reviews-list');
  if (!container) return;

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner-small"></div>
      <span>Loading reviews data...</span>
    </div>
  `;

  if (!supabase) {
    container.innerHTML = '<div class="error-state"><p>Database is not connected.</p></div>';
    return;
  }

  try {
    const { data, error } = await supabase
      .from('portfolio_reviews')
      .select('*')
      .order('display_order', { ascending: true })
      .order('id', { ascending: true });

    if (error) throw error;

    reviews = data || [];
    renderReviews();
  } catch (err) {
    console.error('Load reviews error:', err);
    container.innerHTML = `
      <div class="error-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <h3>Failed to Fetch Reviews</h3>
        <p>${err.message || 'An unexpected error occurred.'}</p>
        <button class="btn btn-secondary btn-sm" id="btn-retry-reviews">Retry</button>
      </div>
    `;
    const retry = document.getElementById('btn-retry-reviews');
    if (retry) retry.addEventListener('click', loadReviews);
  }
}

function renderReviews() {
  const container = document.getElementById('reviews-list');
  if (!container) return;

  if (reviews.length === 0) {
    container.innerHTML = `
      <div class="no-assets-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><polyline points="21 15 16 10 5 21"/></svg>
        <p>No client reviews found.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = reviews.map(r => `
    <div class="service-item-card" data-id="${r.id}">
      <div class="service-img-preview ${!r.avatar_url ? 'no-image' : ''}">
        ${r.avatar_url 
          ? `<img src="${r.avatar_url}" alt="${r.author_name}">` 
          : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
        }
      </div>
      <div class="service-info">
        <h4>${r.author_name}</h4>
        <p>Title: <span>${r.author_title}</span> | Order: ${r.display_order}</p>
        <p style="white-space:nowrap; text-overflow:ellipsis; overflow:hidden; font-size:0.75rem; color:var(--text-secondary); margin-top:0.25rem;">"${r.review_text}"</p>
      </div>
      <div class="control-btn-group">
        <button class="action-icon-btn edit-review-btn" data-id="${r.id}" title="Edit Review">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
        <button class="action-icon-btn delete delete-review-btn" data-id="${r.id}" title="Delete Review">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
    </div>
  `).join('');

  // Wire events
  container.querySelectorAll('.edit-review-btn').forEach(btn => {
    btn.addEventListener('click', () => openReviewModal(parseInt(btn.dataset.id)));
  });

  container.querySelectorAll('.delete-review-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteReview(parseInt(btn.dataset.id)));
  });
}

function openReviewModal(id = null) {
  const modal = document.getElementById('review-modal');
  const title = document.getElementById('review-modal-title');
  const form = document.getElementById('review-form');
  form.reset();

  if (id) {
    title.textContent = 'Edit Client Review';
    const rev = reviews.find(r => r.id === id);
    if (rev) {
      document.getElementById('review-db-id').value = rev.id;
      document.getElementById('review-author-name').value = rev.author_name || '';
      document.getElementById('review-author-title').value = rev.author_title || '';
      document.getElementById('review-text').value = rev.review_text || '';
      document.getElementById('review-avatar').value = rev.avatar_url || '';
      document.getElementById('review-order').value = rev.display_order || 0;
    }
  } else {
    title.textContent = 'Add Client Review';
    document.getElementById('review-db-id').value = '';
    document.getElementById('review-order').value = reviews.length + 1;
  }

  openModal(modal);
}

async function handleReviewSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('review-db-id').value;
  const authorName = document.getElementById('review-author-name').value.trim();
  const authorTitle = document.getElementById('review-author-title').value.trim();
  const reviewText = document.getElementById('review-text').value.trim();
  const avatarUrl = document.getElementById('review-avatar').value.trim();
  const displayOrder = parseInt(document.getElementById('review-order').value) || 0;

  const payload = {
    author_name: authorName,
    author_title: authorTitle,
    review_text: reviewText,
    avatar_url: avatarUrl || null,
    display_order: displayOrder
  };

  try {
    if (id) {
      const result = await serverDbCall('update', 'portfolio_reviews', payload, parseInt(id));
      if (result.error) throw result.error;
      showToast('Updated', 'Review updated successfully.', 'success');
    } else {
      const result = await serverDbCall('insert', 'portfolio_reviews', payload, null);
      if (result.error) throw result.error;
      showToast('Added', 'Review added successfully.', 'success');
    }

    closeModal('review-modal');
    loadReviews();
  } catch (err) {
    console.error('Review submit error:', err);
    showToast('Save Failed', err.message || 'Could not save review.', 'error');
  }
}

async function deleteReview(id) {
  const rev = reviews.find(r => r.id === id);
  if (!rev) return;

  if (!confirm(`Are you sure you want to delete the review from "${rev.author_name}"?`)) return;

  try {
    const result = await serverDbCall('delete', 'portfolio_reviews', null, id);
    if (result.error) throw result.error;

    showToast('Deleted', 'Review removed.', 'success');
    loadReviews();
  } catch (err) {
    console.error('Delete review error:', err);
    showToast('Delete Failed', err.message || 'Could not delete review.', 'error');
  }
}

// ==========================================
// 12. RUNTIME STARTUP CODE
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize login gating
  initLoginControl();

  // Initialize project key auto-generator
  initProjectKeyAutoFill();

  // Initialize mobile responsive menu
  initMobileMenu();

  // Reveal page
  document.body.classList.add('loaded');
  const loader = document.getElementById('page-loader');
  if (loader) loader.classList.add('hidden');

  // Verify connection
  testConnection();

  // Dismiss RLS warning banner
  const dismissBtn = document.getElementById('dismiss-rls-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      const banner = document.getElementById('rls-warning-banner');
      if (banner) banner.classList.add('hidden');
    });
  }

  // Initialize general control structures
  initTabs();
  initProjectsFilter();
  initJsonBlockBuilder();
  initConfigPanel();
  initModalCloseHandlers();
  wireInlineFileUploads(document);
  initAIWriter();
  initServiceAIWriter();
  initCertificateScanner();

  // Gallery add button wiring
  const addGalleryBtn = document.getElementById('add-gallery-img-btn');
  if (addGalleryBtn) {
    addGalleryBtn.addEventListener('click', openGalleryModal);
  }
  // Gallery edit button wiring (opens modal for batch edits/deletes)
  const editGalleryBtn = document.getElementById('edit-gallery-btn');
  if (editGalleryBtn) {
    editGalleryBtn.addEventListener('click', openGalleryEditModal);
  }

  const galleryEditSaveBtn = document.getElementById('gallery-edit-save');
  if (galleryEditSaveBtn) galleryEditSaveBtn.addEventListener('click', saveGalleryEdits);

  const editProjectsBtn = document.getElementById('edit-projects-btn');
  if (editProjectsBtn) editProjectsBtn.addEventListener('click', openProjectsEditModal);

  const projectsEditSaveBtn = document.getElementById('projects-edit-save');
  if (projectsEditSaveBtn) projectsEditSaveBtn.addEventListener('click', saveProjectsEdits);

  const editServicesBtn = document.getElementById('edit-services-btn');
  if (editServicesBtn) editServicesBtn.addEventListener('click', openServicesEditModal);

  const servicesEditSaveBtn = document.getElementById('services-edit-save');
  if (servicesEditSaveBtn) servicesEditSaveBtn.addEventListener('click', saveServicesEdits);

  const editBrandsBtn = document.getElementById('edit-brands-btn');
  if (editBrandsBtn) editBrandsBtn.addEventListener('click', openBrandsEditModal);

  const brandsEditSaveBtn = document.getElementById('brands-edit-save');
  if (brandsEditSaveBtn) brandsEditSaveBtn.addEventListener('click', saveBrandsEdits);

  const editCommunityCardsBtn = document.getElementById('edit-community-cards-btn');
  if (editCommunityCardsBtn) editCommunityCardsBtn.addEventListener('click', openCommunityEditModal);

  const communityEditSaveBtn = document.getElementById('community-edit-save');
  if (communityEditSaveBtn) communityEditSaveBtn.addEventListener('click', saveCommunityEdits);
  
  // Gallery batch dropzone setup
  initGalleryUploadZone();

  // Form submits wiring
  document.getElementById('project-form').addEventListener('submit', handleProjectSubmit);
  document.getElementById('service-form').addEventListener('submit', handleServiceSubmit);
  document.getElementById('brand-form').addEventListener('submit', handleBrandSubmit);
  document.getElementById('community-card-form').addEventListener('submit', handleCommunityCardSubmit);
  document.getElementById('certificate-form').addEventListener('submit', handleCertificateSubmit);
  document.getElementById('review-form').addEventListener('submit', handleReviewSubmit);

  // Edit/Add buttons inside tab filter bars
  const editCertificatesBtn = document.getElementById('edit-certificates-btn');
  if (editCertificatesBtn) {
    editCertificatesBtn.addEventListener('click', () => openCertificateModal());
    // Visual improvement: change text to "+ Add Certificate"
    editCertificatesBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px; margin-right:6px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Certificate
    `;
  }
  const editReviewsBtn = document.getElementById('edit-reviews-btn');
  if (editReviewsBtn) {
    editReviewsBtn.addEventListener('click', () => openReviewModal());
    // Visual improvement: change text to "+ Add Review"
    editReviewsBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px; margin-right:6px;"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Add Review
    `;
  }

  // Initialize Thumbnail Generator
  initThumbnailGenerator();

  // Initialize Service Mockup Generator
  initServiceMockupGenerator();

  // Trigger loading initial project grid list
  loadProjects();
});

// Helper to convert DataURL to Blob
function dataURLtoBlob(dataurl) {
  var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--){
      u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], {type:mime});
}

// ==========================================
// THUMBNAIL GENERATOR LOGIC
// ==========================================
function initThumbnailGenerator() {
  const toggleBtn = document.getElementById('btn-toggle-bento');
  const section = document.getElementById('bento-generator-section');
  if (toggleBtn && section) {
    toggleBtn.addEventListener('click', () => {
      if (section.style.display === 'none') {
        section.style.display = 'block';
        toggleBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;"><polyline points="18 15 12 9 6 15"/></svg>
          Close Bento
        `;
      } else {
        section.style.display = 'none';
        toggleBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
          Generate Bento
        `;
      }
    });
  }

  const canvasElement = document.getElementById('thumbnail-canvas');
  const wrapperElement = document.querySelector('.thumbnail-scale-wrapper');
  const renderBtn = document.getElementById('btn-render-apply-bento');
  const autofillBtn = document.getElementById('btn-autofill-bento');
  const templateSelect = document.getElementById('bento-template-select');

  // Always-current gradient string — written by applyAutoGradient, read by renderer
  let _bentoGradient = 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 100%)';

  // Current template (1-5)
  let currentBentoTemplate = 5;

  // Template config — how many grid boxes each template needs
  const TEMPLATE_CONFIG = {
    1: { gridCount: 0, mainLabel: 'Hero Image (Full)', gridLabel: '', gridHelp: '' },
    2: { gridCount: 1, mainLabel: 'Left Image', gridLabel: 'Right Image', gridHelp: 'Upload one image for the right side.' },
    3: { gridCount: 2, mainLabel: 'Main Image (Left Large)', gridLabel: 'Grid Images (Select up to 2)', gridHelp: 'Upload up to 2 images to stack on the right.' },
    4: { gridCount: 3, mainLabel: 'Main Image (Left Large)', gridLabel: 'Grid Images (Select up to 3)', gridHelp: 'Upload up to 3 images to stack on the right.' },
    5: { gridCount: 4, mainLabel: 'Main Image (Left Large)', gridLabel: 'Grid Images (Select up to 4)', gridHelp: 'Upload multiple images at once to fill the grid automatically.' },
    'mockup': { gridCount: 4, mainLabel: 'Featured Image', gridLabel: 'Collage Images (Select up to 4)', gridHelp: 'These images will be arranged as a collage on a laptop screen.' },
  };

  // Rebuild the preview boxes inside the canvas based on template
  function rebuildPreview(template) {
    const layout = canvasElement ? canvasElement.querySelector('.thumb-layout') : null;
    if (!layout) return;
    layout.setAttribute('data-template', template);
    const config = TEMPLATE_CONFIG[template];

    if (template === 'mockup') {
      // Laptop mockup preview with collage grid inside
      let collageItems = '<div class="thumb-img-box" id="box-main"><span class="placeholder-text">1</span></div>';
      for (let i = 1; i <= config.gridCount; i++) {
        collageItems += `<div class="thumb-img-box" id="box-${i}"><span class="placeholder-text">${i + 1}</span></div>`;
      }
      layout.innerHTML = `
        <div class="mockup-laptop-preview">
          <div class="mockup-screen-preview">
            <div class="mockup-collage-preview">${collageItems}</div>
          </div>
          <div class="mockup-base-preview"></div>
        </div>`;
      return;
    }

    // Standard bento layouts (1-5)
    let html = '<div class="thumb-main-col"><div class="thumb-img-box" id="box-main"><span class="placeholder-text">Main Cover</span></div></div>';
    if (config.gridCount > 0) {
      html += '<div class="thumb-grid-col">';
      for (let i = 1; i <= config.gridCount; i++) {
        html += `<div class="thumb-img-box" id="box-${i}"><span class="placeholder-text">Grid ${i}</span></div>`;
      }
      html += '</div>';
    }
    layout.innerHTML = html;
  }

  // Update the control labels and visibility based on template
  function updateControlLabels(template) {
    const config = TEMPLATE_CONFIG[template];
    const mainLabel = document.getElementById('bento-main-label');
    const gridGroup = document.getElementById('bento-grid-group');
    const gridLabel = document.getElementById('bento-grid-label');
    const gridHelp = document.getElementById('bento-grid-help');

    if (mainLabel) mainLabel.textContent = config.mainLabel;
    if (gridGroup) gridGroup.style.display = config.gridCount === 0 ? 'none' : '';
    if (gridLabel) gridLabel.textContent = config.gridLabel;
    if (gridHelp) gridHelp.textContent = config.gridHelp;
  }

  // Set template programmatically (from auto-fill or selector)
  function setBentoTemplate(template) {
    currentBentoTemplate = template;
    if (templateSelect) templateSelect.value = template;
    rebuildPreview(template);
    updateControlLabels(template);
  }

  // Template selector handler
  if (templateSelect) {
    templateSelect.addEventListener('change', () => {
      const rawVal = templateSelect.value;
      const numVal = parseInt(rawVal, 10);
      setBentoTemplate(isNaN(numVal) ? rawVal : numVal);
    });
  }

  // Dynamic Scale Calculation for Preview
  function updateCanvasScale() {
    if (wrapperElement && canvasElement) {
      const scale = wrapperElement.clientWidth / 1600;
      canvasElement.style.transform = `scale(${scale})`;
    }
  }
  
  if (wrapperElement) {
    window.addEventListener('resize', updateCanvasScale);
    // Observe the wrapper in case it un-hides
    const ro = new ResizeObserver(updateCanvasScale);
    ro.observe(wrapperElement);
  }

  // ---- Dominant Color Extraction ----
  // Draws image to a tiny canvas, samples pixels, finds the dominant color,
  // then creates a smooth light-to-saturated gradient like a Canva background.
  function extractDominantColor(imgSrc) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const sampleCanvas = document.createElement('canvas');
          const ctx = sampleCanvas.getContext('2d');
          const size = 50;
          sampleCanvas.width = size;
          sampleCanvas.height = size;
          ctx.drawImage(img, 0, 0, size, size);
          // getImageData throws SecurityError if the image is CORS-blocked
          const imageData = ctx.getImageData(0, 0, size, size).data;

          const colorMap = {};
          for (let i = 0; i < imageData.length; i += 16) {
            const r = Math.round(imageData[i] / 10) * 10;
            const g = Math.round(imageData[i + 1] / 10) * 10;
            const b = Math.round(imageData[i + 2] / 10) * 10;
            const a = imageData[i + 3];
            if (a < 128) continue;
            const brightness = (r + g + b) / 3;
            if (brightness < 25 || brightness > 240) continue;
            const key = `${r},${g},${b}`;
            colorMap[key] = (colorMap[key] || 0) + 1;
          }

          let maxCount = 0;
          let dominant = null;
          for (const [key, count] of Object.entries(colorMap)) {
            if (count > maxCount) { maxCount = count; dominant = key.split(',').map(Number); }
          }
          resolve(dominant || [80, 60, 160]);
        } catch (e) {
          // CORS tainted canvas — derive a color from URL string hash as fallback
          let hash = 0;
          for (let i = 0; i < imgSrc.length; i++) hash = (hash * 31 + imgSrc.charCodeAt(i)) & 0xffffff;
          const r = (hash >> 16) & 0xff;
          const g = (hash >> 8) & 0xff;
          const b = hash & 0xff;
          resolve([r, g, b]);
        }
      };
      img.onerror = () => resolve([80, 60, 160]);
      img.src = imgSrc;
    });
  }

  // Convert RGB to HSL
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  // Generate gradient from dominant color — soft, faded, muted style
  function applyAutoGradient(dominant) {
    if (!canvasElement) return;
    const [h, s, l] = rgbToHsl(dominant[0], dominant[1], dominant[2]);
    const fadedSat = Math.min(s * 0.4, 35);
    const lightColor = `hsl(${h}, ${fadedSat}%, ${Math.min(l + 35, 88)}%)`;
    const deepColor = `hsl(${h}, ${Math.min(fadedSat + 10, 45)}%, ${Math.max(l - 15, 20)}%)`;
    const gradientStr = `linear-gradient(to bottom, ${lightColor} 0%, ${deepColor} 100%)`;
    canvasElement.style.background = gradientStr;
    _bentoGradient = gradientStr; // Always keep renderer in sync
  }

  // Try extracting color from whatever is in box-main right now
  async function autoExtractAndApply() {
    const mainBox = document.getElementById('box-main');
    if (!mainBox) return;
    const bgImage = mainBox.style.backgroundImage;
    if (bgImage && bgImage !== 'none') {
      // Pull the URL from url(...)
      const match = bgImage.match(/url\(["']?(.+?)["']?\)/);
      if (match && match[1]) {
        const dominant = await extractDominantColor(match[1]);
        applyAutoGradient(dominant);
      }
    }
  }

  // Handle Main Image
  const mainInput = document.getElementById('thumb-img-main');
  if (mainInput) {
    mainInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          // Look up box-main dynamically — rebuildPreview() may have replaced it
          const currentMainBox = document.getElementById('box-main');
          if (currentMainBox) {
            currentMainBox.style.backgroundImage = `url(${event.target.result})`;
            currentMainBox.innerHTML = '';
          }
          // Auto-extract dominant color from uploaded image
          const dominant = await extractDominantColor(event.target.result);
          applyAutoGradient(dominant);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Handle Multiple Grid Images — respects current template limit
  const gridMultiInput = document.getElementById('thumb-img-grid-multi');
  if (gridMultiInput) {
    gridMultiInput.addEventListener('change', (e) => {
      const maxGrid = TEMPLATE_CONFIG[currentBentoTemplate].gridCount;
      const files = Array.from(e.target.files).slice(0, maxGrid);
      files.forEach((file, index) => {
        const box = document.getElementById(`box-${index + 1}`);
        if (box && file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            box.style.backgroundImage = `url(${event.target.result})`;
            box.innerHTML = '';
          };
          reader.readAsDataURL(file);
        }
      });
    });
  }

  // Handle Auto-fill from Gallery
  if (autofillBtn) {
    autofillBtn.addEventListener('click', async () => {
      const projectKey = document.getElementById('proj-key').value.trim();
      if (!projectKey) {
        showToast('Info', 'Please enter a Project Key first or save the project.', 'info');
        return;
      }
      
      const originalText = autofillBtn.innerHTML;
      autofillBtn.innerHTML = 'Loading...';
      autofillBtn.disabled = true;

      try {
        const { data, error } = await supabase
          .from('portfolio_project_images')
          .select('image_url')
          .eq('project_key', projectKey)
          .order('display_order', { ascending: true })
          .limit(5);

        if (error) throw error;

        if (data && data.length > 0) {
          // Use the user's currently selected template — don't override it
          const activeTemplate = currentBentoTemplate;
          const gridCount = TEMPLATE_CONFIG[activeTemplate].gridCount;

          // Fill main
          if(data[0] && data[0].image_url) {
            const mainBox = document.getElementById('box-main');
            if(mainBox) {
              mainBox.style.backgroundImage = `url(${data[0].image_url})`;
              mainBox.innerHTML = '';
            }
          }
          // Fill grids based on current template
          for(let i = 1; i <= gridCount; i++) {
            if(data[i] && data[i].image_url) {
              const box = document.getElementById(`box-${i}`);
              if(box) {
                box.style.backgroundImage = `url(${data[i].image_url})`;
                box.innerHTML = '';
              }
            }
          }
          // Auto-extract gradient from first image
          if (data[0] && data[0].image_url) {
            const dominant = await extractDominantColor(data[0].image_url);
            applyAutoGradient(dominant);
          }
          showToast('Success', 'Bento auto-filled with matching gradient!', 'success');
        } else {
          showToast('Empty', 'No gallery images found for this project.', 'warning');
        }
      } catch (err) {
        console.error('Auto-fill error:', err);
        showToast('Error', 'Failed to load gallery images.', 'error');
      } finally {
        autofillBtn.innerHTML = originalText;
        autofillBtn.disabled = false;
      }
    });
  }

  // ---- Native Canvas 2D Renderer ----
  // Draws the bento layout directly onto a real <canvas> element at 1600x900
  // Supports templates 1-5 with different layout geometries
  async function renderBentoToCanvas() {
    const W = 1600, H = 900;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = W;
    outputCanvas.height = H;
    const ctx = outputCanvas.getContext('2d');

    // 1. Draw background gradient using the stored _bentoGradient string
    const colorMatches = _bentoGradient.match(/hsl\([^)]+\)|#[0-9a-fA-F]{3,8}/g);
    if (colorMatches && colorMatches.length >= 2) {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, colorMatches[0]);
      grad.addColorStop(1, colorMatches[colorMatches.length - 1]);
      ctx.fillStyle = grad;
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#2a2a3e');
      grad.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = grad;
    }
    ctx.fillRect(0, 0, W, H);

    // 2. Layout constants
    const PAD = 80, GAP = 40;
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;
    const RADIUS = 30;

    // Helper: draw rounded rect path (no fill/stroke)
    function rrPath(rx, ry, rw, rh, rr) {
      ctx.beginPath();
      ctx.moveTo(rx + rr, ry);
      ctx.lineTo(rx + rw - rr, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rr);
      ctx.lineTo(rx + rw, ry + rh - rr);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rr, ry + rh);
      ctx.lineTo(rx + rr, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rr);
      ctx.lineTo(rx, ry + rr);
      ctx.quadraticCurveTo(rx, ry, rx + rr, ry);
      ctx.closePath();
    }

    // Helper: draw rounded image box (r = corner radius, defaults to RADIUS)
    function drawBox(x, y, w, h, imgEl, r) {
      if (r === undefined) r = RADIUS;
      ctx.save();
      rrPath(x, y, w, h, r);
      ctx.clip();

      if (imgEl) {
        const imgAspect = imgEl.naturalWidth / imgEl.naturalHeight;
        const boxAspect = w / h;
        let sx, sy, sw, sh;
        if (imgAspect > boxAspect) {
          sh = imgEl.naturalHeight;
          sw = sh * boxAspect;
          sx = (imgEl.naturalWidth - sw) / 2;
          sy = 0;
        } else {
          sw = imgEl.naturalWidth;
          sh = sw / boxAspect;
          sx = 0;
          sy = (imgEl.naturalHeight - sh) / 2;
        }
        ctx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h);
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, y, w, h);
      }
      ctx.restore();

      // Subtle border overlay
      ctx.save();
      rrPath(x, y, w, h, r);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = r > 10 ? 2 : 1;
      ctx.stroke();
      ctx.restore();
    }

    // Helper: load an image from a URL/dataURL into an HTMLImageElement
    function loadImg(src) {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = src;
      });
    }

    // Helper: get image src from a box element's background-image
    function getSrcFromBox(boxId) {
      const box = document.getElementById(boxId);
      if (!box) return null;
      const bg = box.style.backgroundImage;
      if (!bg || bg === 'none') return null;
      const match = bg.match(/url\(["']?(.+?)["']?\)/);
      return match ? match[1] : null;
    }

    // Load main image (always present)
    const mainSrc = getSrcFromBox('box-main');
    const mainImg = mainSrc ? await loadImg(mainSrc) : null;

    // Load grid images based on current template
    const gridCount = TEMPLATE_CONFIG[currentBentoTemplate].gridCount;
    const gridImgs = [];
    for (let i = 1; i <= gridCount; i++) {
      const src = getSrcFromBox(`box-${i}`);
      gridImgs.push(src ? await loadImg(src) : null);
    }

    // 3. Draw layout based on current template
    const template = currentBentoTemplate;

    if (template === 1) {
      // Single full-bleed hero
      drawBox(PAD, PAD, innerW, innerH, mainImg);

    } else if (template === 2) {
      // Two equal side-by-side columns
      const colW = (innerW - GAP) / 2;
      drawBox(PAD, PAD, colW, innerH, mainImg);
      drawBox(PAD + colW + GAP, PAD, colW, innerH, gridImgs[0] || null);

    } else if (template === 3) {
      // 1 main left + 2 stacked right
      const colW = (innerW - GAP) / 2;
      const cellH = (innerH - GAP) / 2;
      drawBox(PAD, PAD, colW, innerH, mainImg);
      const gx = PAD + colW + GAP;
      drawBox(gx, PAD, colW, cellH, gridImgs[0] || null);
      drawBox(gx, PAD + cellH + GAP, colW, cellH, gridImgs[1] || null);

    } else if (template === 4) {
      // 1 main left + 3 stacked right
      const colW = (innerW - GAP) / 2;
      const cellH = (innerH - GAP * 2) / 3;
      drawBox(PAD, PAD, colW, innerH, mainImg);
      const gx = PAD + colW + GAP;
      drawBox(gx, PAD, colW, cellH, gridImgs[0] || null);
      drawBox(gx, PAD + cellH + GAP, colW, cellH, gridImgs[1] || null);
      drawBox(gx, PAD + (cellH + GAP) * 2, colW, cellH, gridImgs[2] || null);

    } else if (template === 'mockup') {
      // ===== Laptop Mockup Collage =====
      const laptopW = 920, laptopH = 600;
      const laptopX = (W - laptopW) / 2;
      const laptopY = 55;
      const bezelPad = 14;
      const camSpace = 22;

      // Drop shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 80;
      ctx.shadowOffsetY = 30;
      rrPath(laptopX, laptopY, laptopW, laptopH, 18);
      ctx.fillStyle = '#1c1c1e';
      ctx.fill();
      ctx.restore();

      // Bezel
      rrPath(laptopX, laptopY, laptopW, laptopH, 18);
      ctx.fillStyle = '#1c1c1e';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Camera dot
      ctx.beginPath();
      ctx.arc(W / 2, laptopY + (camSpace + bezelPad) / 2, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#3a3a3a';
      ctx.fill();

      // Screen content area
      const scrX = laptopX + bezelPad;
      const scrY = laptopY + bezelPad + camSpace;
      const scrW = laptopW - bezelPad * 2;
      const scrH = laptopH - bezelPad * 2 - camSpace;

      // Screen background
      rrPath(scrX, scrY, scrW, scrH, 6);
      ctx.fillStyle = '#0a0a0f';
      ctx.fill();

      // Collage inside screen
      const cGap = 6;
      const cR = 6;
      const allImgs = [mainImg, ...gridImgs].filter(Boolean);
      const imgCount = allImgs.length;

      if (imgCount === 1) {
        drawBox(scrX + cGap, scrY + cGap, scrW - cGap * 2, scrH - cGap * 2, allImgs[0], cR);
      } else if (imgCount === 2) {
        const colW = (scrW - cGap * 3) / 2;
        const colH = scrH - cGap * 2;
        drawBox(scrX + cGap, scrY + cGap, colW, colH, allImgs[0], cR);
        drawBox(scrX + cGap * 2 + colW, scrY + cGap, colW, colH, allImgs[1], cR);
      } else if (imgCount === 3) {
        // Main left tall + 2 stacked right
        const colW = (scrW - cGap * 3) / 2;
        const halfH = (scrH - cGap * 3) / 2;
        drawBox(scrX + cGap, scrY + cGap, colW, scrH - cGap * 2, allImgs[0], cR);
        drawBox(scrX + cGap * 2 + colW, scrY + cGap, colW, halfH, allImgs[1], cR);
        drawBox(scrX + cGap * 2 + colW, scrY + cGap * 2 + halfH, colW, halfH, allImgs[2], cR);
      } else if (imgCount === 4) {
        // 2x2 grid
        const colW = (scrW - cGap * 3) / 2;
        const rowH = (scrH - cGap * 3) / 2;
        drawBox(scrX + cGap, scrY + cGap, colW, rowH, allImgs[0], cR);
        drawBox(scrX + cGap * 2 + colW, scrY + cGap, colW, rowH, allImgs[1], cR);
        drawBox(scrX + cGap, scrY + cGap * 2 + rowH, colW, rowH, allImgs[2], cR);
        drawBox(scrX + cGap * 2 + colW, scrY + cGap * 2 + rowH, colW, rowH, allImgs[3], cR);
      } else {
        // 5 images: top row (main 2-wide + img1), bottom row (img2 + img3 + img4)
        const col3W = (scrW - cGap * 4) / 3;
        const rowH = (scrH - cGap * 3) / 2;
        // Top: main spans 2 cols
        drawBox(scrX + cGap, scrY + cGap, col3W * 2 + cGap, rowH, allImgs[0], cR);
        drawBox(scrX + cGap * 3 + col3W * 2, scrY + cGap, col3W, rowH, allImgs[1], cR);
        // Bottom: 3 equal
        drawBox(scrX + cGap, scrY + cGap * 2 + rowH, col3W, rowH, allImgs[2], cR);
        drawBox(scrX + cGap * 2 + col3W, scrY + cGap * 2 + rowH, col3W, rowH, allImgs[3], cR);
        drawBox(scrX + cGap * 3 + col3W * 2, scrY + cGap * 2 + rowH, col3W, rowH, allImgs[4], cR);
      }

      // Laptop base (trapezoid)
      const baseY = laptopY + laptopH + 3;
      const baseH = 18;
      const baseTopW = laptopW;
      const baseBotW = laptopW * 1.08;
      ctx.beginPath();
      ctx.moveTo((W - baseTopW) / 2, baseY);
      ctx.lineTo((W + baseTopW) / 2, baseY);
      ctx.lineTo((W + baseBotW) / 2, baseY + baseH);
      ctx.quadraticCurveTo(W / 2, baseY + baseH + 5, (W - baseBotW) / 2, baseY + baseH);
      ctx.closePath();
      ctx.fillStyle = '#2a2a2c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Hinge notch
      const notchW = 120;
      rrPath((W - notchW) / 2, baseY - 1, notchW, 6, 3);
      ctx.fillStyle = '#3a3a3c';
      ctx.fill();

    } else {
      // Template 5 — 1 main + 2x2 grid (original)
      const mainW = (innerW - GAP) / 2;
      const gridCellW = (mainW - GAP) / 2;
      const gridCellH = (innerH - GAP) / 2;
      drawBox(PAD, PAD, mainW, innerH, mainImg);
      const gx = PAD + mainW + GAP;
      drawBox(gx, PAD, gridCellW, gridCellH, gridImgs[0] || null);
      drawBox(gx + gridCellW + GAP, PAD, gridCellW, gridCellH, gridImgs[1] || null);
      drawBox(gx, PAD + gridCellH + GAP, gridCellW, gridCellH, gridImgs[2] || null);
      drawBox(gx + gridCellW + GAP, PAD + gridCellH + GAP, gridCellW, gridCellH, gridImgs[3] || null);
    }

    return outputCanvas;
  }

  // Handle Render and Upload
  const actionButtons = document.querySelectorAll('#btn-render-apply-bento, #btn-render-apply-bento-bottom');
  if (actionButtons.length > 0 && canvasElement) {
    actionButtons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const originalTexts = Array.from(actionButtons).map(b => b.innerHTML);
        
        // Show loading state on all buttons
        actionButtons.forEach(b => {
          b.innerHTML = '<div class="spinner-small" style="display:inline-block; margin-right:4px;"></div> Rendering & Uploading...';
          b.disabled = true;
        });

        try {
          const outputCanvas = await renderBentoToCanvas();

          const dataUrl = outputCanvas.toDataURL('image/webp', 0.95);
          const blob = dataURLtoBlob(dataUrl);

          const projectKey = document.getElementById('proj-key').value.trim() || 'draft';
          const fileName = `bento-${projectKey}-${Date.now()}.webp`;
          const bucketName = 'portfolio';

          if (!supabase) throw new Error('Database not connected.');

          // Upload to Supabase Storage
          const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(fileName, blob, {
              cacheControl: '3600',
              upsert: false,
              contentType: 'image/webp'
            });

          if (error) throw error;

          const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);

          const publicUrl = publicUrlData.publicUrl;

          // Apply URL to input
          const coverInput = document.getElementById('proj-image');
          if (coverInput) {
            coverInput.value = publicUrl;
            coverInput.dispatchEvent(new Event('change'));
          }

          showToast('Success', 'Bento Cover generated and applied!', 'success');
          
          // Auto-close section
          if (toggleBtn) toggleBtn.click();

        } catch (err) {
          console.error('Error generating/uploading bento cover:', err);
          showToast('Error', err.message || 'Failed to generate cover.', 'error');
        } finally {
          // Restore state on all buttons
          actionButtons.forEach((b, i) => {
            b.innerHTML = originalTexts[i];
            b.disabled = false;
          });
        }
      });
    });
  }
}

function initMobileMenu() {
  const toggleBtn = document.getElementById('sidebar-toggle');
  const sidebar = document.querySelector('.admin-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');

  if (!toggleBtn || !sidebar || !backdrop) return;

  function openSidebar() {
    sidebar.classList.add('open');
    backdrop.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function closeSidebar() {
    sidebar.classList.remove('open');
    backdrop.classList.remove('active');
    document.body.style.overflow = '';
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (sidebar.classList.contains('open')) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });

  backdrop.addEventListener('click', closeSidebar);

  // Close sidebar when clicking navigation buttons on mobile viewport
  const navBtns = sidebar.querySelectorAll('.nav-tab-btn, .view-site-link, #logout-btn');
  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (window.innerWidth <= 991) {
        closeSidebar();
      }
    });
  });
}

function initServiceMockupGenerator() {
  const toggleBtn = document.getElementById('btn-toggle-service-mockup');
  const section = document.getElementById('service-mockup-section');
  const canvasContainer = document.getElementById('svc-mockup-canvas');
  const wrapperElement = document.querySelector('#service-mockup-section .thumbnail-scale-wrapper');
  
  if (!section || !canvasContainer || !wrapperElement) return;

  let _serviceMockupMain = null;
  let _serviceMockupGrid = [];
  let _serviceMockupGradient = 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 100%)';
  let _customMockupImg = null;
  
  // Draggable handles corners coordinates (normalized [0, 1])
  let _mockupCorners = [
    { x: 0.25, y: 0.25 }, // TL
    { x: 0.75, y: 0.25 }, // TR
    { x: 0.75, y: 0.75 }, // BR
    { x: 0.25, y: 0.75 }  // BL
  ];

  // Draggable handles elements
  const handles = [
    { el: document.getElementById('svc-handle-tl'), index: 0 },
    { el: document.getElementById('svc-handle-tr'), index: 1 },
    { el: document.getElementById('svc-handle-br'), index: 2 },
    { el: document.getElementById('svc-handle-bl'), index: 3 }
  ];

  // Toggle Section
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const modalCard = toggleBtn.closest('.modal-card');
      if (section.style.display === 'none') {
        section.style.display = 'block';
        if (modalCard) modalCard.classList.add('modal-xlarge');
        toggleBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
            <polyline points="18 15 12 9 6 15"/>
          </svg>
          Close Mockup
        `;
        // Trigger scale refresh after layout changes
        setTimeout(() => {
          updateCanvasScale();
          triggerRedraw();
        }, 50);
      } else {
        section.style.display = 'none';
        if (modalCard) {
          modalCard.classList.remove('modal-xlarge');
          // Also reset the zoomed preview layout back to default
          const layout = section.querySelector('.thumbnail-gen-layout');
          if (layout) {
            layout.classList.remove('mockup-zoomed-layout');
            const zoomText = document.getElementById('btn-zoom-svc-text');
            const zoomIcon = document.getElementById('svg-zoom-icon');
            if (zoomText) zoomText.textContent = 'Enlarge Preview';
            if (zoomIcon) {
              zoomIcon.innerHTML = '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>';
            }
          }
        }
        toggleBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px; margin-right: 4px;">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>
          </svg>
          Generate Mockup Cover
        `;
      }
    });
  }

  // Scale Preview
  function updateCanvasScale() {
    if (wrapperElement && canvasContainer) {
      const canvasEl = document.getElementById('svc-mockup-canvas-el');
      const currentW = canvasEl ? canvasEl.width : 1600;
      const scale = wrapperElement.clientWidth / currentW;
      canvasContainer.style.transform = `scale(${scale})`;
    }
  }

  window.addEventListener('resize', updateCanvasScale);
  const ro = new ResizeObserver(updateCanvasScale);
  ro.observe(wrapperElement);

  // Helper: RGB to HSL
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
  }

  // Dominant color extraction
  function extractDominantColor(imgSrc) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const sampleCanvas = document.createElement('canvas');
          const ctx = sampleCanvas.getContext('2d');
          const size = 50;
          sampleCanvas.width = size;
          sampleCanvas.height = size;
          ctx.drawImage(img, 0, 0, size, size);
          const imageData = ctx.getImageData(0, 0, size, size).data;

          const colorMap = {};
          for (let i = 0; i < imageData.length; i += 16) {
            const r = Math.round(imageData[i] / 10) * 10;
            const g = Math.round(imageData[i + 1] / 10) * 10;
            const b = Math.round(imageData[i + 2] / 10) * 10;
            const a = imageData[i + 3];
            if (a < 128) continue;
            const brightness = (r + g + b) / 3;
            if (brightness < 25 || brightness > 240) continue;
            const key = `${r},${g},${b}`;
            colorMap[key] = (colorMap[key] || 0) + 1;
          }

          let maxCount = 0;
          let dominant = null;
          for (const [key, count] of Object.entries(colorMap)) {
            if (count > maxCount) { maxCount = count; dominant = key.split(',').map(Number); }
          }
          resolve(dominant || [80, 60, 160]);
        } catch (e) {
          let hash = 0;
          for (let i = 0; i < imgSrc.length; i++) hash = (hash * 31 + imgSrc.charCodeAt(i)) & 0xffffff;
          const r = (hash >> 16) & 0xff;
          const g = (hash >> 8) & 0xff;
          const b = hash & 0xff;
          resolve([r, g, b]);
        }
      };
      img.onerror = () => resolve([80, 60, 160]);
      img.src = imgSrc;
    });
  }

  function applyAutoGradient(dominant) {
    const [h, s, l] = rgbToHsl(dominant[0], dominant[1], dominant[2]);
    const fadedSat = Math.min(s * 0.4, 35);
    const lightColor = `hsl(${h}, ${fadedSat}%, ${Math.min(l + 35, 88)}%)`;
    const deepColor = `hsl(${h}, ${Math.min(fadedSat + 10, 45)}%, ${Math.max(l - 15, 20)}%)`;
    const gradientStr = `linear-gradient(to bottom, ${lightColor} 0%, ${deepColor} 100%)`;
    _serviceMockupGradient = gradientStr;
    triggerRedraw();
  }

  // Load Image Helper
  function loadImg(src) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  // Draggable Handles Position Updates
  function updateHandlePositions() {
    handles.forEach(h => {
      if (h.el) {
        h.el.style.left = (_mockupCorners[h.index].x * 100) + '%';
        h.el.style.top = (_mockupCorners[h.index].y * 100) + '%';
        h.el.style.display = _customMockupImg ? 'block' : 'none';
      }
    });
  }

  // Draggable Events setup
  handles.forEach(h => {
    if (!h.el) return;
    
    h.el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startDrag(e, h.index);
    });
    
    h.el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startDrag(e.touches[0], h.index);
    });
  });

  let activeDragIndex = null;

  function startDrag(e, index) {
    activeDragIndex = index;
    document.addEventListener('mousemove', onDrag);
    document.addEventListener('mouseup', endDrag);
    document.addEventListener('touchmove', onTouchDrag, { passive: false });
    document.addEventListener('touchend', endDrag);
  }

  function onTouchDrag(e) {
    e.preventDefault();
    onDrag(e.touches[0]);
  }

  function onDrag(e) {
    if (activeDragIndex === null) return;
    const rect = wrapperElement.getBoundingClientRect();
    let x = (e.clientX - rect.left) / rect.width;
    let y = (e.clientY - rect.top) / rect.height;
    
    x = Math.max(0, Math.min(1, x));
    y = Math.max(0, Math.min(1, y));
    
    _mockupCorners[activeDragIndex] = { x, y };
    updateHandlePositions();
    triggerRedraw();
  }

  function endDrag() {
    activeDragIndex = null;
    document.removeEventListener('mousemove', onDrag);
    document.removeEventListener('mouseup', endDrag);
    document.removeEventListener('touchmove', onTouchDrag);
    document.removeEventListener('touchend', endDrag);
  }

  // Texture-mapping helper for drawing slanted perspective image on 2D canvas
  function drawPerspectiveImage(ctx, img, corners, gridWidth = 1, gridHeight = 1) {
    const w = img.width || img.naturalWidth;
    const h = img.height || img.naturalHeight;
    if (!w || !h) return;

    function getQuadPoint(u, v) {
      const topX = corners[0].x + u * (corners[1].x - corners[0].x);
      const topY = corners[0].y + u * (corners[1].y - corners[0].y);
      const botX = corners[3].x + u * (corners[2].x - corners[3].x);
      const botY = corners[3].y + u * (corners[2].y - corners[3].y);
      return {
        x: topX + v * (botX - topX),
        y: topY + v * (botY - topY)
      };
    }

    for (let y = 0; y < gridHeight; y++) {
      for (let x = 0; x < gridWidth; x++) {
        const u0 = x / gridWidth;
        const v0 = y / gridHeight;
        const u1 = (x + 1) / gridWidth;
        const v1 = y / gridHeight;
        const u2 = (x + 1) / gridWidth;
        const v2 = (y + 1) / gridHeight;
        const u3 = x / gridWidth;
        const v3 = (y + 1) / gridHeight;

        const p0 = getQuadPoint(u0, v0);
        const p1 = getQuadPoint(u1, v1);
        const p2 = getQuadPoint(u2, v2);
        const p3 = getQuadPoint(u3, v3);

        drawTriangle(ctx, img, u0 * w, v0 * h, u1 * w, v1 * h, u3 * w, v3 * h, p0.x, p0.y, p1.x, p1.y, p3.x, p3.y);
        drawTriangle(ctx, img, u1 * w, v1 * h, u2 * w, v2 * h, u3 * w, v3 * h, p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
      }
    }
  }

  function drawTriangle(ctx, img, u0, v0, u1, v1, u2, v2, x0, y0, x1, y1, x2, y2) {
    // Calculate centroid of the destination triangle
    const cx = (x0 + x1 + x2) / 3;
    const cy = (y0 + y1 + y2) / 3;
    
    // Extrude vertices outward slightly (by 1.2 pixels) to cover anti-aliased seams
    const extrude = 1.2;
    
    const dx0 = x0 - cx, dy0 = y0 - cy, d0 = Math.hypot(dx0, dy0);
    const ex0 = x0 + (d0 > 0.001 ? (dx0 / d0) * extrude : 0);
    const ey0 = y0 + (d0 > 0.001 ? (dy0 / d0) * extrude : 0);
    
    const dx1 = x1 - cx, dy1 = y1 - cy, d1 = Math.hypot(dx1, dy1);
    const ex1 = x1 + (d1 > 0.001 ? (dx1 / d1) * extrude : 0);
    const ey1 = y1 + (d1 > 0.001 ? (dy1 / d1) * extrude : 0);
    
    const dx2 = x2 - cx, dy2 = y2 - cy, d2 = Math.hypot(dx2, dy2);
    const ex2 = x2 + (d2 > 0.001 ? (dx2 / d2) * extrude : 0);
    const ey2 = y2 + (d2 > 0.001 ? (dy2 / d2) * extrude : 0);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ex0, ey0);
    ctx.lineTo(ex1, ey1);
    ctx.lineTo(ex2, ey2);
    ctx.closePath();
    ctx.clip();

    const den = (u0 - u2) * (v1 - v2) - (u1 - u2) * (v0 - v2);
    if (Math.abs(den) < 1e-5) {
      ctx.restore();
      return;
    }

    const a = ((ex0 - ex2) * (v1 - v2) - (ex1 - ex2) * (v0 - v2)) / den;
    const b = ((ey0 - ey2) * (v1 - v2) - (ey1 - ey2) * (v0 - v2)) / den;
    const c = ((u0 - u2) * (ex1 - ex2) - (u1 - u2) * (ex0 - ex2)) / den;
    const d = ((u0 - u2) * (ey1 - ey2) - (u1 - u2) * (ey0 - ey2)) / den;
    const e = ex2 - a * u2 - c * v2;
    const f = ey2 - b * u2 - d * v2;

    ctx.transform(a, b, c, d, e, f);
    ctx.drawImage(img, 0, 0);
    ctx.restore();
  }

  // Dynamic canvas redrawing
  async function triggerRedraw(isExport = false) {
    const canvas = document.getElementById('svc-mockup-canvas-el');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    let W = 1600, H = 900;
    if (_customMockupImg) {
      W = _customMockupImg.naturalWidth || _customMockupImg.width || 1600;
      H = _customMockupImg.naturalHeight || _customMockupImg.height || 900;
    }

    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
      if (canvasContainer) {
        canvasContainer.style.width = `${W}px`;
        canvasContainer.style.height = `${H}px`;
      }
      if (wrapperElement) {
        wrapperElement.style.aspectRatio = `${W} / ${H}`;
      }
      updateCanvasScale();
    }

    // 1. Draw background gradient
    const colorMatches = _serviceMockupGradient.match(/hsl\([^)]+\)|#[0-9a-fA-F]{3,8}/g);
    if (colorMatches && colorMatches.length >= 2) {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, colorMatches[0]);
      grad.addColorStop(1, colorMatches[colorMatches.length - 1]);
      ctx.fillStyle = grad;
    } else {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#2a2a3e');
      grad.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = grad;
    }
    ctx.fillRect(0, 0, W, H);

    // 2. Draw collage on offscreen canvas
    const collageCanvas = document.createElement('canvas');
    collageCanvas.width = 1600;
    collageCanvas.height = 1000;
    const cCtx = collageCanvas.getContext('2d');

    cCtx.fillStyle = '#0a0a0f';
    cCtx.fillRect(0, 0, 1600, 1000);

    const cGap = 16;
    const cR = 16;

    function rrPath(c, rx, ry, rw, rh, rr) {
      c.beginPath();
      c.moveTo(rx + rr, ry);
      c.lineTo(rx + rw - rr, ry);
      c.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rr);
      c.lineTo(rx + rw, ry + rh - rr);
      c.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rr, ry + rh);
      c.lineTo(rx + rr, ry + rh);
      c.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rr);
      c.lineTo(rx, ry + rr);
      c.quadraticCurveTo(rx, ry, rx + rr, ry);
      c.closePath();
    }

    function drawCollageBox(x, y, w, h, imgEl, r = cR) {
      cCtx.save();
      rrPath(cCtx, x, y, w, h, r);
      cCtx.clip();

      if (imgEl) {
        const imgAspect = imgEl.naturalWidth / imgEl.naturalHeight;
        const boxAspect = w / h;
        let sx, sy, sw, sh;
        if (imgAspect > boxAspect) {
          sh = imgEl.naturalHeight;
          sw = sh * boxAspect;
          sx = (imgEl.naturalWidth - sw) / 2;
          sy = 0;
        } else {
          sw = imgEl.naturalWidth;
          sh = sw / boxAspect;
          sx = 0;
          sy = (imgEl.naturalHeight - sh) / 2;
        }
        cCtx.drawImage(imgEl, sx, sy, sw, sh, x, y, w, h);
      } else {
        cCtx.fillStyle = 'rgba(255,255,255,0.05)';
        cCtx.fillRect(x, y, w, h);
      }
      cCtx.restore();

      cCtx.save();
      rrPath(cCtx, x, y, w, h, r);
      cCtx.strokeStyle = 'rgba(255,255,255,0.12)';
      cCtx.lineWidth = 2;
      cCtx.stroke();
      cCtx.restore();
    }

    const mainImg = _serviceMockupMain ? await loadImg(_serviceMockupMain) : null;
    const gridImgs = [];
    for (const src of _serviceMockupGrid) {
      gridImgs.push(src ? await loadImg(src) : null);
    }

    const allImgs = [mainImg, ...gridImgs].filter(Boolean);
    const imgCount = allImgs.length;

    if (imgCount === 0) {
      cCtx.fillStyle = 'rgba(255,255,255,0.05)';
      cCtx.fillRect(cGap, cGap, 1600 - cGap * 2, 1000 - cGap * 2);
      cCtx.font = '50px sans-serif';
      cCtx.fillStyle = '#666';
      cCtx.textAlign = 'center';
      cCtx.textBaseline = 'middle';
      cCtx.fillText('Collage Preview (Empty)', 800, 500);
    } else if (imgCount === 1) {
      drawCollageBox(cGap, cGap, 1600 - cGap * 2, 1000 - cGap * 2, allImgs[0]);
    } else if (imgCount === 2) {
      const colW = (1600 - cGap * 3) / 2;
      drawCollageBox(cGap, cGap, colW, 1000 - cGap * 2, allImgs[0]);
      drawCollageBox(cGap * 2 + colW, cGap, colW, 1000 - cGap * 2, allImgs[1]);
    } else if (imgCount === 3) {
      const colW = (1600 - cGap * 3) / 2;
      const halfH = (1000 - cGap * 3) / 2;
      drawCollageBox(cGap, cGap, colW, 1000 - cGap * 2, allImgs[0]);
      drawCollageBox(cGap * 2 + colW, cGap, colW, halfH, allImgs[1]);
      drawCollageBox(cGap * 2 + colW, cGap * 2 + halfH, colW, halfH, allImgs[2]);
    } else if (imgCount === 4) {
      const colW = (1600 - cGap * 3) / 2;
      const rowH = (1000 - cGap * 3) / 2;
      drawCollageBox(cGap, cGap, colW, rowH, allImgs[0]);
      drawCollageBox(cGap * 2 + colW, cGap, colW, rowH, allImgs[1]);
      drawCollageBox(cGap, cGap * 2 + rowH, colW, rowH, allImgs[2]);
      drawCollageBox(cGap * 2 + colW, cGap * 2 + rowH, colW, rowH, allImgs[3]);
    } else {
      const col3W = (1600 - cGap * 4) / 3;
      const rowH = (1000 - cGap * 3) / 2;
      drawCollageBox(cGap, cGap, col3W * 2 + cGap, rowH, allImgs[0]);
      drawCollageBox(cGap * 3 + col3W * 2, cGap, col3W, rowH, allImgs[1]);
      drawCollageBox(cGap, cGap * 2 + rowH, col3W, rowH, allImgs[2]);
      drawCollageBox(cGap * 2 + col3W, cGap * 2 + rowH, col3W, rowH, allImgs[3]);
      drawCollageBox(cGap * 3 + col3W * 2, cGap * 2 + rowH, col3W, rowH, allImgs[4]);
    }

    // 3. Draw mockup template or default illustration
    if (_customMockupImg) {
      ctx.drawImage(_customMockupImg, 0, 0, W, H);
      const scaleCorners = _mockupCorners.map(pt => ({
        x: pt.x * W,
        y: pt.y * H
      }));
      drawPerspectiveImage(ctx, collageCanvas, scaleCorners);

      // Draw quad outline guide ONLY during editing (not on export)
      if (!isExport) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(_mockupCorners[0].x * W, _mockupCorners[0].y * H);
        ctx.lineTo(_mockupCorners[1].x * W, _mockupCorners[1].y * H);
        ctx.lineTo(_mockupCorners[2].x * W, _mockupCorners[2].y * H);
        ctx.lineTo(_mockupCorners[3].x * W, _mockupCorners[3].y * H);
        ctx.closePath();
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 4;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      // Default flat laptop mockup
      const laptopW = 920, laptopH = 600;
      const laptopX = (W - laptopW) / 2;
      const laptopY = 55;
      const bezelPad = 14;
      const camSpace = 22;

      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 80;
      ctx.shadowOffsetY = 30;
      rrPath(ctx, laptopX, laptopY, laptopW, laptopH, 18);
      ctx.fillStyle = '#1c1c1e';
      ctx.fill();
      ctx.restore();

      rrPath(ctx, laptopX, laptopY, laptopW, laptopH, 18);
      ctx.fillStyle = '#1c1c1e';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(W / 2, laptopY + (camSpace + bezelPad) / 2, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#3a3a3a';
      ctx.fill();

      const scrX = laptopX + bezelPad;
      const scrY = laptopY + bezelPad + camSpace;
      const scrW = laptopW - bezelPad * 2;
      const scrH = laptopH - bezelPad * 2 - camSpace;

      ctx.save();
      rrPath(ctx, scrX, scrY, scrW, scrH, 6);
      ctx.clip();
      ctx.drawImage(collageCanvas, scrX, scrY, scrW, scrH);
      ctx.restore();

      // Laptop base (trapezoid)
      const baseY = laptopY + laptopH + 3;
      const baseH = 18;
      const baseTopW = laptopW;
      const baseBotW = laptopW * 1.08;
      ctx.beginPath();
      ctx.moveTo((W - baseTopW) / 2, baseY);
      ctx.lineTo((W + baseTopW) / 2, baseY);
      ctx.lineTo((W + baseBotW) / 2, baseY + baseH);
      ctx.quadraticCurveTo(W / 2, baseY + baseH + 5, (W - baseBotW) / 2, baseY + baseH);
      ctx.closePath();
      ctx.fillStyle = '#2a2a2c';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const notchW = 120;
      rrPath(ctx, (W - notchW) / 2, baseY - 1, notchW, 6, 3);
      ctx.fillStyle = '#3a3a3c';
      ctx.fill();
    }
  }

  // File Inputs
  const mainFileInput = document.getElementById('svc-mockup-img-main');
  if (mainFileInput) {
    mainFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          _serviceMockupMain = event.target.result;
          triggerRedraw();
          const dominant = await extractDominantColor(event.target.result);
          applyAutoGradient(dominant);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  const gridFileInput = document.getElementById('svc-mockup-img-grid');
  if (gridFileInput) {
    gridFileInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files).slice(0, 4);
      if (files.length === 0) return;
      let loadedCount = 0;
      const results = new Array(files.length);
      files.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          results[index] = event.target.result;
          loadedCount++;
          if (loadedCount === files.length) {
            _serviceMockupGrid = results;
            triggerRedraw();
          }
        };
        reader.readAsDataURL(file);
      });
    });
  }

  const templateSelect = document.getElementById('svc-mockup-template-select');
  const deleteTemplateBtn = document.getElementById('btn-delete-mockup-template');
  const saveTemplateBtn = document.getElementById('btn-save-mockup-template');
  const bgFileInput = document.getElementById('svc-mockup-bg-file');

  // Load Templates from localStorage
  function loadTemplatesFromStorage() {
    if (!templateSelect) return;
    const templates = JSON.parse(localStorage.getItem('vincent_mockup_templates') || '[]');
    templateSelect.innerHTML = '<option value="default">Default: Flat Laptop</option>';
    templates.forEach(tpl => {
      const opt = document.createElement('option');
      opt.value = tpl.id;
      opt.textContent = tpl.name;
      templateSelect.appendChild(opt);
    });
  }

  // Initial load
  loadTemplatesFromStorage();

  // Template dropdown change handler
  if (templateSelect) {
    templateSelect.addEventListener('change', async () => {
      const val = templateSelect.value;
      if (val === 'default') {
        _customMockupImg = null;
        _mockupCorners = [
          { x: 0.25, y: 0.25 },
          { x: 0.75, y: 0.25 },
          { x: 0.75, y: 0.75 },
          { x: 0.25, y: 0.75 }
        ];
        if (deleteTemplateBtn) deleteTemplateBtn.style.display = 'none';
        if (saveTemplateBtn) saveTemplateBtn.style.display = 'none';
        if (bgFileInput) bgFileInput.value = '';
        updateHandlePositions();
        triggerRedraw();
      } else {
        const templates = JSON.parse(localStorage.getItem('vincent_mockup_templates') || '[]');
        const tpl = templates.find(t => t.id === val);
        if (tpl) {
          if (deleteTemplateBtn) deleteTemplateBtn.style.display = 'inline-flex';
          if (saveTemplateBtn) saveTemplateBtn.style.display = 'none';
          
          const originalText = templateSelect.options[templateSelect.selectedIndex].text;
          templateSelect.options[templateSelect.selectedIndex].text = 'Loading template...';
          
          const img = await loadImg(tpl.imageUrl);
          if (img) {
            _customMockupImg = img;
            _mockupCorners = JSON.parse(JSON.stringify(tpl.corners));
            updateHandlePositions();
            triggerRedraw();
          } else {
            showToast('Error', 'Failed to load template image.', 'error');
          }
          templateSelect.options[templateSelect.selectedIndex].text = originalText;
        }
      }
    });
  }

  // Delete Template handler
  if (deleteTemplateBtn) {
    deleteTemplateBtn.addEventListener('click', () => {
      const val = templateSelect.value;
      if (val === 'default') return;
      
      if (confirm('Are you sure you want to delete this mockup template?')) {
        let templates = JSON.parse(localStorage.getItem('vincent_mockup_templates') || '[]');
        templates = templates.filter(t => t.id !== val);
        localStorage.setItem('vincent_mockup_templates', JSON.stringify(templates));
        
        showToast('Deleted', 'Template deleted successfully.', 'success');
        loadTemplatesFromStorage();
        templateSelect.value = 'default';
        templateSelect.dispatchEvent(new Event('change'));
      }
    });
  }

  // Save Template handler
  if (saveTemplateBtn) {
    saveTemplateBtn.addEventListener('click', async () => {
      if (!bgFileInput || !bgFileInput.files || bgFileInput.files.length === 0) {
        showToast('Error', 'Please upload a background image file first.', 'error');
        return;
      }
      
      const file = bgFileInput.files[0];
      const name = prompt('Enter a name for this mockup template:', 'My Custom Mockup');
      if (!name) return;
      
      const originalText = saveTemplateBtn.innerHTML;
      saveTemplateBtn.innerHTML = 'Saving...';
      saveTemplateBtn.disabled = true;
      
      try {
        const ext = file.name.split('.').pop() || 'png';
        const fileName = `mockup-template-${Date.now()}.${ext}`;
        const bucketName = 'portfolio';
        
        if (!supabase) throw new Error('Database not connected.');
        
        const { data, error } = await supabase.storage
          .from(bucketName)
          .upload(fileName, file, {
            cacheControl: '31536000',
            upsert: false,
            contentType: file.type
          });
          
        if (error) throw error;
        
        const { data: publicUrlData } = supabase.storage
          .from(bucketName)
          .getPublicUrl(fileName);
          
        const publicUrl = publicUrlData.publicUrl;
        
        const newTpl = {
          id: 'tpl_' + Date.now(),
          name: name,
          imageUrl: publicUrl,
          corners: JSON.parse(JSON.stringify(_mockupCorners))
        };
        
        const templates = JSON.parse(localStorage.getItem('vincent_mockup_templates') || '[]');
        templates.push(newTpl);
        localStorage.setItem('vincent_mockup_templates', JSON.stringify(templates));
        
        showToast('Success', 'Template saved successfully!', 'success');
        
        loadTemplatesFromStorage();
        templateSelect.value = newTpl.id;
        if (saveTemplateBtn) saveTemplateBtn.style.display = 'none';
        if (deleteTemplateBtn) deleteTemplateBtn.style.display = 'inline-flex';
        
      } catch (err) {
        console.error('Error saving mockup template:', err);
        showToast('Error', err.message || 'Failed to save template.', 'error');
      } finally {
        saveTemplateBtn.innerHTML = originalText;
        saveTemplateBtn.disabled = false;
      }
    });
  }

  // Background Custom File handler
  if (bgFileInput) {
    bgFileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            _customMockupImg = img;
            if (saveTemplateBtn) saveTemplateBtn.style.display = 'inline-flex';
            if (deleteTemplateBtn) deleteTemplateBtn.style.display = 'none';
            _mockupCorners = [
              { x: 0.25, y: 0.25 },
              { x: 0.75, y: 0.25 },
              { x: 0.75, y: 0.75 },
              { x: 0.25, y: 0.75 }
            ];
            updateHandlePositions();
            triggerRedraw();
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Autofill Button
  const autofillBtn = document.getElementById('btn-autofill-service-mockup');
  if (autofillBtn) {
    autofillBtn.addEventListener('click', async () => {
      const serviceKey = document.getElementById('service-key').value.trim();
      if (!serviceKey) {
        showToast('Info', 'Please enter a Service Key first or save the service.', 'info');
        return;
      }

      const originalText = autofillBtn.innerHTML;
      autofillBtn.innerHTML = 'Loading...';
      autofillBtn.disabled = true;

      try {
        const { data: projects, error: projErr } = await supabase
          .from('portfolio_projects')
          .select('image_url')
          .eq('service_key', serviceKey)
          .order('display_order', { ascending: true });

        if (projErr) throw projErr;

        if (!projects || projects.length === 0) {
          showToast('Empty', 'No projects found for this service key.', 'warning');
          return;
        }

        const projectThumbnails = projects
          .map(p => p.image_url)
          .filter(url => url && url.trim() !== '');

        if (projectThumbnails.length > 0) {
          _serviceMockupMain = projectThumbnails[0];
          _serviceMockupGrid = projectThumbnails.slice(1, 5);
          
          triggerRedraw();

          const dominant = await extractDominantColor(_serviceMockupMain);
          applyAutoGradient(dominant);

          showToast('Success', 'Mockup cover auto-filled with project bento thumbnails!', 'success');
        } else {
          showToast('Empty', 'No generated bento thumbnails found for these projects.', 'warning');
        }
      } catch (err) {
        console.error('Service mockup auto-fill error:', err);
        showToast('Error', 'Failed to load project thumbnails for service.', 'error');
      } finally {
        autofillBtn.innerHTML = originalText;
        autofillBtn.disabled = false;
      }
    });
  }

  // Zoom/Enlarge Preview handler
  const zoomBtn = document.getElementById('btn-zoom-svc-mockup');
  const zoomText = document.getElementById('btn-zoom-svc-text');
  const zoomIcon = document.getElementById('svg-zoom-icon');

  if (zoomBtn) {
    zoomBtn.addEventListener('click', () => {
      const layout = section.querySelector('.thumbnail-gen-layout');
      if (layout) {
        layout.classList.toggle('mockup-zoomed-layout');
        const isZoomed = layout.classList.contains('mockup-zoomed-layout');
        if (isZoomed) {
          if (zoomText) zoomText.textContent = 'Shrink Preview';
          if (zoomIcon) {
            zoomIcon.innerHTML = '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/>';
          }
        } else {
          if (zoomText) zoomText.textContent = 'Enlarge Preview';
          if (zoomIcon) {
            zoomIcon.innerHTML = '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>';
          }
        }
        // Trigger update scale and redraw
        setTimeout(() => {
          updateCanvasScale();
          triggerRedraw();
          updateHandlePositions();
        }, 50);
      }
    });
  }

  // Reset Event
  document.addEventListener('reset-service-mockup', () => {
    _serviceMockupMain = null;
    _serviceMockupGrid = [];
    _customMockupImg = null;
    _serviceMockupGradient = 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 100%)';
    _mockupCorners = [
      { x: 0.25, y: 0.25 },
      { x: 0.75, y: 0.25 },
      { x: 0.75, y: 0.75 },
      { x: 0.25, y: 0.75 }
    ];
    if (bgFileInput) bgFileInput.value = '';
    if (templateSelect) templateSelect.value = 'default';
    if (deleteTemplateBtn) deleteTemplateBtn.style.display = 'none';
    if (saveTemplateBtn) saveTemplateBtn.style.display = 'none';
    
    const layout = section.querySelector('.thumbnail-gen-layout');
    if (layout) {
      layout.classList.remove('mockup-zoomed-layout');
    }
    if (zoomText) zoomText.textContent = 'Enlarge Preview';
    if (zoomIcon) {
      zoomIcon.innerHTML = '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>';
    }
    
    updateHandlePositions();
    triggerRedraw();
  });

  // Render trigger
  triggerRedraw();

  // Handle Render and Upload
  const renderActionBtns = [
    document.getElementById('btn-render-apply-service-mockup'),
    document.getElementById('btn-render-apply-service-mockup-bottom')
  ].filter(Boolean);

  if (renderActionBtns.length > 0) {
    renderActionBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const serviceKey = document.getElementById('service-key').value.trim().toLowerCase();
        if (!serviceKey) {
          showToast('Error', 'Please provide a Service Key before generating.', 'error');
          return;
        }

        const originalTexts = renderActionBtns.map(b => b.innerHTML);
        
        renderActionBtns.forEach(b => {
          b.innerHTML = '<div class="spinner-small" style="display:inline-block; margin-right:4px;"></div> Rendering...';
          b.disabled = true;
        });

        try {
          const canvas = document.getElementById('svc-mockup-canvas-el');
          if (!canvas) throw new Error('Canvas element not found.');

          // Redraw with isExport = true (hides blue dashed guide line)
          await triggerRedraw(true);

          const dataUrl = canvas.toDataURL('image/webp', 0.95);
          const blob = dataURLtoBlob(dataUrl);

          const fileName = `service-mockup-${serviceKey}-${Date.now()}.webp`;
          const bucketName = 'portfolio';

          if (!supabase) throw new Error('Database not connected.');

          const { data, error } = await supabase.storage
            .from(bucketName)
            .upload(fileName, blob, {
              cacheControl: '3600',
              upsert: false,
              contentType: 'image/webp'
            });

          if (error) throw error;

          const { data: publicUrlData } = supabase.storage
            .from(bucketName)
            .getPublicUrl(fileName);

          const publicUrl = publicUrlData.publicUrl;

          const coverInput = document.getElementById('service-image');
          if (coverInput) {
            coverInput.value = publicUrl;
            coverInput.dispatchEvent(new Event('change'));
          }

          showToast('Success', 'Laptop mockup cover generated and applied!', 'success');
          
          if (toggleBtn) toggleBtn.click(); // Close mockup generator panel

        } catch (err) {
          console.error('Error generating mockup cover:', err);
          showToast('Error', err.message || 'Failed to generate mockup.', 'error');
        } finally {
          // Always restore edit preview guide line
          triggerRedraw(false);
          renderActionBtns.forEach((b, idx) => {
            b.innerHTML = originalTexts[idx];
            b.disabled = false;
          });
        }
      });
    });
  }
}
