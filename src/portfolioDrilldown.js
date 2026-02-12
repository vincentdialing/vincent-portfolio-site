// ==========================================
// Portfolio Drill-Down System
// 3-Level: Services → Portfolio Tiles → Detail View
// ==========================================

import { supabase } from './supabaseClient.js'

// Portfolio data fetched from Supabase (populated by fetchPortfolioData)
let portfolioData = {};

// ==========================================
// Fetch Portfolio Data from Supabase
// ==========================================
async function fetchPortfolioData() {
    try {
        // Fetch services
        const { data: services, error: sErr } = await supabase
            .from('portfolio_services')
            .select('key, title, display_order')
            .order('display_order', { ascending: true });

        if (sErr) throw sErr;

        // Fetch all projects
        const { data: projects, error: pErr } = await supabase
            .from('portfolio_projects')
            .select('project_key, service_key, title, category, description, gradient, tools, details, display_order, image_url')
            .order('display_order', { ascending: true });

        if (pErr) throw pErr;

        // Build the portfolioData object grouped by service key
        const data = {};
        (services || []).forEach(svc => {
            data[svc.key] = {
                title: svc.title,
                items: []
            };
        });

        (projects || []).forEach(proj => {
            if (data[proj.service_key]) {
                data[proj.service_key].items.push({
                    id: proj.project_key,
                    title: proj.title,
                    category: proj.category,
                    description: proj.description,
                    gradient: proj.gradient,
                    tools: proj.tools || [],
                    details: proj.details || [],
                    imageUrl: proj.image_url || null
                });
            }
        });

        portfolioData = data;
        console.log('Portfolio data loaded from Supabase:', Object.keys(portfolioData).length, 'services');
        return true;
    } catch (err) {
        console.error('Failed to fetch portfolio data:', err);
        return false;
    }
}



// ==========================================
// State Management
// ==========================================
let currentLevel = 1;
let currentService = null;
let currentProject = null;
let isAnimating = false;
let isHandlingHash = false; // Prevents recursive hash handling
let lastClickedCardIndex = 0; // Remember which service card was clicked
let lastClickedTileIndex = 0; // Remember which tile was clicked

// ==========================================
// Scroll Helpers
// ==========================================
function scrollToSectionTop() {
    if (!projectsSection) return;
    const offset = projectsSection.getBoundingClientRect().top + window.scrollY - 20;
    window.scrollTo({ top: offset, behavior: 'smooth' });
}

function scrollToCard(index) {
    const cards = projectsGrid.querySelectorAll('.project-card');
    if (cards[index]) {
        setTimeout(() => {
            const cardTop = cards[index].getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({ top: cardTop, behavior: 'smooth' });
        }, 100);
    }
}

function scrollToTile(index) {
    const tiles = level2Container.querySelectorAll('.portfolio-tile');
    if (tiles[index]) {
        setTimeout(() => {
            const tileTop = tiles[index].getBoundingClientRect().top + window.scrollY - 100;
            window.scrollTo({ top: tileTop, behavior: 'smooth' });
        }, 100);
    }
}

// DOM References
let projectsSection = null;
let projectsGrid = null;
let backButtonRow = null;
let level2Container = null;
let level3Container = null;

// ==========================================
// Initialize
// ==========================================
export async function initPortfolioDrilldown() {
    projectsSection = document.querySelector('.projects-section');
    projectsGrid = document.querySelector('.projects-grid');

    if (!projectsSection || !projectsGrid) return;

    // Fetch portfolio data from Supabase
    const success = await fetchPortfolioData();
    if (!success || Object.keys(portfolioData).length === 0) {
        console.warn('Portfolio drill-down: No data loaded, drill-down disabled.');
        return;
    }

    // Add data-service attributes to existing cards
    const serviceKeys = Object.keys(portfolioData);
    const cards = projectsGrid.querySelectorAll('.project-card');
    cards.forEach((card, index) => {
        if (serviceKeys[index]) {
            card.setAttribute('data-service', serviceKeys[index]);
            card.style.cursor = 'pointer';
        }
    });


    // Create back button row
    backButtonRow = document.createElement('div');
    backButtonRow.className = 'drilldown-back-row';
    backButtonRow.innerHTML = `
    <button class="drilldown-back-btn" id="drilldown-back">
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 12H5"></path>
        <polyline points="12 19 5 12 12 5"></polyline>
      </svg>
      <span>Back</span>
    </button>
    <span class="drilldown-title"></span>
  `;
    backButtonRow.style.display = 'none';

    // Create Level 2 container
    level2Container = document.createElement('div');
    level2Container.className = 'drilldown-level2';
    level2Container.style.display = 'none';

    // Create Level 3 container
    level3Container = document.createElement('div');
    level3Container.className = 'drilldown-level3';
    level3Container.style.display = 'none';

    // Insert elements into the section
    const container = projectsSection.querySelector('.container');
    const headerDiv = container.querySelector('.text-center');
    headerDiv.after(backButtonRow);
    backButtonRow.after(level2Container);
    level2Container.after(level3Container);

    // Bind click events on service cards
    cards.forEach(card => {
        card.addEventListener('click', () => {
            const serviceKey = card.getAttribute('data-service');
            if (serviceKey && !isAnimating) {
                goToLevel2(serviceKey, card);
            }
        });
    });

    // Bind back button
    backButtonRow.querySelector('#drilldown-back').addEventListener('click', () => {
        if (isAnimating) return;
        if (currentLevel === 3) {
            goBackToLevel2();
        } else if (currentLevel === 2) {
            goBackToLevel1();
        }
    });

    // Listen for browser back/forward
    window.addEventListener('hashchange', handleHashChange);

    // Handle initial hash on page load (deep linking)
    handleInitialHash();
}

// ==========================================
// URL Hash Routing
// ==========================================

// Update the URL hash without triggering hashchange handler
function updateHash(serviceKey, projectId) {
    isHandlingHash = true;
    if (!serviceKey) {
        // Level 1 — clear hash or set to section
        history.pushState(null, '', window.location.pathname + window.location.search + '#works');
    } else if (!projectId) {
        // Level 2
        history.pushState(null, '', window.location.pathname + window.location.search + '#works/' + serviceKey);
    } else {
        // Level 3
        history.pushState(null, '', window.location.pathname + window.location.search + '#works/' + serviceKey + '/' + projectId);
    }
    // Small delay to prevent the hashchange listener from re-firing
    requestAnimationFrame(() => { isHandlingHash = false; });
}

// Parse the current hash → { serviceKey, projectId }
function parseHash() {
    const hash = window.location.hash.replace('#', '');
    const parts = hash.split('/');
    // Expected: works / serviceKey / projectId
    if (parts[0] !== 'works') return { serviceKey: null, projectId: null };
    return {
        serviceKey: parts[1] || null,
        projectId: parts[2] || null
    };
}

// Handle browser back/forward
function handleHashChange() {
    if (isHandlingHash || isAnimating) return;
    const { serviceKey, projectId } = parseHash();

    if (projectId && serviceKey) {
        // Should be at Level 3
        if (currentLevel === 3 && currentProject === projectId) return;
        navigateToLevel3Instant(serviceKey, projectId);
    } else if (serviceKey) {
        // Should be at Level 2
        if (currentLevel === 2 && currentService === serviceKey) return;
        navigateToLevel2Instant(serviceKey);
    } else {
        // Should be at Level 1
        if (currentLevel === 1) return;
        navigateToLevel1Instant();
    }
}

// Handle the hash that's already in the URL when the page first loads
function handleInitialHash() {
    const { serviceKey, projectId } = parseHash();
    if (!serviceKey) return;

    // Navigate instantly (no animation) to the target level
    if (projectId) {
        navigateToLevel3Instant(serviceKey, projectId);
    } else {
        navigateToLevel2Instant(serviceKey);
    }
}

// Instant (no-animation) navigation helpers for hash/deep-link
function navigateToLevel2Instant(serviceKey) {
    const service = portfolioData[serviceKey];
    if (!service) return;

    currentService = serviceKey;
    currentLevel = 2;
    currentProject = null;

    // Hide everything else
    projectsGrid.style.display = 'none';
    level3Container.style.display = 'none';
    level3Container.innerHTML = '';
    level3Container.classList.remove('drilldown-detail-enter', 'drilldown-detail-exit');

    // Show back button
    backButtonRow.style.display = 'flex';
    backButtonRow.classList.remove('drilldown-exit');
    backButtonRow.classList.add('drilldown-enter');
    backButtonRow.querySelector('.drilldown-title').textContent = service.title;

    // Render Level 2
    renderLevel2(service);
    level2Container.style.display = 'grid';
    const tiles = level2Container.querySelectorAll('.portfolio-tile');
    tiles.forEach((tile, i) => {
        tile.style.animationDelay = `${i * 0.06}s`;
        tile.classList.add('drilldown-tile-enter');
    });
    scrollToSectionTop();
}

function navigateToLevel3Instant(serviceKey, projectId) {
    const service = portfolioData[serviceKey];
    if (!service) return;
    const project = service.items.find(p => p.id === projectId);
    if (!project) return;

    currentService = serviceKey;
    currentProject = projectId;
    currentLevel = 3;

    // Hide everything else
    projectsGrid.style.display = 'none';
    level2Container.style.display = 'none';

    // Show back button
    backButtonRow.style.display = 'flex';
    backButtonRow.classList.remove('drilldown-exit');
    backButtonRow.classList.add('drilldown-enter');
    backButtonRow.querySelector('.drilldown-title').textContent = project.title;

    // Render Level 3
    renderLevel3(project);
    level3Container.style.display = 'block';
    level3Container.classList.add('drilldown-detail-enter');
    scrollToSectionTop();
}

function navigateToLevel1Instant() {
    currentLevel = 1;
    currentService = null;
    currentProject = null;

    level2Container.style.display = 'none';
    level2Container.innerHTML = '';
    level3Container.style.display = 'none';
    level3Container.innerHTML = '';
    level3Container.classList.remove('drilldown-detail-enter', 'drilldown-detail-exit');
    backButtonRow.style.display = 'none';
    backButtonRow.classList.remove('drilldown-enter', 'drilldown-exit');

    projectsGrid.style.display = 'grid';
    // Quick fade-in for cards
    const cards = projectsGrid.querySelectorAll('.project-card');
    cards.forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px) scale(0.95)';
        setTimeout(() => {
            card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0) scale(1)';
        }, i * 40);
    });
    setTimeout(() => {
        cards.forEach(card => {
            card.style.transition = '';
            card.style.opacity = '';
            card.style.transform = '';
        });
    }, 500);
}

// ==========================================
// Level 1 → Level 2 (Service → Portfolio Tiles)
// ==========================================
function goToLevel2(serviceKey, clickedCard) {
    isAnimating = true;
    currentService = serviceKey;
    currentLevel = 2;

    // Remember which card was clicked for back navigation
    const allCardsArr = Array.from(projectsGrid.querySelectorAll('.project-card'));
    lastClickedCardIndex = allCardsArr.indexOf(clickedCard);

    // Update URL
    updateHash(serviceKey, null);

    const service = portfolioData[serviceKey];
    if (!service) return;

    // Get clicked card position for morph effect
    const cardRect = clickedCard.getBoundingClientRect();
    const gridRect = projectsGrid.getBoundingClientRect();

    // Animate out: fade out all cards, scale up clicked card
    const allCards = projectsGrid.querySelectorAll('.project-card');
    allCards.forEach(card => {
        if (card === clickedCard) {
            card.classList.add('drilldown-morph-out');
        } else {
            card.classList.add('drilldown-fade-out');
        }
    });

    // After fade out, swap content
    setTimeout(() => {
        projectsGrid.style.display = 'none';
        allCards.forEach(card => {
            card.classList.remove('drilldown-fade-out', 'drilldown-morph-out');
        });

        // Show back button
        backButtonRow.style.display = 'flex';
        backButtonRow.querySelector('.drilldown-title').textContent = service.title;
        backButtonRow.classList.add('drilldown-enter');

        // Render Level 2 tiles
        renderLevel2(service);
        level2Container.style.display = 'grid';

        // Staggered entrance
        requestAnimationFrame(() => {
            const tiles = level2Container.querySelectorAll('.portfolio-tile');
            tiles.forEach((tile, i) => {
                tile.style.animationDelay = `${i * 0.08}s`;
                tile.classList.add('drilldown-tile-enter');
            });

            // Scroll to top of section
            scrollToSectionTop();

            setTimeout(() => {
                isAnimating = false;
            }, 400 + (tiles.length * 80));
        });
    }, 400);
}

// ==========================================
// Level 2 → Level 3 (Tile → Detail View)
// ==========================================
function goToLevel3(projectId, clickedTile) {
    isAnimating = true;
    currentProject = projectId;
    currentLevel = 3;

    // Remember which tile was clicked for back navigation
    const allTilesArr = Array.from(level2Container.querySelectorAll('.portfolio-tile'));
    lastClickedTileIndex = allTilesArr.indexOf(clickedTile);

    // Update URL
    updateHash(currentService, projectId);

    const service = portfolioData[currentService];
    const project = service.items.find(p => p.id === projectId);
    if (!project) return;

    // Animate out Level 2 tiles
    const allTiles = level2Container.querySelectorAll('.portfolio-tile');
    allTiles.forEach(tile => {
        if (tile === clickedTile) {
            tile.classList.add('drilldown-morph-out');
        } else {
            tile.classList.add('drilldown-fade-out');
        }
    });

    setTimeout(() => {
        level2Container.style.display = 'none';
        allTiles.forEach(tile => {
            tile.classList.remove('drilldown-fade-out', 'drilldown-morph-out');
        });

        // Update back title
        backButtonRow.querySelector('.drilldown-title').textContent = project.title;

        // Render Level 3
        renderLevel3(project);
        level3Container.style.display = 'block';

        requestAnimationFrame(() => {
            level3Container.classList.add('drilldown-detail-enter');

            // Scroll to top of section
            scrollToSectionTop();

            setTimeout(() => {
                isAnimating = false;
            }, 500);
        });
    }, 400);
}

// ==========================================
// Back: Level 3 → Level 2
// ==========================================
function goBackToLevel2() {
    isAnimating = true;
    currentLevel = 2;
    currentProject = null;

    // Update URL
    updateHash(currentService, null);

    const service = portfolioData[currentService];

    // Animate out Level 3
    level3Container.classList.add('drilldown-detail-exit');

    setTimeout(() => {
        level3Container.style.display = 'none';
        level3Container.classList.remove('drilldown-detail-enter', 'drilldown-detail-exit');
        level3Container.innerHTML = '';

        // Update back title
        backButtonRow.querySelector('.drilldown-title').textContent = service.title;

        // Show Level 2 again with animation
        level2Container.style.display = 'grid';
        const tiles = level2Container.querySelectorAll('.portfolio-tile');
        tiles.forEach((tile, i) => {
            tile.classList.remove('drilldown-tile-enter');
            void tile.offsetWidth; // force reflow
            tile.style.animationDelay = `${i * 0.06}s`;
            tile.classList.add('drilldown-tile-enter');
        });

        // Scroll back to the tile that was clicked
        scrollToTile(lastClickedTileIndex);

        setTimeout(() => {
            isAnimating = false;
        }, 400);
    }, 350);
}

// ==========================================
// Back: Level 2 → Level 1
// ==========================================
function goBackToLevel1() {
    isAnimating = true;
    currentLevel = 1;
    currentService = null;

    // Update URL
    updateHash(null, null);

    // Animate out Level 2 tiles
    const tiles = level2Container.querySelectorAll('.portfolio-tile');
    tiles.forEach(tile => {
        tile.classList.add('drilldown-fade-out');
    });

    // Fade out back button
    backButtonRow.classList.add('drilldown-exit');

    setTimeout(() => {
        level2Container.style.display = 'none';
        level2Container.innerHTML = '';
        backButtonRow.style.display = 'none';
        backButtonRow.classList.remove('drilldown-enter', 'drilldown-exit');

        // Show service grid again with staggered entrance
        projectsGrid.style.display = 'grid';
        const cards = projectsGrid.querySelectorAll('.project-card');
        cards.forEach((card, i) => {
            card.style.opacity = '0';
            card.style.transform = 'translateY(20px) scale(0.95)';
            setTimeout(() => {
                card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                card.style.opacity = '1';
                card.style.transform = 'translateY(0) scale(1)';
            }, i * 60);
        });

        // Scroll back to the card that was clicked
        scrollToCard(lastClickedCardIndex);

        setTimeout(() => {
            // Clean up inline styles
            cards.forEach(card => {
                card.style.transition = '';
                card.style.opacity = '';
                card.style.transform = '';
            });
            isAnimating = false;
        }, 600 + (cards.length * 60));
    }, 350);
}

// ==========================================
// Render Level 2 — Portfolio Tiles
// ==========================================
function renderLevel2(service) {
    level2Container.innerHTML = '';

    service.items.forEach(item => {
        const tile = document.createElement('div');
        tile.className = 'portfolio-tile';
        tile.setAttribute('data-project-id', item.id);
        tile.innerHTML = `
      <div class="portfolio-tile-image" style="background: ${item.gradient};">
        <div class="portfolio-tile-overlay"></div>
      </div>
      <div class="portfolio-tile-content">
        <span class="portfolio-tile-category">${item.category}</span>
        <h3 class="portfolio-tile-title">${item.title}</h3>
        <p class="portfolio-tile-desc">${item.description}</p>
        <div class="chip-container">
          ${item.tools.map(t => `<span class="chip">${t}</span>`).join('')}
        </div>
      </div>
    `;
        tile.style.cursor = 'pointer';

        tile.addEventListener('click', () => {
            if (!isAnimating) {
                goToLevel3(item.id, tile);
            }
        });

        level2Container.appendChild(tile);
    });
}

// ==========================================
// Render Level 3 — Detail View (Scrollable)
// ==========================================
function renderLevel3(project) {
    level3Container.innerHTML = '';

    const detail = document.createElement('div');
    detail.className = 'drilldown-detail-card';

    // Build detail body content blocks
    const bodyContent = project.details.map(block => {
        switch (block.type) {
            case 'text':
                return `<p class="detail-text">${block.content}</p>`;

            case 'video':
                // Custom video player: thumbnail + play button → loads YouTube on click
                const videoId = extractYouTubeId(block.url);
                const thumb = block.thumbnail || (videoId ? `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg` : '');
                return `
                  <div class="video-player-wrapper" data-video-url="${block.url}" data-video-id="${videoId || ''}">
                    <div class="video-thumbnail" style="background-image: url('${thumb}'); background: ${!thumb ? project.gradient : `url('${thumb}') center/cover no-repeat`};">
                      <div class="video-play-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="white">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </div>
                      <div class="video-duration">${block.duration || ''}</div>
                    </div>
                    <div class="video-iframe-container" style="display:none;"></div>
                    ${block.caption ? `<p class="video-caption">${block.caption}</p>` : ''}
                  </div>`;

            case 'link':
                return `
                  <a href="${block.url}" target="_blank" rel="noopener noreferrer" class="detail-external-link">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    <span>${block.label || 'View Full Project'}</span>
                  </a>`;

            case 'image':
                return `
                  <div class="detail-image-block">
                    <img src="${block.url}" alt="${block.alt || project.title}" loading="lazy" />
                    ${block.caption ? `<p class="detail-image-caption">${block.caption}</p>` : ''}
                  </div>`;

            default:
                return '';
        }
    }).join('');

    // Check if project has any media (video/image) — if not, show placeholder gallery
    const hasMedia = project.details.some(b => b.type === 'video' || b.type === 'image');

    detail.innerHTML = `
    <div class="detail-hero" style="background: ${project.gradient};">
      <div class="detail-hero-overlay"></div>
      <div class="detail-hero-content">
        <span class="detail-category">${project.category}</span>
        <h2 class="detail-title">${project.title}</h2>
        <p class="detail-subtitle">${project.description}</p>
        <div class="chip-container" style="justify-content: center;">
          ${project.tools.map(t => `<span class="chip">${t}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="detail-body">
      ${bodyContent}
      ${!hasMedia ? `
        <div class="detail-placeholder-gallery">
          <div class="gallery-item" style="background: ${project.gradient}; opacity: 0.6;">
            <span>Screenshot Placeholder</span>
          </div>
          <div class="gallery-item" style="background: ${project.gradient}; opacity: 0.4;">
            <span>Screenshot Placeholder</span>
          </div>
        </div>` : ''}
    </div>
  `;

    level3Container.appendChild(detail);

    // Bind video play buttons
    detail.querySelectorAll('.video-player-wrapper').forEach(wrapper => {
        const thumbEl = wrapper.querySelector('.video-thumbnail');
        const iframeContainer = wrapper.querySelector('.video-iframe-container');
        const videoId = wrapper.dataset.videoId;
        const videoUrl = wrapper.dataset.videoUrl;

        thumbEl.addEventListener('click', () => {
            if (videoId) {
                // YouTube embed — nocookie, no branding, autoplay
                iframeContainer.innerHTML = `
                  <iframe
                    src="https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&showinfo=0&controls=1&color=white&iv_load_policy=3"
                    frameborder="0"
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowfullscreen
                  ></iframe>`;
            } else if (videoUrl) {
                // Direct video file
                iframeContainer.innerHTML = `
                  <video autoplay controls playsinline>
                    <source src="${videoUrl}" type="video/mp4">
                  </video>`;
            }
            thumbEl.style.display = 'none';
            iframeContainer.style.display = 'block';
        });
    });
}

// ==========================================
// Helper: Extract YouTube video ID from URL
// ==========================================
function extractYouTubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&\n?#]+)/);
    return match ? match[1] : null;
}
