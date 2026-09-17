const fs = require('fs');
const file = 'src/admin.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Add resume to TAB_CONFIGS
content = content.replace(
  "config: { title: 'Supabase Credentials', subtitle: 'Configure credentials to authenticate your write sessions.', button: '' }",
  "config: { title: 'Supabase Credentials', subtitle: 'Configure credentials to authenticate your write sessions.', button: '' },\n  resume: { title: 'Resume Manager', subtitle: 'Upload and manage your CV/Resume PDF.', button: '' }"
);

content = content.replace(
  "config: 'config'\n};",
  "config: 'config',\n  resume: 'resume'\n};"
);

content = content.replace(
  "credentials: 'config'\n};",
  "credentials: 'config',\n  resume: 'resume',\n  resumemanager: 'resume'\n};"
);

// 2. Add contentDisposition: 'inline'
content = content.replace(
  "contentType: 'application/pdf'\n        });",
  "contentType: 'application/pdf',\n          contentDisposition: 'inline'\n        });"
);

// 3. Add DOMContentLoaded execution for initAIAtsGenerator
content = content.replace(
  "setTimeout(initResumeManager, 1000);\n});",
  "setTimeout(initResumeManager, 500);\n  setTimeout(initAIAtsGenerator, 500);\n});\n// Fallback if DOM already loaded\nif (document.readyState !== 'loading') {\n  setTimeout(initAIAtsGenerator, 500);\n}"
);

fs.writeFileSync(file, content);
console.log('Fixes applied.');
