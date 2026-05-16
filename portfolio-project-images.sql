-- ==========================================
-- Portfolio Project Images Table
-- Stores gallery images for project detail views
-- Run this in your Supabase SQL Editor
-- ==========================================

CREATE TABLE IF NOT EXISTS portfolio_project_images (
  id BIGSERIAL PRIMARY KEY,
  project_key TEXT NOT NULL REFERENCES portfolio_projects(project_key) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  display_order INT NOT NULL DEFAULT 0
);

-- Enable Row Level Security (read-only public access)
ALTER TABLE portfolio_project_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on portfolio_project_images"
  ON portfolio_project_images FOR SELECT
  USING (true);

-- Create index for faster lookups by project_key
CREATE INDEX IF NOT EXISTS idx_project_images_project_key
  ON portfolio_project_images(project_key);

-- ==========================================
-- Example: How to add images
-- ==========================================
-- INSERT INTO portfolio_project_images (project_key, image_url, alt, caption, display_order) VALUES
--   ('smc-1', 'https://your-supabase-url.supabase.co/storage/v1/object/public/portfolio/smc1-website-launch.png', 'Website launch announcement', 'Website launch announcement — driving traffic to hpcsingers.website', 1),
--   ('smc-1', 'https://your-supabase-url.supabase.co/storage/v1/object/public/portfolio/smc1-audition-call.png', 'Audition call design', 'Recruitment campaign — "A Letter of Invitation to Sing With Us"', 2),
--   ('smc-1', 'https://your-supabase-url.supabase.co/storage/v1/object/public/portfolio/smc1-gold-diploma.png', 'Gold Diploma achievement post', 'Gold Diploma — Andrea O. Veneracion International Choral Festival Manila', 3),
--   ('smc-1', 'https://your-supabase-url.supabase.co/storage/v1/object/public/portfolio/smc1-grand-prix.png', '3rd Place Grand Prix achievement post', '3rd Place Grand Prix — Himig Handog International Choral Competition 2025', 4);
