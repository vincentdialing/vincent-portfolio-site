-- ==========================================
-- Certificates & Client Reviews: Supabase Tables Setup
-- Run this in your Supabase SQL Editor
-- ==========================================

-- 1. Create portfolio_certificates table
CREATE TABLE IF NOT EXISTS portfolio_certificates (
  id BIGSERIAL PRIMARY KEY,
  certificate_id TEXT UNIQUE,
  title TEXT NOT NULL,
  issuer TEXT NOT NULL,
  date TEXT NOT NULL,
  link TEXT,
  image_url TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0
);

-- 2. Create portfolio_reviews table
CREATE TABLE IF NOT EXISTS portfolio_reviews (
  id BIGSERIAL PRIMARY KEY,
  author_name TEXT NOT NULL,
  author_title TEXT NOT NULL,
  review_text TEXT NOT NULL,
  avatar_url TEXT,
  display_order INT NOT NULL DEFAULT 0
);

-- 3. Enable Row Level Security (read-only public access by default)
ALTER TABLE portfolio_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access on portfolio_certificates"
  ON portfolio_certificates FOR SELECT
  USING (true);

CREATE POLICY "Allow public read access on portfolio_reviews"
  ON portfolio_reviews FOR SELECT
  USING (true);

-- Enable write access for Anon Key (client mode)
CREATE POLICY "Allow anon insert on portfolio_certificates" ON portfolio_certificates FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update on portfolio_certificates" ON portfolio_certificates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on portfolio_certificates" ON portfolio_certificates FOR DELETE USING (true);

CREATE POLICY "Allow anon insert on portfolio_reviews" ON portfolio_reviews FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update on portfolio_reviews" ON portfolio_reviews FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on portfolio_reviews" ON portfolio_reviews FOR DELETE USING (true);

-- ==========================================
-- Seed Data: Certificates & Credentials
-- ==========================================

INSERT INTO portfolio_certificates (certificate_id, title, issuer, date, link, image_url, display_order) VALUES
  ('google-digital-marketing', 'Google Digital Marketing & E-commerce', 'Google', 'Issued Jan 2025', '#', 'https://images.pexels.com/photos/669615/pexels-photo-669615.jpeg?auto=compress&cs=tinysrgb&w=1200', 1),
  ('meta-social-media', 'Meta Social Media Marketing', 'Meta', 'Issued Mar 2025', '#', 'https://images.pexels.com/photos/3861964/pexels-photo-3861964.jpeg?auto=compress&cs=tinysrgb&w=1200', 2),
  ('google-ux-design', 'Google UX Design Professional', 'Google', 'Issued Jun 2024', '#', 'https://images.pexels.com/photos/955389/pexels-photo-955389.jpeg?auto=compress&cs=tinysrgb&w=1200', 3),
  ('hubspot-content', 'Content Marketing Certification', 'HubSpot Academy', 'Issued Sep 2024', '#', 'https://images.pexels.com/photos/5908755/pexels-photo-5908755.jpeg?auto=compress&cs=tinysrgb&w=1200', 4),
  ('responsive-web-design', 'Responsive Web Design', 'freeCodeCamp', 'Issued Nov 2024', '#', 'https://images.pexels.com/photos/461064/pexels-photo-461064.jpeg?auto=compress&cs=tinysrgb&w=1200', 5),
  ('google-analytics', 'Google Analytics Certification', 'Google', 'Issued Feb 2025', '#', 'https://images.pexels.com/photos/669610/pexels-photo-669610.jpeg?auto=compress&cs=tinysrgb&w=1200', 6),
  ('husay-2026', 'HUSAY 2026 Video Editing Project Credential', 'Project Credential', 'Issued 2026', 'https://www.facebook.com/reel/950207200710625', '/husay-2026-certificate-preview.svg', 7)
ON CONFLICT (certificate_id) DO UPDATE SET
  title = EXCLUDED.title,
  issuer = EXCLUDED.issuer,
  date = EXCLUDED.date,
  link = EXCLUDED.link,
  image_url = EXCLUDED.image_url,
  display_order = EXCLUDED.display_order;

-- ==========================================
-- Seed Data: Client Reviews (Feedback)
-- ==========================================

INSERT INTO portfolio_reviews (author_name, author_title, review_text, avatar_url, display_order) VALUES
  ('Marcus Rivera', 'Small Business Owner', 'Since integrating Vincent''s design solutions into our workflow, we''ve experienced a significant improvement in brand engagement and online presence.', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop&crop=face', 1),
  ('David Park', 'Project Manager', 'I''ve tested numerous options in this category, but Vincent stands out for his intuitive design approach and comprehensive understanding of our needs.', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=100&h=100&fit=crop&crop=face', 2),
  ('Sarah Chen', 'Operations Manager', 'The results we''ve seen have surpassed our expectations, providing invaluable creative support as our business continues to grow.', 'https://images.unsplash.com/photo-1494790108755-2616b612b786?w=100&h=100&fit=crop&crop=face', 3);
