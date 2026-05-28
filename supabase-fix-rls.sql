-- ==========================================
-- Supabase RLS Hardening for portfolio tables
-- Run this in your Supabase project's SQL editor (Queries)
-- ==========================================

-- 1) Ensure Row Level Security is enabled on portfolio tables
ALTER TABLE IF EXISTS public.portfolio_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.portfolio_projects ENABLE ROW LEVEL SECURITY;
-- Also enable and harden RLS for other tables flagged by Security Advisor
ALTER TABLE IF EXISTS public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.community_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.location_card ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.portfolio_project_images ENABLE ROW LEVEL SECURITY;

-- 2) Revoke default public table privileges to avoid accidental broad grants
REVOKE ALL ON TABLE public.portfolio_services FROM public;
REVOKE ALL ON TABLE public.portfolio_projects FROM public;
REVOKE ALL ON TABLE public.brands FROM public;
REVOKE ALL ON TABLE public.community_cards FROM public;
REVOKE ALL ON TABLE public.location_card FROM public;
REVOKE ALL ON TABLE public.portfolio_project_images FROM public;

-- 3) Create explicit policies
-- Allow public (anon) to READ only (SELECT). If you want only authenticated users to read,
-- replace USING (true) with USING (auth.role() = 'authenticated').
DROP POLICY IF EXISTS "Allow anon read on portfolio_services" ON public.portfolio_services;
CREATE POLICY "Allow anon read on portfolio_services"
  ON public.portfolio_services FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow anon read on portfolio_projects" ON public.portfolio_projects;
CREATE POLICY "Allow anon read on portfolio_projects"
  ON public.portfolio_projects FOR SELECT
  USING (true);

-- Repeat safe read + deny-write policies for additional tables
DROP POLICY IF EXISTS "Allow anon read on brands" ON public.brands;
CREATE POLICY "Allow anon read on brands"
  ON public.brands FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow anon read on community_cards" ON public.community_cards;
CREATE POLICY "Allow anon read on community_cards"
  ON public.community_cards FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow anon read on location_card" ON public.location_card;
CREATE POLICY "Allow anon read on location_card"
  ON public.location_card FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow anon read on portfolio_project_images" ON public.portfolio_project_images;
CREATE POLICY "Allow anon read on portfolio_project_images"
  ON public.portfolio_project_images FOR SELECT
  USING (true);

-- Block all client-side writes (INSERT / UPDATE / DELETE) so only server-side
-- processes using the `service_role` key can modify data. This prevents
-- any browser/anon/authenticated user from deleting or changing rows.
DROP POLICY IF EXISTS "Deny client inserts on portfolio_services" ON public.portfolio_services;
CREATE POLICY "Deny client inserts on portfolio_services"
  ON public.portfolio_services FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client inserts on portfolio_projects" ON public.portfolio_projects;
CREATE POLICY "Deny client inserts on portfolio_projects"
  ON public.portfolio_projects FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client inserts on brands" ON public.brands;
CREATE POLICY "Deny client inserts on brands"
  ON public.brands FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client inserts on community_cards" ON public.community_cards;
CREATE POLICY "Deny client inserts on community_cards"
  ON public.community_cards FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client inserts on location_card" ON public.location_card;
CREATE POLICY "Deny client inserts on location_card"
  ON public.location_card FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client inserts on portfolio_project_images" ON public.portfolio_project_images;
CREATE POLICY "Deny client inserts on portfolio_project_images"
  ON public.portfolio_project_images FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "Deny client update on portfolio_services" ON public.portfolio_services;
DROP POLICY IF EXISTS "Deny client delete on portfolio_services" ON public.portfolio_services;
CREATE POLICY "Deny client update on portfolio_services"
  ON public.portfolio_services FOR UPDATE
  USING (false);
CREATE POLICY "Deny client delete on portfolio_services"
  ON public.portfolio_services FOR DELETE
  USING (false);

DROP POLICY IF EXISTS "Deny client update on portfolio_projects" ON public.portfolio_projects;
DROP POLICY IF EXISTS "Deny client delete on portfolio_projects" ON public.portfolio_projects;
CREATE POLICY "Deny client update on portfolio_projects"
  ON public.portfolio_projects FOR UPDATE
  USING (false);
CREATE POLICY "Deny client delete on portfolio_projects"
  ON public.portfolio_projects FOR DELETE
  USING (false);

DROP POLICY IF EXISTS "Deny client update on brands" ON public.brands;
DROP POLICY IF EXISTS "Deny client delete on brands" ON public.brands;
CREATE POLICY "Deny client update on brands"
  ON public.brands FOR UPDATE
  USING (false);
CREATE POLICY "Deny client delete on brands"
  ON public.brands FOR DELETE
  USING (false);

DROP POLICY IF EXISTS "Deny client update on community_cards" ON public.community_cards;
DROP POLICY IF EXISTS "Deny client delete on community_cards" ON public.community_cards;
CREATE POLICY "Deny client update on community_cards"
  ON public.community_cards FOR UPDATE
  USING (false);
CREATE POLICY "Deny client delete on community_cards"
  ON public.community_cards FOR DELETE
  USING (false);

DROP POLICY IF EXISTS "Deny client update on location_card" ON public.location_card;
DROP POLICY IF EXISTS "Deny client delete on location_card" ON public.location_card;
CREATE POLICY "Deny client update on location_card"
  ON public.location_card FOR UPDATE
  USING (false);
CREATE POLICY "Deny client delete on location_card"
  ON public.location_card FOR DELETE
  USING (false);

DROP POLICY IF EXISTS "Deny client update on portfolio_project_images" ON public.portfolio_project_images;
DROP POLICY IF EXISTS "Deny client delete on portfolio_project_images" ON public.portfolio_project_images;
CREATE POLICY "Deny client update on portfolio_project_images"
  ON public.portfolio_project_images FOR UPDATE
  USING (false);
CREATE POLICY "Deny client delete on portfolio_project_images"
  ON public.portfolio_project_images FOR DELETE
  USING (false);

-- Notes:
-- - The `service_role` key bypasses RLS; use it only from secure server-side environments.
-- - If your site needs truly public read access, keep the SELECT policies as-is (USING (true)).
--   If not, change SELECT policies to `USING (auth.role() = 'authenticated')`.
-- - After running this, test unauthenticated access from the browser to ensure expected behavior.

-- Optional: Log which policies were applied (for visibility)
SELECT * FROM pg_policies WHERE tablename IN ('portfolio_services','portfolio_projects');

-- ==========================================
-- Storage hardening note for the `portfolio` bucket
-- ==========================================
-- The `storage.objects` table is owned by Supabase's storage service role,
-- so this project SQL file cannot change it from the SQL editor unless your
-- current role is the table owner.
--
-- To remove bucket listing for `storage.portfolio`, update the bucket/object
-- policies in the Supabase dashboard Storage policy UI or run the storage
-- policy SQL as the storage owner/admin role.
