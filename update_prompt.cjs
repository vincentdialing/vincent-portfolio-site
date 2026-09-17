const fs = require('fs');
const file = 'src/admin.js';
let content = fs.readFileSync(file, 'utf8');

const newPrompt = `
You are an expert ATS (Applicant Tracking System) Resume Writer and HTML Designer.
I will provide my base personal information and scraped portfolio content.
Your task is to generate a professional, highly-optimized, ATS-friendly resume tailored specifically for the role of: "\${niche}".

BASE PERSONAL INFORMATION (Always include this EXACTLY):
Name: VINCENT B. DIALING
Email: dialingvincent@gmail.com | Phone: +63 945 354 4181 | Location: Davao City, Philippines
Links: https://www.linkedin.com/in/vincentdialing/ | https://vincentdialing.vercel.app/

EDUCATION:
Bachelor of Science in Information Technology major in Business Technology Management
University of Southeastern Philippines | Davao City, Philippines | 2026
Magna Cum Laude
Student Leadership Excellence Awardee | Student Service Awardee
2nd Best University Student Artist of Class 2026

TECH PROFICIENCY:
Design & Content: Adobe Photoshop, Adobe Illustrator, Adobe After Effects, Adobe Premiere Pro, Canva, Figma, Affinity, CapCut, Procreate, Adobe Lightroom
AI & Automation: ChatGPT, Claude, Gemini, Grok, Google Apps Script
Web & Development: JavaScript, Tailwind CSS, Supabase, VS Code, GitHub, Google Antigravity, Cursor, Claude Opus
Productivity & Admin: Google Workspace (Docs, Sheets, Slides, Drive, Calendar), Microsoft Office (Word, Excel, PowerPoint)
Communication & Collaboration: Slack, Notion, Zoom, Google Meet
Social & Marketing: Meta Business Suite, Google Ads
Project Management: Trello, ClickUp, Monday.com
File Management: Google Drive, Dropbox, MEGA

CERTIFICATES:
- UI/UX Design – 16-Hour Blooming Fridays Workshop – DEVCON Davao
- Galactic Problem Solver, UI/UX Designer – NASA International Space Apps Challenge – Oct 2025
- Video Presentation Creator, Project HUSAY – CHED RAISE 2026 – Feb 2026

REMOTE WORK READINESS:
Internet: Primary: Converge Fiber 200 Mbps | Backup: Globe at Home Prepaid Wifi
Equipment: MacBook Pro 2019
Workspace: Quiet, dedicated room
Availability: Full-time, flexible — able to work night shift schedules (8PM–6AM)

LANGUAGES:
English: Proficient | Filipino: Fluent | Bisaya/Cebuano: Native | Hiligaynon: Native

BASE EXPERIENCE (Adapt bullet points to fit the "\${niche}" role based on this history, do NOT make up fake companies):
1. Visual Assets Creator @ Creon Motion | Jan 2025 – Sep 2026 (Remote)
2. UI/UX Designer & Social Media Manager @ Imperate Realty | Aug 2024 – Mar 2025 (Part-time, Remote)
3. Head Creatives and Lead Social Media Manager @ Harmonia Polifonica Chorale | Aug 2022 – Jul 2026 (Full-time, Hybrid)
4. Social Media Manager @ Candice and Leona Salon & Wellness Spa | Jan 2024 – Feb 2025 (Part-time, Remote)
5. Digital Marketing Specialist @ Mugna Technologies | Jun 2025 – Oct 2025 (Internship, Hybrid)
6. Design Lead @ DEVCON Davao | Oct 2024 – May 2026
7. Branding Manager @ Google Developer Student Clubs – USeP Obrero | Aug 2023 – Oct 2024

REQUIREMENTS FOR HTML LAYOUT:
- Format strictly in clean HTML. Do NOT output markdown.
- The outermost wrapper MUST be: <div class="ats-resume-container" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.4; color: #222; max-width: 850px; margin: 0 auto; padding: 2rem 3rem; background: #fff;">
- HEADER: The name MUST be <h1 style="font-size: 28px; font-weight: 700; margin: 0 0 5px 0; text-transform: uppercase; color: #000; letter-spacing: 1px;">VINCENT B. DIALING</h1>
- CONTACT INFO: Must be italicized and centered/left-aligned neatly: <p style="font-size: 13px; font-style: italic; margin: 0; color: #444;">dialingvincent@gmail.com | +63 945 354 4181 | Davao City, Philippines<br>https://www.linkedin.com/in/vincentdialing/ | https://vincentdialing.vercel.app/</p>
- SECTION HEADERS: MUST be styled EXACTLY like this: <h2 style="font-size: 15px; font-weight: 700; text-transform: uppercase; margin: 20px 0 10px 0; padding-bottom: 4px; border-bottom: 2px solid #20c997; color: #000; letter-spacing: 0.5px;">SECTION NAME</h2> (Note the #20c997 teal bottom border).
- JOB TITLES: <h3 style="font-size: 14px; font-weight: 700; margin: 0 0 2px 0;"><strong>Job Title</strong></h3>
- COMPANY & DATE: <p style="font-size: 13px; font-style: italic; margin: 0 0 8px 0; color: #444;">Company Name | Date Range</p>
- BULLET POINTS: Use standard <ul> and <li style="font-size: 13px; margin-bottom: 4px;">.
- Ensure the layout matches exactly the provided aesthetic (Teal lines under headers, clean bold uppercase headers, italicized meta-data).
- Output ONLY the raw HTML. Do not wrap in markdown \`\`\`html fences.

Here is the scraped portfolio content (use this to enrich the summary, skills, and experience bullets for the niche):
\${scrapedContext}
`;

const regex = /const prompt = `([\s\S]*?)`;\s*const completion/m;
content = content.replace(regex, 'const prompt = `' + newPrompt + '`;\n\n      const completion');
fs.writeFileSync(file, content);
console.log('Prompt updated.');
