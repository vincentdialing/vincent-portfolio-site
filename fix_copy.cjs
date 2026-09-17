const fs = require('fs');
let html = fs.readFileSync('index.html', 'utf8');

html = html.replace(
  "Designing intuitive, user-centered interfaces and seamless digital experiences. From wireframes to high-fidelity prototypes, I ensure your website or app is visually stunning, accessible, and optimized for high conversion rates.",
  "Designing intuitive, user-centered interfaces and seamless digital experiences. Optimized for visual clarity, smooth flow, and high conversions."
);

fs.writeFileSync('index.html', html);
console.log('Copy shortened!');
