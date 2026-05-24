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

  const detectedServiceRole = key && (key.includes('service_role') || key.length > 150);
  isUsingServiceRole = detectedServiceRole;

  if (customUrl && customKey) {
    currentKeyType = 'custom';
    document.getElementById('status-key-type').innerHTML = detectedServiceRole 
      ? 'Using <strong>Service Role Key</strong> (Write Access)'
      : 'Using Custom Anon Key (Read Only)';
  } else {
    currentKeyType = 'env';
    document.getElementById('status-key-type').textContent = 'Using environment credentials';
  }

  if (!url || !key) {
    updateStatusBadge('error', 'Missing credentials');
    return null;
  }

  try {
    let client;
    if (detectedServiceRole) {
      // Bypass the browser check by passing the envAnonKey, but override headers for administrative database access
      client = createClient(url, envAnonKey, {
        auth: { persistSession: false },
        global: {
          headers: {
            apikey: key,
            Authorization: `Bearer ${key}`
          }
        }
      });
    } else {
      client = createClient(url, key, {
        auth: { persistSession: false }
      });
    }
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
  thumbnail: { title: 'Thumbnail Generator', subtitle: 'Create composite cover images.', button: '' },
  config: { title: 'Supabase Credentials', subtitle: 'Configure credentials to authenticate your write sessions.', button: '' }
};

let activeTab = 'projects';

function initTabs() {
  const tabs = document.querySelectorAll('.nav-tab-btn');
  const panels = document.querySelectorAll('.tab-panel');
  const actionBtn = document.getElementById('add-item-btn');
  const tabTitle = document.getElementById('active-tab-title');
  const tabSubtitle = document.getElementById('active-tab-subtitle');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      activeTab = target;
      localStorage.setItem('admin_active_tab', target);

      // Update Nav active states
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update Panels active states
      panels.forEach(p => p.classList.remove('active'));
      const activePanel = document.getElementById(`panel-${target}`);
      if (activePanel) activePanel.classList.add('active');

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
    });
  });

  // Restore last active tab from localStorage
  const savedTab = localStorage.getItem('admin_active_tab');
  if (savedTab && TAB_CONFIGS[savedTab]) {
    const savedTabBtn = document.querySelector(`.nav-tab-btn[data-tab="${savedTab}"]`);
    if (savedTabBtn) savedTabBtn.click();
  } else {
    // Default: click first tab
    const firstTab = document.querySelector('.nav-tab-btn');
    if (firstTab) firstTab.click();
  }


  // Wire header action btn click to opening the respective modal
  if (actionBtn) {
    actionBtn.addEventListener('click', () => {
      if (activeTab === 'projects') {
        openProjectModal();
      } else if (activeTab === 'brands') {
        openBrandModal();
      } else if (activeTab === 'services') {
        openServiceModal();
      }
    });
  }

  // Handle go to config button from warning banner
  const gotoConfig = document.getElementById('goto-config-btn');
  if (gotoConfig) {
    gotoConfig.addEventListener('click', () => {
      const configTab = document.querySelector('.nav-tab-btn[data-tab="config"]');
      if (configTab) configTab.click();
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
  return localStorage.getItem('admin_groq_api_key') || '';
}

function initAIWriter() {
  const generateBtn = document.getElementById('ai-generate-btn');
  if (!generateBtn) return;

  generateBtn.addEventListener('click', handleAIGenerate);

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

    // Render results
    resultsContainer.innerHTML = `
      ${subCategory ? `
        <div class="ai-result-card">
          <div class="ai-result-card-header">
            <span class="ai-result-label">Sub-Category Label</span>
            <button type="button" class="ai-apply-btn" data-target="proj-category" data-content="${escapeAttr(subCategory)}">Apply ↓</button>
          </div>
          <p class="ai-result-text" style="font-weight: 500; letter-spacing: 0.5px; text-transform: uppercase;">${subCategory}</p>
        </div>
      ` : ''}
      ${shortDesc ? `
        <div class="ai-result-card">
          <div class="ai-result-card-header">
            <span class="ai-result-label">Short Description</span>
            <button type="button" class="ai-apply-btn" data-target="proj-desc" data-content="${escapeAttr(shortDesc)}">Apply ↓</button>
          </div>
          <p class="ai-result-text">${shortDesc}</p>
        </div>
      ` : ''}
      ${detailedWriteup ? `
        <div class="ai-result-card">
          <div class="ai-result-card-header">
            <span class="ai-result-label">Detailed Writeup</span>
            <button type="button" class="ai-apply-btn" data-action="add-text-block" data-content="${escapeAttr(detailedWriteup)}">+ Add as Text Block</button>
          </div>
          <p class="ai-result-text">${detailedWriteup}</p>
        </div>
      ` : ''}
      ${bulletPoints ? `
        <div class="ai-result-card">
          <div class="ai-result-card-header">
            <span class="ai-result-label">Key Deliverables</span>
            <button type="button" class="ai-apply-btn" data-action="add-list-block" data-content="${escapeAttr(bulletPoints)}">+ Add as List Block</button>
          </div>
          <p class="ai-result-text">${bulletPoints}</p>
        </div>
      ` : ''}
    `;

    // Wire apply buttons
    resultsContainer.querySelectorAll('.ai-apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.target;
        const action = btn.dataset.action;
        const content = btn.dataset.content;

        if (target) {
          // Apply directly to a form field
          const field = document.getElementById(target);
          if (field) {
            field.value = content;
            field.dispatchEvent(new Event('input'));
          }
          btn.textContent = '✓ Applied';
          btn.classList.add('applied');
        } else if (action === 'add-text-block') {
          // Add as a text block in the detail blocks
          saveBlockInputs();
          currentDetailBlocks.push({ type: 'text', content: content });
          renderDetailBlocks();
          btn.textContent = '✓ Added';
          btn.classList.add('applied');
        } else if (action === 'add-list-block') {
          // Parse bullet points into an array
          const items = content.split('\n').map(l => l.replace(/^[-*•]\s*/, '').trim()).filter(l => l);
          saveBlockInputs();
          currentDetailBlocks.push({ type: 'list', items: items });
          renderDetailBlocks();
          btn.textContent = '✓ Added';
          btn.classList.add('applied');
        } else if (action === 'copy-clipboard') {
          navigator.clipboard.writeText(content).then(() => {
            btn.textContent = '✓ Copied';
            btn.classList.add('applied');
            setTimeout(() => {
              btn.textContent = 'Copy';
              btn.classList.remove('applied');
            }, 2000);
          });
        }
      });
    });

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
    console.error('Error loading services:', err);
    showToast('Error', 'Failed to load services categories.', 'error');
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
        <div class="block-field-group">
          <label>Video URL (YouTube, Vimeo, Facebook Reel, etc.)</label>
          <input type="text" class="block-input-url" value="${block.url || ''}" required>
        </div>
        <div class="block-field-row">
          <div class="block-field-group">
            <label>Thumbnail Image URL (Optional)</label>
            <input type="text" class="block-input-thumbnail" value="${block.thumbnail || ''}">
          </div>
          <div class="block-field-group">
            <label>Video Caption</label>
            <input type="text" class="block-input-caption" value="${block.caption || ''}">
          </div>
          <div class="block-field-group">
            <label>Duration (e.g. 1:30)</label>
            <input type="text" class="block-input-duration" value="${block.duration || ''}">
          </div>
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
        const uploadedUrl = await uploadFileToSupabase(file, bucketName);
        
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
          const url = await uploadFileToSupabase(file, bucketName);
          
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
    document.getElementById('proj-key').readOnly = false;
    if (gradientPreview) gradientPreview.style.background = 'linear-gradient(135deg, #007bff 0%, #00d2ff 100%)';
  }

  renderDetailBlocks();
  modal.classList.add('is-open');
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
      // Update
      const { error } = await supabase
        .from('portfolio_projects')
        .update(payload)
        .eq('id', parseInt(id));
      resultError = error;
    } else {
      // Insert
      const { error } = await supabase
        .from('portfolio_projects')
        .insert(payload);
      resultError = error;
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
    const { error } = await supabase
      .from('portfolio_projects')
      .delete()
      .eq('id', id);

    if (error) throw error;

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
  modal.classList.add('is-open');
}

function openGalleryEditModal() {
  const modal = document.getElementById('gallery-edit-modal');
  if (!modal) return;
  galleryMarkedForDeletion.clear();
  renderGalleryEditList();
  wireGalleryEditDragAndDrop();
  modal.classList.add('is-open');
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
        const { error } = await supabase.from('portfolio_project_images').update({
          display_order: u.order,
          redirect_url: u.redirect_url || null,
          redirect_label: u.redirect_label || null
        }).eq('id', u.id);
        if (error) throw error;
      } catch (err) {
        if (err.message && (err.message.includes('column') || err.message.includes('schema'))) {
          // Fallback to updating only display order
          const { error } = await supabase.from('portfolio_project_images').update({
            display_order: u.order
          }).eq('id', u.id);
          if (error) throw error;
        } else {
          throw err;
        }
      }
    }

    // Now delete marked items
    for (const id of toDelete) {
      const { error } = await supabase.from('portfolio_project_images').delete().eq('id', id);
      if (error) throw error;
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

  listEl.innerHTML = allProjects.map(p => `
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
  document.getElementById('projects-edit-modal').classList.add('is-open');
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
  document.getElementById('services-edit-modal').classList.add('is-open');
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
  document.getElementById('brands-edit-modal').classList.add('is-open');
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
  document.getElementById('community-edit-modal').classList.add('is-open');
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

  modal.classList.add('is-open');
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
      const { error } = await supabase.from('portfolio_services').update(payload).eq('id', parseInt(id));
      if (error) throw error;
    } else {
      payload.key = key;
      const { error } = await supabase.from('portfolio_services').insert(payload);
      if (error) throw error;
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
    const { error } = await supabase
      .from('portfolio_services')
      .delete()
      .eq('id', id);

    if (error) throw error;

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

  modal.classList.add('is-open');
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

  modal.classList.add('is-open');
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

  // Upload directly via Supabase Storage REST API
  const response = await fetch(`${url}/storage/v1/object/${bucketName}/${filePath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'x-upsert': 'true',
      'cache-control': 'max-age=3600'
    },
    body: uploadFile
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.message || errorBody.error || `Upload failed (HTTP ${response.status})`);
  }

  // Build public URL
  const publicUrl = `${url}/storage/v1/object/public/${bucketName}/${filePath}`;

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

          // Only use WebP if it's actually smaller
          if (webpFile.size < file.size) {
            resolve(webpFile);
          } else {
            resolve(file); // original was already smaller, keep it
          }
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

// ==========================================
// 12. RUNTIME STARTUP CODE
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize login gating
  initLoginControl();

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

  // Initialize Thumbnail Generator
  initThumbnailGenerator();

  // Trigger loading initial project grid list
  loadProjects();
});

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

  // Always-current gradient string — written by applyAutoGradient, read by renderer
  let _bentoGradient = 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 100%)';

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
  const mainBox = document.getElementById('box-main');
  if (mainInput && mainBox) {
    mainInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = async (event) => {
          mainBox.style.backgroundImage = `url(${event.target.result})`;
          mainBox.innerHTML = '';
          // Auto-extract dominant color from uploaded image
          const dominant = await extractDominantColor(event.target.result);
          applyAutoGradient(dominant);
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Handle Multiple Grid Images
  const gridMultiInput = document.getElementById('thumb-img-grid-multi');
  if (gridMultiInput) {
    gridMultiInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files).slice(0, 4); // Take up to 4
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
          // Fill main
          if(data[0] && data[0].image_url) {
            const mainBox = document.getElementById('box-main');
            if(mainBox) {
              mainBox.style.backgroundImage = `url(${data[0].image_url})`;
              mainBox.innerHTML = '';
            }
          }
          // Fill grids 1-4
          for(let i = 1; i < 5; i++) {
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

  // Helper to convert DataURL to Blob
  function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
  }

  // ---- Native Canvas 2D Renderer (replaces unreliable html2canvas) ----
  // Draws the bento layout directly onto a real <canvas> element at 1600x900
  async function renderBentoToCanvas() {
    const W = 1600, H = 900;
    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = W;
    outputCanvas.height = H;
    const ctx = outputCanvas.getContext('2d');

    // 1. Draw background gradient using the stored _bentoGradient string
    // _bentoGradient is always kept up-to-date by applyAutoGradient()
    const colorMatches = _bentoGradient.match(/hsl\([^)]+\)|#[0-9a-fA-F]{3,8}/g);
    if (colorMatches && colorMatches.length >= 2) {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, colorMatches[0]);
      grad.addColorStop(1, colorMatches[colorMatches.length - 1]);
      ctx.fillStyle = grad;
    } else {
      // Hard fallback: dark-to-slightly-lighter
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#2a2a3e');
      grad.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = grad;
    }
    ctx.fillRect(0, 0, W, H);

    // 2. Layout math (mirrors the CSS grid)
    const PAD = 80, GAP = 40;
    const innerW = W - PAD * 2;
    const innerH = H - PAD * 2;
    const mainW = (innerW - GAP) / 2;
    const mainH = innerH;
    const gridCellW = (mainW - GAP) / 2;
    const gridCellH = (mainH - GAP) / 2;
    const RADIUS = 30;

    // Helper: draw rounded image box
    function drawBox(x, y, w, h, imgEl) {
      ctx.save();
      // Rounded rect clip
      ctx.beginPath();
      ctx.moveTo(x + RADIUS, y);
      ctx.lineTo(x + w - RADIUS, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + RADIUS);
      ctx.lineTo(x + w, y + h - RADIUS);
      ctx.quadraticCurveTo(x + w, y + h, x + w - RADIUS, y + h);
      ctx.lineTo(x + RADIUS, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - RADIUS);
      ctx.lineTo(x, y + RADIUS);
      ctx.quadraticCurveTo(x, y, x + RADIUS, y);
      ctx.closePath();
      ctx.clip();

      if (imgEl) {
        // Cover-fit the image into the box
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
        // Empty placeholder
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, y, w, h);
      }

      ctx.restore();

      // Subtle border overlay
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x + RADIUS, y);
      ctx.lineTo(x + w - RADIUS, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + RADIUS);
      ctx.lineTo(x + w, y + h - RADIUS);
      ctx.quadraticCurveTo(x + w, y + h, x + w - RADIUS, y + h);
      ctx.lineTo(x + RADIUS, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - RADIUS);
      ctx.lineTo(x, y + RADIUS);
      ctx.quadraticCurveTo(x, y, x + RADIUS, y);
      ctx.closePath();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }

    // Helper: load an image from a URL/dataURL into an HTMLImageElement
    function loadImg(src) {
      return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null); // If CORS fails, skip
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

    // Load all images
    const mainSrc = getSrcFromBox('box-main');
    const grid1Src = getSrcFromBox('box-1');
    const grid2Src = getSrcFromBox('box-2');
    const grid3Src = getSrcFromBox('box-3');
    const grid4Src = getSrcFromBox('box-4');

    const [mainImg, g1Img, g2Img, g3Img, g4Img] = await Promise.all([
      mainSrc ? loadImg(mainSrc) : Promise.resolve(null),
      grid1Src ? loadImg(grid1Src) : Promise.resolve(null),
      grid2Src ? loadImg(grid2Src) : Promise.resolve(null),
      grid3Src ? loadImg(grid3Src) : Promise.resolve(null),
      grid4Src ? loadImg(grid4Src) : Promise.resolve(null),
    ]);

    // 3. Draw boxes
    // Main (left column)
    const mainX = PAD, mainY = PAD;
    drawBox(mainX, mainY, mainW, mainH, mainImg);

    // Grid (right column — 2x2)
    const gridStartX = PAD + mainW + GAP;
    drawBox(gridStartX,          PAD,                           gridCellW, gridCellH, g1Img);
    drawBox(gridStartX + gridCellW + GAP, PAD,                  gridCellW, gridCellH, g2Img);
    drawBox(gridStartX,          PAD + gridCellH + GAP,         gridCellW, gridCellH, g3Img);
    drawBox(gridStartX + gridCellW + GAP, PAD + gridCellH + GAP, gridCellW, gridCellH, g4Img);

    return outputCanvas;
  }

  // Handle Render and Upload
  if (renderBtn && canvasElement) {
    renderBtn.addEventListener('click', async () => {
      const originalText = renderBtn.innerHTML;
      renderBtn.innerHTML = 'Rendering & Uploading...';
      renderBtn.disabled = true;

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
        renderBtn.innerHTML = originalText;
        renderBtn.disabled = false;
      }
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
