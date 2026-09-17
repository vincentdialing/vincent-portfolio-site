const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Change Wide Card from UI/UX Designer to Social Media Management
html = html.replace(
  `<!-- UI/UX Designer (Wide) -->
            <div class="service-card service-card-wide">
              <div class="service-icon icon-animate-scroll icon-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
              </div>
              <div class="service-card-text">
                <h3>UI/UX Designer</h3>
                <p>Designing intuitive, user-centered interfaces and seamless digital experiences. Optimized for visual clarity, smooth flow, and high conversions.</p>
              </div>
            </div>`,
  `<!-- Social Media Management (Wide) -->
            <div class="service-card service-card-wide">
              <div class="service-icon icon-animate-scroll icon-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <div class="service-card-text">
                <h3>Social Media Management</h3>
                <p>End-to-end strategy, engaging content calendars, and data-driven organic growth designed to elevate your brand visibility and engagement.</p>
              </div>
            </div>`
);

// 2. Change Small Card from Video Editor to UI/UX Designer
html = html.replace(
  `<!-- Video Editor -->
            <div class="service-card">
              <div class="service-icon icon-animate-scroll icon-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                  <path d="M2 2l7.586 7.586"></path>
                  <circle cx="11" cy="11" r="2"></circle>
                </svg>
              </div>
              <div class="service-card-text">
                <h3>Video Editor</h3>
                <p>Dynamic edits for modern content platforms.</p>
              </div>
            </div>`,
  `<!-- UI/UX Designer -->
            <div class="service-card">
              <div class="service-icon icon-animate-scroll icon-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="3" y1="9" x2="21" y2="9"></line>
                  <line x1="9" y1="21" x2="9" y2="9"></line>
                </svg>
              </div>
              <div class="service-card-text">
                <h3>UI/UX Designer</h3>
                <p>Intuitive interfaces and seamless user journeys.</p>
              </div>
            </div>`
);

fs.writeFileSync('index.html', html);
console.log('Cards swapped and updated!');
