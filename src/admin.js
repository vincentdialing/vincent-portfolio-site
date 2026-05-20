import { createClient } from '@supabase/supabase-js';
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
  if (!badge) return;

  badge.className = `status-indicator ${status}`;
  const dot = badge.querySelector('.status-dot');
  const labelEl = badge.querySelector('.status-label');
  
  if (labelEl) labelEl.textContent = label;
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
  if (serviceSelect) serviceSelect.addEventListener('change', runProjectsFilter);
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
    }
  });
}

function initJsonBlockBuilder() {
  document.getElementById('add-text-block-btn').addEventListener('click', () => {
    saveBlockInputs();
    currentDetailBlocks.push({ type: 'text', content: '' });
    renderDetailBlocks();
  });

  document.getElementById('add-video-block-btn').addEventListener('click', () => {
    saveBlockInputs();
    currentDetailBlocks.push({ type: 'video', url: '', thumbnail: '', caption: '', duration: '' });
    renderDetailBlocks();
  });

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
  if (!select) return;

  if (allProjects.length === 0) {
    await fetchServices();
    // Load projects to get the list
    const { data } = await supabase.from('portfolio_projects').select('project_key, title').order('title');
    allProjects = data || [];
  }

  select.innerHTML = '<option value="">-- Choose a project --</option>' +
    allProjects.map(p => `<option value="${p.project_key}">${p.title} (${p.project_key})</option>`).join('');

  // Wire select handler
  select.removeEventListener('change', handleGalleryProjectChange);
  select.addEventListener('change', handleGalleryProjectChange);
}

function handleGalleryProjectChange() {
  const select = document.getElementById('gallery-project-selector');
  const projectKey = select.value;
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
    <div class="edit-thumb-card" data-id="${img.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color);">
      <img src="${img.image_url}" style="width:100%; height:110px; object-fit:cover; display:block;" alt="">
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px;">
        <button class="btn-icon gallery-edit-trash" data-id="${img.id}" title="Mark for delete" style="background: rgba(0,0,0,0.45); border: none; color: #fff; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-primary);"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.5rem; font-size:0.85rem; color:var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
        <span>Order: ${img.display_order}</span>
        <span style="font-weight:600; color:var(--text-primary)">${img.id}</span>
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

    // First, update display_order based on current visual order in the edit modal
    const listEl = document.getElementById('gallery-edit-list');
    const children = Array.from(listEl.children);
    const updates = [];
    let orderCounter = 1;
    for (const child of children) {
      const id = parseInt(child.dataset.id);
      if (galleryMarkedForDeletion.has(id)) continue; // skip deleted
      updates.push({ id, order: orderCounter });
      orderCounter++;
    }

    // Apply order updates
    for (const u of updates) {
      const { error } = await supabase.from('portfolio_project_images').update({ display_order: u.order }).eq('id', u.id);
      if (error) throw error;
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
    console.error('Error deleting gallery images:', err);
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
        if (card) card.style.opacity = '1';
        btn.style.background = 'rgba(0,0,0,0.45)';
      } else {
        markedSet.add(id);
        if (card) card.style.opacity = '0.45';
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
    <div class="edit-thumb-card" data-id="${p.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color);">
      <img src="${p.image_url || 'https://placehold.co/600x380'}" style="width:100%; height:105px; object-fit:cover; display:block;" alt="${p.title}">
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px;">
        <button class="entity-edit-trash" data-id="${p.id}" title="Mark for delete" style="background: rgba(0,0,0,0.45); border: none; color: #fff; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-primary);"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.6rem;">
        <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${p.title}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary);">Order: ${p.display_order}</div>
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
    <div class="edit-thumb-card" data-id="${s.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color);">
      <img src="${s.image_url || 'https://placehold.co/600x380'}" style="width:100%; height:105px; object-fit:cover; display:block;" alt="${s.title}">
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px;">
        <button class="entity-edit-trash" data-id="${s.id}" title="Mark for delete" style="background: rgba(0,0,0,0.45); border: none; color: #fff; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-primary);"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.6rem;">
        <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${s.title}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary);">Order: ${s.display_order}</div>
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
    <div class="edit-thumb-card" data-id="${b.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color);">
      <img src="${b.logo_url || 'https://placehold.co/600x380'}" style="width:100%; height:105px; object-fit:contain; background:#fff; display:block;" alt="${b.name}">
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px;">
        <button class="entity-edit-trash" data-id="${b.id}" title="Mark for delete" style="background: rgba(0,0,0,0.45); border: none; color: #fff; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-primary);"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.6rem;">
        <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.name}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary);">Position: ${index + 1}</div>
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
    <div class="edit-thumb-card" data-id="${c.id}" style="position:relative; border-radius:8px; overflow:hidden; background:var(--bg-tertiary); border:1px solid var(--border-color);">
      <img src="${c.image_url || 'https://placehold.co/600x380'}" style="width:100%; height:105px; object-fit:cover; display:block;" alt="${c.title}">
      <div style="position:absolute; top:8px; right:8px; display:flex; gap:6px;">
        <button class="entity-edit-trash" data-id="${c.id}" title="Mark for delete" style="background: rgba(0,0,0,0.45); border: none; color: #fff; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;color:var(--text-primary);"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      </div>
      <div style="padding:0.6rem;">
        <div style="font-weight:600; font-size:0.86rem; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${c.title}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary);">Order: ${c.display_order}</div>
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
  } else {
    titleEl.textContent = 'Add New Service';
    document.getElementById('service-db-id').value = '';
    keyInput.value = '';
    keyInput.readOnly = false; // Allow key entry for new service
    document.getElementById('service-title').value = '';
    document.getElementById('service-image').value = '';
    document.getElementById('service-order').value = services.length + 1;
  }

  modal.classList.add('is-open');
}

async function handleServiceSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('service-db-id').value;
  const key = document.getElementById('service-key').value.trim().toLowerCase();
  const title = document.getElementById('service-title').value.trim();
  const imageUrl = document.getElementById('service-image').value.trim();
  const order = parseInt(document.getElementById('service-order').value) || 0;

  const payload = {
    title,
    image_url: imageUrl || null,
    display_order: order
  };

  try {
    if (id) {
      // Update existing service
      const { error } = await supabase
        .from('portfolio_services')
        .update(payload)
        .eq('id', parseInt(id));

      if (error) throw error;
      showToast('Success', 'Service updated successfully.', 'success');
    } else {
      // Create new service
      payload.key = key;
      const { error } = await supabase
        .from('portfolio_services')
        .insert(payload);

      if (error) throw error;
      showToast('Success', 'Service created successfully.', 'success');
    }

    closeModal('service-modal');
    loadServices();
  } catch (err) {
    console.error('Save service error:', err);
    showToast('Save Failed', err.message, 'error');
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

  // Trigger loading initial project grid list
  loadProjects();
});


