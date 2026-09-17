const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

// 1. Replace Wide Card (Landing Page -> UI/UX)
html = html.replace(
  `<!-- Creative Developer (Wide) -->
            <div class="service-card service-card-wide">
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
                <h3>Landing Page & Funnel Designer</h3>
                <p>Conversion-focused landing pages and funnel experiences designed for visual clarity, smooth flow, and stronger inquiries.</p>
              </div>
            </div>`,
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
                <p>Designing intuitive, user-centered interfaces and seamless digital experiences. From wireframes to high-fidelity prototypes, I ensure your website or app is visually stunning, accessible, and optimized for high conversion rates.</p>
              </div>
            </div>`
);

// 2. Replace Small UI/UX Card -> Social Media Management
html = html.replace(
  `<!-- UI/UX Designer -->
            <div class="service-card">
              <div class="service-icon service-icon-github icon-animate-scroll icon-float">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
              </div>
              <div class="service-card-text">
                <h3>UI/UX Designer</h3>
                <p>Intuitive interfaces and seamless user journeys.</p>
              </div>
            </div>`,
  `<!-- Social Media Management -->
            <div class="service-card">
              <div class="service-icon icon-animate-scroll icon-float">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
              </div>
              <div class="service-card-text">
                <h3>Social Media Management</h3>
                <p>Engaging content strategies and organic growth.</p>
              </div>
            </div>`
);

// 3. Fix Graphic Designer Icon (Remove LinkedIn SVG and put a pen/palette or just the old pen tool)
html = html.replace(
  `<!-- Graphic Designer -->
            <div class="service-card">
              <div class="service-icon service-icon-linkedin icon-animate-scroll icon-wiggle">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
                </svg>
              </div>
              <div class="service-card-text">
                <h3>Graphic Designer</h3>
                <p>Visuals and brand identities with impact.</p>
              </div>
            </div>`,
  `<!-- Graphic Designer -->
            <div class="service-card">
              <div class="service-icon icon-animate-scroll icon-wiggle">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                  <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                  <path d="M2 2l7.586 7.586"></path>
                  <circle cx="11" cy="11" r="2"></circle>
                </svg>
              </div>
              <div class="service-card-text">
                <h3>Graphic Designer</h3>
                <p>Visuals and brand identities with impact.</p>
              </div>
            </div>`
);

fs.writeFileSync('index.html', html);
console.log('Cards updated!');
