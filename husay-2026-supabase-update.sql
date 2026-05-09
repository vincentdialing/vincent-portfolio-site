-- HUSAY 2026 portfolio content update
-- Run this in your Supabase SQL editor if you want to update the live project entry.
-- This targets the existing motion graphics project key shown in the site URL: mg-3

UPDATE portfolio_projects
SET
  service_key = 'video-editing',
  title = 'HUSAY 2026 Official Event Video',
  category = 'End-to-End Video Production',
  description = 'Executed the full post-production workflow for the HUSAY 2026 official event video, transforming a script-based direction into a polished Facebook-ready production published by Dr. Shirley C. Agrupis, Chairperson of the Commission on Higher Education in the Philippines.',
  gradient = 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
  tools = ARRAY['Adobe Premiere Pro', 'Adobe After Effects', 'CapCut'],
  details = jsonb_build_array(
    jsonb_build_object(
      'type', 'text',
      'content', 'Handled the project end-to-end as the sole video editor, using the provided script as a creative starting point and personally managing clip selection, sequencing, audio pacing, sound effects, transitions, timing, and the overall emotional rhythm to turn the piece into a polished, high-retention event video from the ground up.'
    ),
    jsonb_build_object(
      'type', 'video',
      'url', 'https://www.facebook.com/reel/950207200710625',
      'thumbnail', '',
      'caption', 'Official HUSAY 2026 event video published on Facebook',
      'duration', ''
    ),
    jsonb_build_object(
      'type', 'link',
      'url', 'https://www.facebook.com/reel/950207200710625',
      'label', 'Watch the published official video'
    ),
    jsonb_build_object(
      'type', 'certificate',
      'certificateId', 'husay-2026',
      'label', 'View the supporting certificate'
    )
  )
WHERE project_key = 'mg-3';
