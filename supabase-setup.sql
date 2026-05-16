-- ==========================================
-- Portfolio Drill-Down: Supabase Table Setup
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. Create portfolio_services table
CREATE TABLE IF NOT EXISTS portfolio_services (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT,
  display_order INT NOT NULL DEFAULT 0
);

-- 2. Create portfolio_projects table
CREATE TABLE IF NOT EXISTS portfolio_projects (
  id BIGSERIAL PRIMARY KEY,
  project_key TEXT UNIQUE NOT NULL,
  service_key TEXT NOT NULL REFERENCES portfolio_services(key) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  gradient TEXT NOT NULL,
  tools TEXT[] NOT NULL DEFAULT '{}',
  details JSONB NOT NULL DEFAULT '[]',
  display_order INT NOT NULL DEFAULT 0,
  image_url TEXT
);

-- 3. Enable Row Level Security (read-only public access)
ALTER TABLE portfolio_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on portfolio_services"
  ON portfolio_services FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on portfolio_projects"
  ON portfolio_projects FOR SELECT
  USING (true);

-- ==========================================
-- Seed Data: Services
-- ==========================================

INSERT INTO portfolio_services (key, title, display_order) VALUES
  ('social-media-content', 'Social Media Content Design', 1),
  ('video-editing', 'Video Editing & Post-Production', 2),
  ('ui-ux-design', 'UI/UX Design', 3),
  ('web-development', 'Web Development', 4),
  ('social-media-management', 'Social Media Management', 5),
  ('brand-identity', 'Brand Identity Design', 6),
  ('motion-graphics', 'Motion Graphics & Video Assets', 7),
  ('graphic-design', 'Graphic Design', 8);

-- ==========================================
-- Seed Data: Projects
-- ==========================================

-- Social Media Content
INSERT INTO portfolio_projects (project_key, service_key, title, category, description, gradient, tools, details, display_order) VALUES
(
  'smc-1', 'social-media-content', 'Brand Launch Campaign', 'Instagram Carousel',
  'A 10-slide carousel post series for a product launch campaign, designed to maximize engagement and conversions.',
  'linear-gradient(135deg, #e11d48 0%, #7c1d3e 100%)',
  ARRAY['Adobe Photoshop', 'Canva'],
  '[{"type":"text","content":"Created a cohesive visual campaign across Instagram, Facebook, and TikTok. Each slide was optimized for the platform''s native dimensions and engagement patterns."},{"type":"text","content":"The campaign achieved over 5,000 impressions in the first 48 hours, with a 12% engagement rate — well above the industry average."}]'::jsonb,
  1
),
(
  'smc-2', 'social-media-content', 'Restaurant Social Pack', 'Stories & Posts',
  'Complete social media kit including templates for daily posts, stories, and highlight covers.',
  'linear-gradient(135deg, #f43f5e 0%, #881337 100%)',
  ARRAY['Canva', 'Adobe Lightroom'],
  '[{"type":"text","content":"Designed a full social media template kit for a local restaurant brand, including 20 post templates, 10 story templates, and 8 highlight covers."},{"type":"text","content":"The templates featured a warm, inviting color palette with consistent typography that matched the restaurant''s brand identity."}]'::jsonb,
  2
),
(
  'smc-3', 'social-media-content', 'E-Commerce Ad Creatives', 'Ad Design',
  'High-converting ad creatives for Facebook and Instagram advertising campaigns.',
  'linear-gradient(135deg, #be123c 0%, #4c0519 100%)',
  ARRAY['Adobe Photoshop', 'Figma'],
  '[{"type":"text","content":"Produced a series of ad creatives optimized for Facebook and Instagram, including static images, carousel ads, and story ads."},{"type":"text","content":"A/B tested multiple design variations to identify the highest-performing visuals, improving click-through rates by 25%."}]'::jsonb,
  3
);

-- Video Editing
INSERT INTO portfolio_projects (project_key, service_key, title, category, description, gradient, tools, details, display_order) VALUES
(
  've-1', 'video-editing', 'Product Showcase Reel', 'Short-Form Video',
  'Dynamic 60-second product showcase reel with motion graphics and sound design.',
  'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
  ARRAY['Adobe Premiere Pro', 'Adobe After Effects'],
  '[{"type":"text","content":"Edited a high-energy product showcase reel featuring smooth transitions, custom motion graphics, and professional color grading."},{"type":"video","url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","duration":"1:00","caption":"Product Showcase Reel — Final Cut"},{"type":"text","content":"Optimized for Instagram Reels and TikTok with attention-grabbing hooks in the first 3 seconds."}]'::jsonb,
  1
),
(
  've-2', 'video-editing', 'Event Highlight Film', 'Long-Form Video',
  'A 5-minute event highlight film with cinematic editing, color grading, and narrative flow.',
  'linear-gradient(135deg, #6d28d9 0%, #2e1065 100%)',
  ARRAY['Adobe Premiere Pro', 'CapCut'],
  '[{"type":"text","content":"Produced a cinematic recap video for a tech community event, blending speaker clips, audience reactions, and behind-the-scenes footage."},{"type":"video","url":"https://www.youtube.com/watch?v=dQw4w9WgXcQ","duration":"5:12","caption":"Event Highlight Film — Full Version"},{"type":"text","content":"Applied cinematic color grading and designed custom lower thirds for speaker identification."}]'::jsonb,
  2
),
(
  've-3', 'video-editing', 'Social Media Video Series', 'Content Series',
  'Weekly video content series with consistent branding, subtitles, and engagement hooks.',
  'linear-gradient(135deg, #8b5cf6 0%, #3b0764 100%)',
  ARRAY['CapCut', 'Adobe After Effects'],
  '[{"type":"text","content":"Developed a recurring social media video series with templated intros, branded elements, and auto-generated subtitles."},{"type":"text","content":"Each episode followed a clear structure: hook, content, call-to-action — optimized for watch retention."}]'::jsonb,
  3
);

-- UI/UX Design
INSERT INTO portfolio_projects (project_key, service_key, title, category, description, gradient, tools, details, display_order) VALUES
(
  'uiux-1', 'ui-ux-design', 'Mobile App Redesign', 'App Design',
  'Complete UX audit and visual redesign for a mobile application.',
  'linear-gradient(135deg, #0ea5e9 0%, #0369a1 100%)',
  ARRAY['Figma', 'Adobe Photoshop'],
  '[{"type":"text","content":"Conducted a UX audit to identify pain points in the user journey. Redesigned key screens with improved navigation, clearer visual hierarchy, and accessibility improvements."},{"type":"text","content":"Built a component library in Figma with reusable atoms, molecules, and organisms for scalable design."}]'::jsonb,
  1
),
(
  'uiux-2', 'ui-ux-design', 'Dashboard Interface', 'Web App Design',
  'Analytics dashboard with data visualization, dark mode, and responsive layout.',
  'linear-gradient(135deg, #0284c7 0%, #082f49 100%)',
  ARRAY['Figma', 'Adobe Illustrator'],
  '[{"type":"text","content":"Designed a modern analytics dashboard featuring interactive charts, real-time data widgets, and a clean dark-mode interface."},{"type":"text","content":"Created responsive layouts that adapt seamlessly from desktop to tablet, maintaining data readability at all breakpoints."}]'::jsonb,
  2
),
(
  'uiux-3', 'ui-ux-design', 'Landing Page Design', 'Web Design',
  'High-converting landing page with clear CTAs, trust signals, and visual storytelling.',
  'linear-gradient(135deg, #38bdf8 0%, #075985 100%)',
  ARRAY['Figma', 'Affinity'],
  '[{"type":"text","content":"Designed a conversion-focused landing page with strategic placement of CTAs, social proof sections, and engaging hero visuals."},{"type":"text","content":"Tested multiple layout variations and refined based on user feedback to achieve optimal conversion flow."}]'::jsonb,
  3
);

-- Web Development
INSERT INTO portfolio_projects (project_key, service_key, title, category, description, gradient, tools, details, display_order) VALUES
(
  'wd-1', 'web-development', 'Portfolio Website', 'Personal Site',
  'Interactive personal portfolio with AI voice assistant, dynamic content, and smooth animations.',
  'linear-gradient(135deg, #10b981 0%, #065f46 100%)',
  ARRAY['JavaScript', 'Supabase', 'Tailwind'],
  '[{"type":"text","content":"Built this very portfolio site featuring an AI-powered voice assistant, Supabase-driven dynamic content, and buttery smooth scroll animations."},{"type":"text","content":"Implemented a custom design system with CSS variables, glass morphism effects, and responsive bento grid layouts."}]'::jsonb,
  1
),
(
  'wd-2', 'web-development', 'Business Landing Page', 'Client Project',
  'Responsive business website with SEO optimization and contact form integration.',
  'linear-gradient(135deg, #059669 0%, #022c22 100%)',
  ARRAY['JavaScript', 'Vanilla CSS', 'GitHub'],
  '[{"type":"text","content":"Developed a fully responsive business landing page with optimized performance scores and semantic HTML structure."},{"type":"text","content":"Integrated a contact form with email notifications and implemented SEO best practices for search visibility."}]'::jsonb,
  2
),
(
  'wd-3', 'web-development', 'E-Commerce Frontend', 'Web Application',
  'Modern e-commerce frontend with product filtering, cart functionality, and checkout flow.',
  'linear-gradient(135deg, #34d399 0%, #064e3b 100%)',
  ARRAY['JavaScript', 'Tailwind', 'VS Code'],
  '[{"type":"text","content":"Built a modern e-commerce frontend featuring product grid layouts, dynamic filtering, shopping cart management, and a streamlined checkout process."},{"type":"text","content":"Focused on performance with lazy-loaded images, optimistic UI updates, and smooth page transitions."}]'::jsonb,
  3
);

-- Social Media Management
INSERT INTO portfolio_projects (project_key, service_key, title, category, description, gradient, tools, details, display_order) VALUES
(
  'smm-1', 'social-media-management', '90-Day Growth Strategy', 'Strategy & Planning',
  'Comprehensive social media growth strategy with content calendar and KPI tracking.',
  'linear-gradient(135deg, #f59e0b 0%, #b45309 100%)',
  ARRAY['Meta Business Suite', 'Notion'],
  '[{"type":"text","content":"Developed a 90-day growth strategy covering content pillars, posting schedules, engagement tactics, and influencer outreach plans."},{"type":"text","content":"Set up analytics dashboards to track follower growth, engagement rates, and conversion metrics on a weekly basis."}]'::jsonb,
  1
),
(
  'smm-2', 'social-media-management', 'Community Engagement Campaign', 'Community Management',
  'Active community management including response templates, UGC campaigns, and engagement tracking.',
  'linear-gradient(135deg, #d97706 0%, #451a03 100%)',
  ARRAY['Slack', 'Canva', 'Notion'],
  '[{"type":"text","content":"Managed community engagement across multiple platforms, creating response templates and escalation workflows for consistent brand voice."},{"type":"text","content":"Launched a user-generated content campaign that increased organic reach by 40% over 60 days."}]'::jsonb,
  2
),
(
  'smm-3', 'social-media-management', 'Analytics & Reporting Suite', 'Data & Insights',
  'Monthly analytics reports with actionable insights, competitor analysis, and trend forecasting.',
  'linear-gradient(135deg, #fbbf24 0%, #78350f 100%)',
  ARRAY['Meta Business Suite', 'Notion'],
  '[{"type":"text","content":"Created comprehensive monthly reports featuring performance metrics, audience demographics, and content performance breakdowns."},{"type":"text","content":"Included competitor benchmarking and trend analysis to inform future content strategy decisions."}]'::jsonb,
  3
);

-- Brand Identity
INSERT INTO portfolio_projects (project_key, service_key, title, category, description, gradient, tools, details, display_order) VALUES
(
  'bi-1', 'brand-identity', 'Startup Brand Package', 'Full Brand Identity',
  'Complete brand identity for a tech startup including logo, colors, typography, and brand book.',
  'linear-gradient(135deg, #ec4899 0%, #9d174d 100%)',
  ARRAY['Adobe Illustrator', 'Adobe Photoshop'],
  '[{"type":"text","content":"Designed a complete brand identity system for a tech startup, starting from mood boards and sketches through to final deliverables."},{"type":"text","content":"Delivered a comprehensive brand book covering logo usage, color specifications, typography hierarchy, and application examples."}]'::jsonb,
  1
),
(
  'bi-2', 'brand-identity', 'Restaurant Rebrand', 'Logo & Visual Identity',
  'Visual rebrand for a restaurant chain including new logo, menu design, and signage.',
  'linear-gradient(135deg, #db2777 0%, #500724 100%)',
  ARRAY['Adobe Illustrator', 'Affinity', 'Procreate'],
  '[{"type":"text","content":"Led the visual rebrand of a restaurant, creating a modern logo that honored the establishment''s history while appealing to a younger demographic."},{"type":"text","content":"Extended the brand across menu design, packaging, uniforms, and interior signage for a cohesive customer experience."}]'::jsonb,
  2
),
(
  'bi-3', 'brand-identity', 'Personal Brand Kit', 'Personal Branding',
  'Personal branding package for a content creator including logo, social templates, and media kit.',
  'linear-gradient(135deg, #f472b6 0%, #831843 100%)',
  ARRAY['Canva', 'Adobe Photoshop', 'Procreate'],
  '[{"type":"text","content":"Created a personal branding kit for a content creator, including a versatile logo, social media templates, and a professional media kit."},{"type":"text","content":"Designed all assets to be easily customizable by the creator using Canva templates for ongoing content creation."}]'::jsonb,
  3
);

-- Motion Graphics
INSERT INTO portfolio_projects (project_key, service_key, title, category, description, gradient, tools, details, display_order) VALUES
(
  'mg-1', 'motion-graphics', 'Logo Animation Pack', 'Logo Reveals',
  'Custom logo animation with multiple variations for different platforms and contexts.',
  'linear-gradient(135deg, #06b6d4 0%, #155e75 100%)',
  ARRAY['Adobe After Effects', 'Adobe Illustrator'],
  '[{"type":"text","content":"Created 5 unique logo animation variations: a cinematic reveal for videos, a subtle loop for website headers, and quick stingers for social media."},{"type":"text","content":"Delivered in multiple formats including MP4, GIF, and transparent WebM for maximum flexibility."}]'::jsonb,
  1
),
(
  'mg-2', 'motion-graphics', 'Social Media Animation Kit', 'Animated Templates',
  'Set of animated templates for Instagram Stories, Reels, and TikTok content.',
  'linear-gradient(135deg, #0891b2 0%, #0a2129 100%)',
  ARRAY['Adobe After Effects', 'Adobe Premiere Pro'],
  '[{"type":"text","content":"Designed and animated a kit of 15 social media templates with customizable text, colors, and imagery placeholders."},{"type":"text","content":"Templates included animated titles, transitions, lower thirds, and end screens optimized for each platform."}]'::jsonb,
  2
),
(
  'mg-3', 'video-editing', 'HUSAY 2026 Official Event Video', 'End-to-End Video Production',
  'Executed the full post-production workflow for the HUSAY 2026 official event video, transforming a script-based direction into a polished Facebook-ready production published by Dr. Shirley C. Agrupis, Chairperson of the Commission on Higher Education in the Philippines.',
  'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
  ARRAY['Adobe Premiere Pro', 'Adobe After Effects', 'CapCut'],
  '[{"type":"text","content":"Handled the project end-to-end as the sole video editor, using the provided script as a creative starting point and personally managing clip selection, sequencing, audio pacing, sound effects, transitions, timing, and the overall emotional rhythm to turn the piece into a polished, high-retention event video from the ground up."},{"type":"video","url":"https://www.facebook.com/reel/950207200710625","caption":"Official HUSAY 2026 event video published on Facebook"},{"type":"link","url":"https://www.facebook.com/reel/950207200710625","label":"Watch the published official video"},{"type":"certificate","certificateId":"husay-2026","label":"View the supporting certificate"}]'::jsonb,
  3
);

-- Graphic Design
INSERT INTO portfolio_projects (project_key, service_key, title, category, description, gradient, tools, details, display_order) VALUES
(
  'gd-1', 'graphic-design', 'Event Poster Series', 'Print Design',
  'Series of promotional posters for tech community events and meetups.',
  'linear-gradient(135deg, #8b5cf6 0%, #5b21b6 100%)',
  ARRAY['Adobe Photoshop', 'Adobe Illustrator'],
  '[{"type":"text","content":"Designed a cohesive series of event posters for a tech community, maintaining brand consistency while giving each event its own visual identity."},{"type":"text","content":"Posters were used across digital and print channels, including social media, email campaigns, and physical venue displays."}]'::jsonb,
  1
),
(
  'gd-2', 'graphic-design', 'Pitch Deck Design', 'Presentation Design',
  'Professional pitch deck with compelling visuals, data visualization, and clear narrative flow.',
  'linear-gradient(135deg, #7c3aed 0%, #1e0a3e 100%)',
  ARRAY['Canva', 'Affinity', 'Procreate'],
  '[{"type":"text","content":"Designed a 20-slide investor pitch deck with clean layouts, data-driven charts, and compelling visual storytelling."},{"type":"text","content":"Focused on readability and impact, using strategic whitespace and a limited color palette to direct attention to key metrics."}]'::jsonb,
  2
),
(
  'gd-3', 'graphic-design', 'Marketing Collateral Set', 'Print & Digital',
  'Complete set of marketing materials including brochures, flyers, and business cards.',
  'linear-gradient(135deg, #a78bfa 0%, #3b0764 100%)',
  ARRAY['Adobe Illustrator', 'Adobe Lightroom', 'Canva', 'Procreate'],
  '[{"type":"text","content":"Created a unified set of marketing collateral for a client, including tri-fold brochures, event flyers, business cards, and email headers."},{"type":"text","content":"All materials followed the client''s brand guidelines while introducing fresh design elements to modernize their visual presence."}]'::jsonb,
  3
);
