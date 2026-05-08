# Supabase Keepalive Setup

This repo includes a GitHub Actions workflow that sends a lightweight request to Supabase every 3 days.

## Why this exists

Supabase Free projects are paused after 1 week of inactivity, according to Supabase pricing/docs:

- https://supabase.com/pricing

This workflow helps keep the project active by hitting a public table through the REST API.

## One-time GitHub setup

Add these repository secrets in GitHub:

1. `SUPABASE_URL`
   - Example: `https://your-project-ref.supabase.co`

2. `SUPABASE_ANON_KEY`
   - Use the same anon key your frontend uses

GitHub path:

- `Repo > Settings > Secrets and variables > Actions > New repository secret`

## Workflow file

- `.github/workflows/supabase-keepalive.yml`

## Notes

- The workflow runs every 3 days and can also be triggered manually with `workflow_dispatch`.
- It calls:
  - `GET /rest/v1/brands?select=id&limit=1`
- If you later rename/remove the `brands` table, update the workflow to ping another lightweight public table.
- GitHub Docs notes that scheduled workflows in a public repository can be automatically disabled after 60 days of no repository activity. If that happens, re-enable the workflow in the repo's `Actions` tab.
- This is a practical workaround, not an official Supabase feature guarantee. If Supabase changes how inactivity is measured, the only guaranteed way to prevent pausing is upgrading to Pro.
