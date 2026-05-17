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
            .select('key, title, display_order, image_url')
            .order('display_order', { ascending: true });

        if (sErr) throw sErr;

        // Fetch all projects
        const { data: projects, error: pErr } = await supabase
            .from('portfolio_projects')
            .select('project_key, service_key, title, category, description, gradient, tools, details, display_order, image_url')
            .order('display_order', { ascending: true });

        if (pErr) throw pErr;

        // Fetch all project images
        const { data: projectImages, error: imgErr } = await supabase
            .from('portfolio_project_images')
            .select('project_key, image_url, alt, caption, display_order')
            .order('display_order', { ascending: true });

        if (imgErr) {
            console.warn('portfolio_project_images table not found or empty, skipping:', imgErr.message);
        }

        // Group images by project_key
        const imagesByProject = {};
        (projectImages || []).forEach(img => {
            if (!imagesByProject[img.project_key]) {
                imagesByProject[img.project_key] = [];
            }
            imagesByProject[img.project_key].push({
                type: 'image',
                url: img.image_url,
                alt: img.alt || '',
                caption: img.caption || ''
            });
        });

        // Build the portfolioData object grouped by service key
        const data = {};
        (services || []).forEach(svc => {
            data[svc.key] = {
                title: svc.title,
                imageUrl: svc.image_url || null,
                items: []
            };
        });

        (projects || []).forEach(rawProj => {
            const proj = applyProjectOverrides(rawProj);
            // Get the project's existing details (text, video, link, etc.)
            const existingDetails = (proj.details || []).filter(d => d.type !== 'image' || d.url);
            // Append DB images at the end
            const dbImages = imagesByProject[proj.project_key] || [];
            const mergedDetails = [...existingDetails, ...dbImages];

            if (data[proj.service_key]) {
                data[proj.service_key].items.push({
                    id: proj.project_key,
                    title: proj.title,
                    category: proj.category,
                    description: proj.description,
                    gradient: 'linear-gradient(135deg, #2563eb 0%, #1e40af 50%, #0f172a 100%)',
                    tools: proj.tools || [],
                    details: mergedDetails,
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
    // When in drill-down mode (Level 2/3), scroll to the back button row
    // so tiles appear right below the navbar instead of below the section heading
    const scrollTarget = (currentLevel >= 2 && backButtonRow)
        ? backButtonRow
        : projectsSection;
    const offset = scrollTarget.getBoundingClientRect().top + window.scrollY - 100;
    window.scrollTo({ top: offset, behavior: 'smooth' });
}

function scrollToCard(index) {
    const cards = projectsGrid.querySelectorAll('.project-card');
    if (cards[index]) {
        setTimeout(() => {
            const cardTop = cards[index].getBoundingClientRect().top + window.scrollY - 140;
            window.scrollTo({ top: cardTop, behavior: 'smooth' });
        }, 100);
    }
}

function scrollToTile(index) {
    const tiles = level2Container.querySelectorAll('.portfolio-tile');
    if (tiles[index]) {
        setTimeout(() => {
            const tileTop = tiles[index].getBoundingClientRect().top + window.scrollY - 140;
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
            const serviceKey = serviceKeys[index];
            const serviceData = portfolioData[serviceKey];
            card.setAttribute('data-service', serviceKey);
            card.style.cursor = 'pointer';

            const imageEl = card.querySelector('.project-image');
            if (imageEl) {
                const { mediaEl } = ensureImageLayers(
                    imageEl,
                    'project-image-media',
                    'project-image-loading'
                );
                applyImageLoadState(
                    imageEl,
                    mediaEl,
                    serviceData?.imageUrl || '',
                    'linear-gradient(rgba(10, 10, 24, 0.08), rgba(10, 10, 24, 0.24))'
                );
            }
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
    replayTileEntrance(tiles, 0.06);
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
            replayTileEntrance(tiles, 0.08);

            // Scroll to top of section
            scrollToSectionTop();

            setTimeout(() => {
                isAnimating = false;
            }, 400 + (tiles.length * 80));
        });
    }, 450);
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

        // Ensure Level 2 content exists (handles direct deep links to Level 3)
        if (level2Container.children.length === 0) {
            renderLevel2(service);
        }

        // Show Level 2 again with animation
        level2Container.style.display = 'grid';
        const tiles = level2Container.querySelectorAll('.portfolio-tile');
        replayTileEntrance(tiles, 0.06);

        // Scroll back to the tile the user last opened
        scrollToTile(lastClickedTileIndex);

        setTimeout(() => {
            isAnimating = false;
        }, 400);
    }, 500);
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

        // Scroll to the clicked card AFTER animations complete
        setTimeout(() => {
            scrollToCard(lastClickedCardIndex);
            // Clean up inline styles
            cards.forEach(card => {
                card.style.transition = '';
                card.style.opacity = '';
                card.style.transform = '';
            });
            isAnimating = false;
        }, 200 + (cards.length * 60));
    }, 450);
}

function preloadPortfolioTileImage(src) {
    return new Promise((resolve, reject) => {
        if (!src) {
            reject(new Error('Missing image source'));
            return;
        }

        const image = new Image();
        image.decoding = 'async';
        image.onload = () => resolve(src);
        image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
        image.src = src;

        if (image.decode) {
            image.decode().then(() => resolve(src)).catch(() => {
                // Fall back to the regular onload handler when decode isn't available.
            });
        }
    });
}

function setCardContentReady(container) {
    if (!container) return;

    const card = container.closest('.project-card, .portfolio-tile');
    if (!card) return;

    card.classList.remove('is-awaiting-load');
    card.classList.add('is-content-visible');
}

function ensureImageLayers(container, mediaClass, loadingClass) {
    if (!container) return { mediaEl: null, loadingEl: null };

    let mediaEl = container.querySelector(`.${mediaClass}`);
    if (!mediaEl) {
        mediaEl = document.createElement('div');
        mediaEl.className = mediaClass;
        container.insertBefore(mediaEl, container.firstChild);
    }

    let loadingEl = container.querySelector(`.${loadingClass}`);
    if (!loadingEl) {
        loadingEl = document.createElement('div');
        loadingEl.className = loadingClass;
        container.insertBefore(loadingEl, mediaEl);
    }

    return { mediaEl, loadingEl };
}

function applyImageLoadState(container, mediaEl, src, overlayGradient) {
    if (!container || !mediaEl) return;

    container.classList.remove('is-loaded');
    const card = container.closest('.project-card, .portfolio-tile');
    if (card) {
        card.classList.add('is-awaiting-load');
        card.classList.remove('is-content-visible');
    }

    if (!src) {
        container.classList.remove('is-loading');
        container.classList.add('is-loaded');
        setCardContentReady(container);
        return;
    }

    container.classList.add('is-loading');

    preloadPortfolioTileImage(src)
        .then((loadedSrc) => {
            mediaEl.style.backgroundImage = `${overlayGradient}, url('${loadedSrc}')`;
            container.classList.remove('is-loading');
            container.classList.add('is-loaded');
            setCardContentReady(container);
        })
        .catch(() => {
            container.classList.remove('is-loading');
            container.classList.add('is-loaded');
            setCardContentReady(container);
        });
}

function replayTileEntrance(tiles, stagger = 0.06) {
    tiles.forEach((tile, i) => {
        tile.classList.remove('drilldown-fade-out', 'drilldown-morph-out', 'drilldown-tile-enter', 'is-awaiting-load');
        tile.classList.add('is-content-visible');
        tile.style.opacity = '1';
        tile.style.transform = 'translateY(0) scale(1)';
        void tile.offsetWidth;
        tile.style.animationDelay = `${i * stagger}s`;
        tile.classList.add('drilldown-tile-enter');
    });
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
      <div class="portfolio-tile-image ${item.imageUrl ? 'is-loading' : 'is-loaded'}" style="background: ${item.gradient};">
        <div class="portfolio-tile-image-loading"></div>
        <div class="portfolio-tile-image-media"></div>
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

        const tileImageEl = tile.querySelector('.portfolio-tile-image');
        const { mediaEl: tileMediaEl } = ensureImageLayers(
            tileImageEl,
            'portfolio-tile-image-media',
            'portfolio-tile-image-loading'
        );

        if (tileImageEl && tileMediaEl && item.imageUrl) {
            applyImageLoadState(
                tileImageEl,
                tileMediaEl,
                item.imageUrl,
                'linear-gradient(rgba(5, 5, 16, 0.04), rgba(5, 5, 16, 0.16))'
            );
        }

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

    // Separate text/action blocks from image blocks
    const textBlocks = [];
    const imageBlocks = [];

    project.details.forEach(block => {
        if (block.type === 'image') {
            if (block.url) imageBlocks.push(block);
        } else {
            textBlocks.push(block);
        }
    });

    // Build text/action content (top section)
    const textContent = textBlocks.map(block => {
        switch (block.type) {
            case 'text':
                return `<p class="detail-text">${block.content}</p>`;

            case 'list':
                return `<ul class="detail-list">
                  ${block.items.map(item => `<li>${item}</li>`).join('')}
                </ul>`;

            case 'video':
                // Custom video player: thumbnail + play button → loads supported embeds on click
                const videoMeta = getVideoMeta(block.url);
                const thumb = block.thumbnail || videoMeta.thumbnail || '';
                const shouldAutoCapture = !block.thumbnail && videoMeta.provider === 'file';
                return `
                  <div
                    class="video-player-wrapper"
                    data-video-url="${block.url}"
                    data-video-provider="${videoMeta.provider}"
                    data-video-embed="${videoMeta.embedSrc || ''}"
                  >
                    <div
                      class="video-thumbnail ${shouldAutoCapture ? 'video-thumbnail-autocapture' : ''}"
                      style="background-image: url('${thumb}'); background: ${!thumb ? project.gradient : `url('${thumb}') center/cover no-repeat`};"
                    >
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

            case 'certificate':
                return `
                  <button type="button" class="detail-external-link detail-certificate-link" data-certificate-id="${block.certificateId || ''}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                      <polyline points="15 3 21 3 21 9"></polyline>
                      <line x1="10" y1="14" x2="21" y2="3"></line>
                    </svg>
                    <span>${block.label || 'View Certificate'}</span>
                  </button>`;

            default:
                return '';
        }
    }).join('');

    // Build image gallery (bottom section)
    const imageGalleryHtml = imageBlocks.length > 0
        ? `<div class="detail-placeholder-gallery detail-image-gallery">
            ${imageBlocks.map(block => `
              <div class="gallery-item detail-gallery-image-item is-loading" style="background: ${project.gradient};">
                <div class="portfolio-tile-image-loading"></div>
                <img src="${block.url}" alt="${block.alt || project.title}" loading="lazy" onload="this.parentElement.classList.remove('is-loading'); this.parentElement.classList.add('is-loaded');" />
              </div>
            `).join('')}
           </div>`
        : `<div class="detail-placeholder-gallery">
            <div class="gallery-item" style="background: ${project.gradient}; opacity: 0.6;">
              <span>Screenshot Placeholder</span>
            </div>
            <div class="gallery-item" style="background: ${project.gradient}; opacity: 0.4;">
              <span>Screenshot Placeholder</span>
            </div>
           </div>`;

    // Check if project has any media (video/image) — if not, show placeholder gallery
    const hasMedia = project.details.some(b => b.type === 'video' || (b.type === 'image' && b.url));
    const detailHeroStyle = project.imageUrl
        ? `--detail-hero-image: url('${project.imageUrl}'); background: ${project.gradient};`
        : `background: ${project.gradient};`;

    detail.innerHTML = `
    <div class="detail-hero ${project.imageUrl ? 'has-detail-hero-image' : ''}" style="${detailHeroStyle}">
      <div class="detail-hero-overlay"></div>
      <div class="detail-hero-content">
        <span class="detail-category">${project.category}</span>
        <h2 class="detail-title">${project.title}</h2>
        <p class="detail-subtitle">${project.description}</p>
        <div class="chip-container detail-tools">
          ${project.tools.map(t => `<span class="chip">${t}</span>`).join('')}
        </div>
      </div>
    </div>
    <div class="detail-body">
      ${textContent}
      ${imageGalleryHtml}
    </div>
  `;

    level3Container.appendChild(detail);

    // Bind video play buttons
    detail.querySelectorAll('.video-player-wrapper').forEach(wrapper => {
        const thumbEl = wrapper.querySelector('.video-thumbnail');
        const iframeContainer = wrapper.querySelector('.video-iframe-container');
        const videoProvider = wrapper.dataset.videoProvider;
        const embedSrc = wrapper.dataset.videoEmbed;
        const videoUrl = wrapper.dataset.videoUrl;

        if (thumbEl.classList.contains('video-thumbnail-autocapture') && videoUrl) {
            attemptVideoThumbnailCapture(thumbEl, videoUrl);
        }

        thumbEl.addEventListener('click', () => {
            if (embedSrc) {
                iframeContainer.innerHTML = `
                  <iframe
                    src="${embedSrc}"
                    frameborder="0"
                    allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                    allowfullscreen
                  ></iframe>`;
            } else if (videoProvider === 'file' && videoUrl) {
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

    detail.querySelectorAll('.detail-certificate-link').forEach(button => {
        button.addEventListener('click', () => {
            const certificateId = button.dataset.certificateId;
            if (!certificateId) return;

            const certificateSection = document.getElementById('certificates');
            const certificateTile = document.querySelector(`.certificate-tile[data-certificate-id="${certificateId}"]`);

            if (certificateSection) {
                const top = certificateSection.getBoundingClientRect().top + window.scrollY - 120;
                window.scrollTo({ top, behavior: 'smooth' });
            }

            if (certificateTile) {
                setTimeout(() => {
                    certificateTile.click();
                }, 450);
            }
        });
    });

    // Bind lightbox on gallery images
    detail.querySelectorAll('.detail-gallery-image-item img').forEach(img => {
        img.addEventListener('click', () => {
            openImageLightbox(img.src, img.alt);
        });
    });
}

// ==========================================
// Image Lightbox
// ==========================================
function openImageLightbox(src, alt) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'image-lightbox-overlay';
    overlay.innerHTML = `
        <button class="lightbox-close-btn" aria-label="Close">✕</button>
        <img src="${src}" alt="${alt || ''}" />
    `;
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Animate in
    requestAnimationFrame(() => {
        overlay.classList.add('lightbox-visible');
    });

    // Close function
    const closeLightbox = () => {
        overlay.classList.remove('lightbox-visible');
        setTimeout(() => {
            overlay.remove();
            document.body.style.overflow = '';
        }, 300);
    };

    // Close on X button
    overlay.querySelector('.lightbox-close-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        closeLightbox();
    });

    // Close on clicking background (not the image)
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeLightbox();
    });

    // Close on Escape key
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            closeLightbox();
            window.removeEventListener('keydown', escHandler);
        }
    };
    window.addEventListener('keydown', escHandler);
}

// ==========================================
// Helpers: detect supported video providers and build official embed URLs
// ==========================================
function extractYouTubeId(url) {
    if (!url) return null;
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([^&\n?#]+)/);
    return match ? match[1] : null;
}

function extractVimeoId(url) {
    if (!url) return null;
    const match = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
    return match ? match[1] : null;
}

function isFacebookVideoUrl(url) {
    if (!url) return false;
    return /facebook\.com|fb\.watch/.test(url);
}

function isDirectVideoFile(url) {
    if (!url) return false;
    return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url);
}

function getVideoMeta(url) {
    const youtubeId = extractYouTubeId(url);
    if (youtubeId) {
        return {
            provider: 'youtube',
            embedSrc: `https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1&controls=1&color=white&iv_load_policy=3`,
            thumbnail: `https://img.youtube.com/vi/${youtubeId}/maxresdefault.jpg`
        };
    }

    const vimeoId = extractVimeoId(url);
    if (vimeoId) {
        return {
            provider: 'vimeo',
            embedSrc: `https://player.vimeo.com/video/${vimeoId}?autoplay=1&title=0&byline=0&portrait=0`,
            thumbnail: ''
        };
    }

    if (isFacebookVideoUrl(url)) {
        return {
            provider: 'facebook',
            embedSrc: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`,
            thumbnail: ''
        };
    }

    if (isDirectVideoFile(url)) {
        return {
            provider: 'file',
            embedSrc: '',
            thumbnail: ''
        };
    }

    return {
        provider: 'unknown',
        embedSrc: '',
        thumbnail: ''
    };
}

function applyProjectOverrides(project) {
    if (!project) {
        return project;
    }

    if (project.project_key === 'smc-1') {
        return {
            ...project,
            title: 'Harmonia Polifonica Chorale Branding 2024',
            category: 'Branding & Content Direction',
            description: 'Full social media branding for an internationally competing university chorale — from website launch graphics and audition campaigns to competition achievement posts that reached thousands.',
            tools: ['Canva', 'Adobe Photoshop', 'Adobe Illustrator', 'Figma', 'Affinity'],
            details: [
                {
                    type: 'text',
                    content: 'Served as the sole graphic designer and content director for Harmonia Polifonica Chorale throughout the 2024 season, handling all visual branding and social media content from concept to final output.'
                },
                {
                    type: 'list',
                    items: [
                        'Led the full creative direction for the choir\'s social media presence across Facebook and Instagram',
                        'Developed and maintained a cohesive brand identity system — color palette, typography, layout standards, and visual tone',
                        'Conceptualized, designed, and delivered all content types including announcements, campaigns, promotional posts, and event collateral',
                        'Managed the visual storytelling for a group competing at the international level, ensuring every piece matched the caliber of their achievements',
                        'Balanced creative output across multiple content needs — from recruitment drives to milestone celebrations — while keeping brand consistency throughout'
                    ]
                }
            ]
        };
    }

    if (project.project_key === 'smc-2') {
        return {
            ...project,
            title: 'Harmonia Polifonica Chorale World Choral Day 2024',
            category: 'Event Campaign Content',
            description: 'A targeted social media campaign for World Choral Day 2024 — designed to drive engagement, celebrate the choir\'s community, and boost visibility during one of the biggest dates in the choral calendar.',
            tools: ['Canva', 'Adobe Photoshop', 'Adobe Illustrator', 'Figma'],
            details: [
                {
                    type: 'text',
                    content: 'Handled the end-to-end visual campaign for the choir\'s World Choral Day 2024 participation — from content strategy and visual direction to design execution and delivery.'
                },
                {
                    type: 'list',
                    items: [
                        'Planned and executed a multi-phase content campaign covering pre-event, day-of, and post-event stages',
                        'Applied a consistent visual direction that aligned with the choir\'s existing brand while introducing a festive, event-specific tone',
                        'Focused each piece on a clear engagement goal — awareness, community interaction, or celebration',
                        'Coordinated content timing and sequencing for maximum reach and audience engagement across platforms'
                    ]
                }
            ]
        };
    }

    if (project.project_key === 'smc-3') {
        return {
            ...project,
            title: 'Harmonia Polifonica Chorale Branding 2023',
            category: 'Promotional Branding',
            description: 'The foundation year — building a recognizable social media identity from the ground up that would later scale into international-level branding.',
            tools: ['Canva', 'Adobe Photoshop', 'Adobe Illustrator', 'Figma'],
            details: [
                {
                    type: 'text',
                    content: 'Started as the choir\'s first dedicated graphic designer in 2023, tasked with building a visual identity from zero and establishing the design standards that would define their brand going forward.'
                },
                {
                    type: 'list',
                    items: [
                        'Created the choir\'s first cohesive brand system — defining the visual language, color direction, and typography that all future content would follow',
                        'Handled all design needs across the full content lifecycle — from regular social posts to event-specific campaigns',
                        'Established a scalable design workflow that allowed fast turnaround without sacrificing quality or brand consistency',
                        'Built the visual foundation that the chorale still uses today, including the identity that carried them through international competitions'
                    ]
                }
            ]
        };
    }

    if (project.project_key !== 'mg-3') {
        return project;
    }

    return {
        ...project,
        service_key: 'video-editing',
        title: 'HUSAY 2026 Official Event Video',
        category: 'End-to-End Video Production',
        description: 'Executed the full post-production workflow for the HUSAY 2026 official event video, transforming a script-based direction into a polished Facebook-ready production published by Dr. Shirley C. Agrupis, Chairperson of the Commission on Higher Education in the Philippines.',
        gradient: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
        tools: ['Adobe Premiere Pro', 'Adobe After Effects', 'CapCut'],
        image_url: '/husay-2026-video-poster.svg',
        details: [
            {
                type: 'text',
                content: 'Handled the project end-to-end as the sole video editor, using the provided script as a creative starting point and personally managing clip selection, sequencing, audio pacing, sound effects, transitions, timing, and the overall emotional rhythm to turn the piece into a polished, high-retention event video from the ground up.'
            },
            {
                type: 'video',
                url: 'https://www.facebook.com/reel/950207200710625',
                caption: 'Official HUSAY 2026 event video published on Facebook',
                duration: ''
            },
            {
                type: 'link',
                url: 'https://www.facebook.com/reel/950207200710625',
                label: 'Watch the published official video'
            },
            {
                type: 'certificate',
                certificateId: 'husay-2026',
                label: 'View the supporting certificate'
            }
        ]
    };
}

function attemptVideoThumbnailCapture(thumbnailEl, videoUrl) {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;

    const applyCapturedFrame = () => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 1280;
            canvas.height = video.videoHeight || 720;
            const context = canvas.getContext('2d');
            if (!context) return;

            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
            thumbnailEl.style.background = `url('${dataUrl}') center/cover no-repeat`;
            thumbnailEl.classList.add('video-thumbnail-has-capture');
        } catch (error) {
            console.warn('Video thumbnail capture failed:', error);
        } finally {
            video.remove();
        }
    };

    video.addEventListener('loadeddata', () => {
        if (video.readyState >= 2) {
            const targetTime = Math.min(1, Math.max(0.1, (video.duration || 1) * 0.15));
            if (Number.isFinite(targetTime)) {
                video.currentTime = targetTime;
            } else {
                applyCapturedFrame();
            }
        }
    }, { once: true });

    video.addEventListener('seeked', applyCapturedFrame, { once: true });
    video.addEventListener('error', () => {
        video.remove();
    }, { once: true });
}
