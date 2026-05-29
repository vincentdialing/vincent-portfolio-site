-- ==========================================
-- Enable Anon Writes for Admin Dashboard
-- ==========================================
-- Run this in your Supabase SQL Editor.
-- This replaces the deny-write policies with allow-write policies
-- so the admin dashboard can work directly with the Anon Key.
--
-- IMPORTANT: Service Role keys are now blocked by Supabase from browser
-- origins. The admin dashboard must use the Anon Key + permissive RLS.
-- ==========================================

-- portfolio_services
DROP POLICY IF EXISTS "Deny client inserts on portfolio_services" ON public.portfolio_services;
DROP POLICY IF EXISTS "Deny client update on portfolio_services" ON public.portfolio_services;
DROP POLICY IF EXISTS "Deny client delete on portfolio_services" ON public.portfolio_services;

CREATE POLICY "Allow anon insert on portfolio_services"
  ON public.portfolio_services FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Allow anon update on portfolio_services"
  ON public.portfolio_services FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on portfolio_services"
  ON public.portfolio_services FOR DELETE
  USING (true);

-- portfolio_projects (insert was already denied, update was allowed, delete was denied)
DROP POLICY IF EXISTS "Deny client inserts on portfolio_projects" ON public.portfolio_projects;
DROP POLICY IF EXISTS "Allow portfolio project inserts" ON public.portfolio_projects;
DROP POLICY IF EXISTS "Allow portfolio project updates" ON public.portfolio_projects;
DROP POLICY IF EXISTS "Deny client delete on portfolio_projects" ON public.portfolio_projects;

CREATE POLICY "Allow anon insert on portfolio_projects"
  ON public.portfolio_projects FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Allow anon update on portfolio_projects"
  ON public.portfolio_projects FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on portfolio_projects"
  ON public.portfolio_projects FOR DELETE
  USING (true);

-- brands
DROP POLICY IF EXISTS "Deny client inserts on brands" ON public.brands;
DROP POLICY IF EXISTS "Deny client update on brands" ON public.brands;
DROP POLICY IF EXISTS "Deny client delete on brands" ON public.brands;

CREATE POLICY "Allow anon insert on brands"
  ON public.brands FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Allow anon update on brands"
  ON public.brands FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on brands"
  ON public.brands FOR DELETE
  USING (true);

-- community_cards
DROP POLICY IF EXISTS "Deny client inserts on community_cards" ON public.community_cards;
DROP POLICY IF EXISTS "Deny client update on community_cards" ON public.community_cards;
DROP POLICY IF EXISTS "Deny client delete on community_cards" ON public.community_cards;

CREATE POLICY "Allow anon insert on community_cards"
  ON public.community_cards FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Allow anon update on community_cards"
  ON public.community_cards FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on community_cards"
  ON public.community_cards FOR DELETE
  USING (true);

-- location_card
DROP POLICY IF EXISTS "Deny client inserts on location_card" ON public.location_card;
DROP POLICY IF EXISTS "Deny client update on location_card" ON public.location_card;
DROP POLICY IF EXISTS "Deny client delete on location_card" ON public.location_card;

CREATE POLICY "Allow anon insert on location_card"
  ON public.location_card FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Allow anon update on location_card"
  ON public.location_card FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on location_card"
  ON public.location_card FOR DELETE
  USING (true);

-- portfolio_project_images
DROP POLICY IF EXISTS "Deny client inserts on portfolio_project_images" ON public.portfolio_project_images;
DROP POLICY IF EXISTS "Deny client update on portfolio_project_images" ON public.portfolio_project_images;
DROP POLICY IF EXISTS "Deny client delete on portfolio_project_images" ON public.portfolio_project_images;

CREATE POLICY "Allow anon insert on portfolio_project_images"
  ON public.portfolio_project_images FOR INSERT
  WITH CHECK (true);
CREATE POLICY "Allow anon update on portfolio_project_images"
  ON public.portfolio_project_images FOR UPDATE
  USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete on portfolio_project_images"
  ON public.portfolio_project_images FOR DELETE
  USING (true);

-- Re-grant table privileges to anon and authenticated roles
GRANT ALL ON TABLE public.portfolio_services TO anon, authenticated;
GRANT ALL ON TABLE public.portfolio_projects TO anon, authenticated;
GRANT ALL ON TABLE public.brands TO anon, authenticated;
GRANT ALL ON TABLE public.community_cards TO anon, authenticated;
GRANT ALL ON TABLE public.location_card TO anon, authenticated;
GRANT ALL ON TABLE public.portfolio_project_images TO anon, authenticated;

-- Verify
SELECT schemaname, tablename, policyname, permissive, cmd
FROM pg_policies
WHERE tablename IN ('portfolio_services','portfolio_projects','brands','community_cards','location_card','portfolio_project_images')
ORDER BY tablename, cmd;

-- ==========================================
-- 3. Enable Storage uploads/updates/deletes for the 'portfolio' bucket
-- ==========================================
-- Run this to allow direct client-side uploads using the Anon Key.
-- (If the 'portfolio' bucket does not exist, create it in your Supabase Dashboard Storage first)

-- Drop existing if any
DROP POLICY IF EXISTS "Allow anon uploads to portfolio bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon updates to portfolio bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow anon deletes from portfolio bucket" ON storage.objects;
DROP POLICY IF EXISTS "Allow public select from portfolio bucket" ON storage.objects;

-- Create policies
CREATE POLICY "Allow anon uploads to portfolio bucket"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'portfolio');

CREATE POLICY "Allow anon updates to portfolio bucket"
  ON storage.objects FOR UPDATE
  TO public
  USING (bucket_id = 'portfolio')
  WITH CHECK (bucket_id = 'portfolio');

CREATE POLICY "Allow anon deletes from portfolio bucket"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'portfolio');

CREATE POLICY "Allow public select from portfolio bucket"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'portfolio');

