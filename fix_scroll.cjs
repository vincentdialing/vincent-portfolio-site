const fs = require('fs');
let code = fs.readFileSync('src/main.js', 'utf8');

code = code.replace(
  "certificateModal.classList.add('is-open');",
  "certificateModal.classList.add('is-open');\n  document.body.style.overflow = 'hidden';"
);

code = code.replace(
  "certificateModal.classList.remove('is-open');",
  "certificateModal.classList.remove('is-open');\n  document.body.style.overflow = '';"
);

code = code.replace(
  "resumeModal.classList.add('is-open');",
  "resumeModal.classList.add('is-open');\n    document.body.style.overflow = 'hidden';"
);

code = code.replace(
  "resumeModal.classList.remove('is-open');",
  "resumeModal.classList.remove('is-open');\n    document.body.style.overflow = '';"
);

fs.writeFileSync('src/main.js', code);
console.log('Scroll lock added!');
