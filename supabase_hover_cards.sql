-- =============================================
-- SQL Commands for Supabase Hover Cards Tables
-- Run these in your Supabase SQL Editor
-- =============================================

-- Table 1: location_card (for "Based In" Davao City card)
CREATE TABLE location_card (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL DEFAULT 'Location',
  title TEXT NOT NULL DEFAULT 'Davao City',
  description TEXT NOT NULL DEFAULT 'Philippines'' safest city & innovation hub.',
  image_url TEXT DEFAULT 'https://placehold.co/600x400/222222/ffffff?text=Davao+City',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default data for location_card
INSERT INTO location_card (label, title, description, image_url)
VALUES ('Location', 'Davao City', 'Philippines'' safest city & innovation hub.', 'https://placehold.co/600x400/222222/ffffff?text=Davao+City');


-- Table 2: community_cards (for rotating Community card)
CREATE TABLE community_cards (
  id BIGSERIAL PRIMARY KEY,
  display_order INT NOT NULL DEFAULT 1,
  label TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  image_url TEXT DEFAULT 'https://placehold.co/600x400/222222/ffffff?text=Community',
  gradient_class TEXT DEFAULT 'gradient-cyan',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default data for community_cards (2 rotating items)
INSERT INTO community_cards (display_order, label, title, description, image_url, gradient_class)
VALUES 
  (1, 'Achievement', 'Hackathon Champion', 'DevFest & Startup Weekend winner.', 'https://placehold.co/600x400/222222/ffffff?text=Hackathon', 'gradient-cyan'),
  (2, 'Role', 'Community Leader', 'Google Developer Groups volunteer.', 'https://placehold.co/600x400/222222/ffffff?text=GDG', 'gradient-purple');


-- Enable Row Level Security (RLS) for public read access
ALTER TABLE location_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_cards ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Allow public read access on location_card" ON location_card FOR SELECT USING (true);
CREATE POLICY "Allow public read access on community_cards" ON community_cards FOR SELECT USING (true);
